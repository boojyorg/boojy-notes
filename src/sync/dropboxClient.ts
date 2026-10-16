import {
  CursorResetError,
  type ListPage,
  type Remote,
  RemoteConflictError,
  type RemoteEntry,
  type RemoteFile,
  RemoteNotFoundError,
  type WriteMode,
} from "./types";

/**
 * Dropbox's HTTP API as the sync engine's Remote, with app-folder access:
 * every path is inside `Apps/Boojy Notes/`, which Dropbox calls the root.
 * `root` is the vault's folder there (`/test`), or "" for the app folder itself.
 * Plain `fetch`, no SDK: the engine needs eight calls.
 * https://www.dropbox.com/developers/documentation/http/documentation
 */

const API = "https://api.dropboxapi.com/2/";
const CONTENT = "https://content.dropboxapi.com/2/";
const NOTIFY = "https://notify.dropboxapi.com/2/";
const AUTHORIZE = "https://www.dropbox.com/oauth2/authorize";
const TOKEN = "https://api.dropboxapi.com/oauth2/token";

/** `files/upload` takes at most 150 MB; larger files need an upload session (not built yet). */
export const MAX_SINGLE_UPLOAD = 150 * 1024 * 1024;

type Fetch = typeof fetch;

/** A failure that is not one of the engine's conditions: the pass stops and is retried later. */
export class DropboxHttpError extends Error {
  name = "DropboxHttpError";
  constructor(
    readonly status: number,
    readonly summary: string,
    /** Seconds to wait, from `Retry-After` on 429 and 503. */
    readonly retryAfter: number | null,
  ) {
    super(`Dropbox ${status}: ${summary}`);
  }
}

/** JSON for a header. Dropbox wants ASCII there, so other characters travel as `\uXXXX`. */
export const headerJson = (value: unknown) =>
  JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );

interface Metadata {
  ".tag": "file" | "folder" | "deleted";
  path_display: string;
  path_lower: string;
  id?: string;
  rev?: string;
  content_hash?: string;
}

/** Turns a failed response into the engine's errors where one fits. */
async function failure(res: Response): Promise<Error> {
  const body = await res.text();
  let summary = body;
  try {
    summary = JSON.parse(body).error_summary ?? body;
  } catch {
    // Not JSON: keep the text.
  }
  if (res.status === 409) {
    if (summary.startsWith("reset/")) return new CursorResetError(summary);
    if (summary.includes("not_found")) return new RemoteNotFoundError(summary);
    if (summary.includes("conflict")) return new RemoteConflictError(summary);
  }
  const retry = res.headers.get("Retry-After");
  return new DropboxHttpError(res.status, summary, retry ? Number(retry) : null);
}

export interface DropboxRemote extends Remote {
  /** Waits up to `timeout` seconds for a change after `cursor`. Needs no token. */
  longpoll(cursor: string, timeout?: number): Promise<{ changes: boolean; backoff: number }>;
}

export function createDropboxRemote({
  root,
  token,
  fetch: fetchImpl = fetch,
}: {
  root: string;
  token: () => Promise<string>;
  fetch?: Fetch;
}): DropboxRemote {
  const rootLower = root.toLowerCase();
  const full = (path: string) => (path ? `${root}/${path}` : root);
  const relative = (meta: Metadata) =>
    meta.path_lower === rootLower ? "" : meta.path_display.slice(root.length + 1);

  const toEntry = (meta: Metadata): RemoteEntry | null => {
    const path = relative(meta);
    if (!path) return null;
    if (meta[".tag"] === "folder") return { kind: "folder", path };
    if (meta[".tag"] === "deleted") return { kind: "deleted", path };
    return toFile(meta);
  };

  const toFile = (meta: Metadata): RemoteFile => ({
    kind: "file",
    path: relative(meta),
    id: meta.id ?? "",
    rev: meta.rev ?? "",
    hash: meta.content_hash ?? "",
  });

  async function send(url: string, init: RequestInit): Promise<Response> {
    const res = await fetchImpl(url, init);
    if (!res.ok) throw await failure(res);
    return res;
  }

  async function rpc<T>(endpoint: string, args: unknown): Promise<T> {
    const res = await send(API + endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    return res.json() as Promise<T>;
  }

  interface ListResult {
    entries: Metadata[];
    cursor: string;
    has_more: boolean;
  }

  const toPage = (result: ListResult): ListPage => ({
    entries: result.entries.map(toEntry).filter((e): e is RemoteEntry => e !== null),
    cursor: result.cursor,
    hasMore: result.has_more,
  });

  return {
    async list() {
      return toPage(
        await rpc<ListResult>("files/list_folder", {
          path: root,
          recursive: true,
          include_deleted: false,
        }),
      );
    },

    async listContinue(cursor) {
      return toPage(await rpc<ListResult>("files/list_folder/continue", { cursor }));
    },

    async download(path) {
      const res = await send(`${CONTENT}files/download`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await token()}`,
          "Dropbox-API-Arg": headerJson({ path: full(path) }),
        },
      });
      const meta = JSON.parse(res.headers.get("Dropbox-API-Result") ?? "{}") as Metadata;
      return { file: toFile(meta), bytes: new Uint8Array(await res.arrayBuffer()) };
    },

    async upload(path, bytes, mode: WriteMode) {
      if (bytes.length > MAX_SINGLE_UPLOAD) {
        throw new DropboxHttpError(413, `${path} is over 150 MB`, null);
      }
      const res = await send(`${CONTENT}files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await token()}`,
          "Content-Type": "application/octet-stream",
          "Dropbox-API-Arg": headerJson({
            path: full(path),
            mode: mode.kind === "add" ? "add" : { ".tag": "update", update: mode.rev },
            autorename: false,
            mute: true,
            // A conflict even when the file named by `rev` has since been deleted.
            strict_conflict: true,
          }),
        },
        body: bytes as Uint8Array<ArrayBuffer>,
      });
      return toFile((await res.json()) as Metadata);
    },

    async move(from, to) {
      const result = await rpc<{ metadata: Metadata }>("files/move_v2", {
        from_path: full(from),
        to_path: full(to),
        autorename: false,
      });
      return toFile(result.metadata);
    },

    async remove(path, rev) {
      await rpc("files/delete_v2", { path: full(path), parent_rev: rev });
    },

    async createFolder(path) {
      try {
        await rpc("files/create_folder_v2", { path: full(path), autorename: false });
      } catch (error) {
        if (!(error instanceof RemoteConflictError)) throw error;
      }
    },

    async longpoll(cursor, timeout = 30) {
      const res = await send(`${NOTIFY}files/list_folder/longpoll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor, timeout }),
      });
      const result = (await res.json()) as { changes: boolean; backoff?: number };
      return { changes: result.changes, backoff: result.backoff ?? 0 };
    },
  };
}

// ─── Signing in: OAuth with PKCE, no client secret (Boojy's code is public) ───

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** A one-off verifier and its challenge: proof that the app finishing sign-in is the one that began it. */
export async function createPkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** The page the person signs in on. `offline` asks for a refresh token, so the app stays signed in. */
export function authorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `${AUTHORIZE}?${params}`;
}

export interface Tokens {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  accountId?: string;
}

async function tokenRequest(fetchImpl: Fetch, form: Record<string, string>, now: number) {
  const res = await fetchImpl(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
  });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    account_id?: string;
  };
  return {
    accessToken: body.access_token,
    expiresAt: now + body.expires_in * 1000,
    refreshToken: body.refresh_token,
    accountId: body.account_id,
  } satisfies Tokens;
}

export function exchangeCode(opts: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
  fetch?: Fetch;
  now?: () => number;
}) {
  return tokenRequest(
    opts.fetch ?? fetch,
    {
      grant_type: "authorization_code",
      code: opts.code,
      client_id: opts.clientId,
      code_verifier: opts.verifier,
      redirect_uri: opts.redirectUri,
    },
    (opts.now ?? Date.now)(),
  );
}

/** An access token on demand, refreshed a minute before it expires. */
export function refreshingToken(opts: {
  clientId: string;
  refreshToken: string;
  fetch?: Fetch;
  now?: () => number;
}): () => Promise<string> {
  const now = opts.now ?? Date.now;
  let current: Tokens | null = null;
  return async () => {
    if (!current || current.expiresAt - now() < 60_000) {
      current = await tokenRequest(
        opts.fetch ?? fetch,
        { grant_type: "refresh_token", refresh_token: opts.refreshToken, client_id: opts.clientId },
        now(),
      );
    }
    return current.accessToken;
  };
}
