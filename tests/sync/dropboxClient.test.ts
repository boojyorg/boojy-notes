import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  createDropboxRemote,
  createPkce,
  DropboxHttpError,
  exchangeCode,
  headerJson,
  MAX_SINGLE_UPLOAD,
  refreshingToken,
} from "../../src/sync/dropboxClient";
import { CursorResetError, RemoteConflictError, RemoteNotFoundError } from "../../src/sync/types";

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fetch that records each request and answers from the queue. */
function fakeFetch(...answers: Response[]) {
  const sent: Sent[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body;
    sent.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body:
        typeof body === "string"
          ? JSON.parse(body)
          : body instanceof URLSearchParams
            ? Object.fromEntries(body)
            : body,
    });
    const answer = answers.shift();
    if (!answer) throw new Error(`unexpected request to ${url}`);
    return answer;
  };
  return { fetch: fetch as typeof globalThis.fetch, sent };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });
const error = (status: number, summary: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error_summary: summary }), { status, headers });

const fileMeta = (path: string, extra: object = {}) => ({
  ".tag": "file",
  path_display: path,
  path_lower: path.toLowerCase(),
  id: "id:abc",
  rev: "015f",
  content_hash: "hash",
  ...extra,
});

const remoteWith = (...answers: Response[]) => {
  const f = fakeFetch(...answers);
  return {
    ...f,
    remote: createDropboxRemote({ root: "/Test", token: async () => "T", fetch: f.fetch }),
  };
};

describe("createDropboxRemote", () => {
  it("lists the vault recursively, with paths relative to it and the vault itself left out", async () => {
    const { remote, sent } = remoteWith(
      json({
        entries: [
          { ".tag": "folder", path_display: "/Test", path_lower: "/test" },
          { ".tag": "folder", path_display: "/Test/Ideas", path_lower: "/test/ideas" },
          fileMeta("/Test/Ideas/Plan.md"),
          { ".tag": "deleted", path_display: "/Test/Gone.md", path_lower: "/test/gone.md" },
        ],
        cursor: "C1",
        has_more: true,
      }),
    );
    const page = await remote.list();
    expect(sent[0].url).toBe("https://api.dropboxapi.com/2/files/list_folder");
    expect(sent[0].headers.Authorization).toBe("Bearer T");
    expect(sent[0].body).toEqual({ path: "/Test", recursive: true, include_deleted: false });
    expect(page).toEqual({
      entries: [
        { kind: "folder", path: "Ideas" },
        { kind: "file", path: "Ideas/Plan.md", id: "id:abc", rev: "015f", hash: "hash" },
        { kind: "deleted", path: "Gone.md" },
      ],
      cursor: "C1",
      hasMore: true,
    });
  });

  it("works at the app folder's own root", async () => {
    const f = fakeFetch(json({ entries: [fileMeta("/A.md")], cursor: "C", has_more: false }));
    const remote = createDropboxRemote({ root: "", token: async () => "T", fetch: f.fetch });
    const page = await remote.list();
    expect(f.sent[0].body).toMatchObject({ path: "" });
    expect(page.entries[0]).toMatchObject({ path: "A.md" });
  });

  it("turns an expired cursor into CursorResetError", async () => {
    const { remote } = remoteWith(error(409, "reset/..."));
    await expect(remote.listContinue("old")).rejects.toBeInstanceOf(CursorResetError);
  });

  it("downloads with the path in an ASCII-only header and reads the metadata back", async () => {
    const { remote, sent } = remoteWith(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Dropbox-API-Result": JSON.stringify(fileMeta("/Test/Café.md")) },
      }),
    );
    const got = await remote.download("Café.md");
    expect(sent[0].url).toBe("https://content.dropboxapi.com/2/files/download");
    expect(sent[0].headers["Dropbox-API-Arg"]).toBe('{"path":"/Test/Caf\\u00e9.md"}');
    expect(got.file.path).toBe("Café.md");
    expect(got.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("uploads only over the named revision, strictly, never renaming", async () => {
    const { remote, sent } = remoteWith(json(fileMeta("/Test/A.md", { rev: "0160" })));
    const file = await remote.upload("A.md", new Uint8Array([9]), { kind: "update", rev: "015f" });
    expect(JSON.parse(sent[0].headers["Dropbox-API-Arg"])).toEqual({
      path: "/Test/A.md",
      mode: { ".tag": "update", update: "015f" },
      autorename: false,
      mute: true,
      strict_conflict: true,
    });
    expect(file.rev).toBe("0160");
  });

  it("adds a new file only where nothing is", async () => {
    const { remote, sent } = remoteWith(error(409, "path/conflict/file/.."));
    await expect(remote.upload("A.md", new Uint8Array(), { kind: "add" })).rejects.toBeInstanceOf(
      RemoteConflictError,
    );
    expect(JSON.parse(sent[0].headers["Dropbox-API-Arg"]).mode).toBe("add");
  });

  it("refuses a file over the single-upload limit before sending it", async () => {
    const { remote, sent } = remoteWith();
    const big = { length: MAX_SINGLE_UPLOAD + 1 } as Uint8Array;
    await expect(remote.upload("Big.mov", big, { kind: "add" })).rejects.toBeInstanceOf(
      DropboxHttpError,
    );
    expect(sent).toHaveLength(0);
  });

  it("moves a file by its id, without renaming, and reports a missing source", async () => {
    const { remote, sent } = remoteWith(
      json({ metadata: fileMeta("/Test/B.md") }),
      error(409, "from_lookup/not_found/.."),
    );
    expect((await remote.move("id:a1", "B.md")).path).toBe("B.md");
    expect(sent[0].body).toEqual({
      from_path: "id:a1",
      to_path: "/Test/B.md",
      autorename: false,
    });
    await expect(remote.move("id:a1", "B.md")).rejects.toBeInstanceOf(RemoteNotFoundError);
  });

  it("deletes only the revision it saw", async () => {
    const { remote, sent } = remoteWith(json({ metadata: fileMeta("/Test/A.md") }));
    await remote.remove("A.md", "015f");
    expect(sent[0].body).toEqual({ path: "/Test/A.md", parent_rev: "015f" });
  });

  it("treats a folder that already exists as made", async () => {
    const { remote } = remoteWith(error(409, "path/conflict/folder/.."));
    await expect(remote.createFolder("Ideas")).resolves.toBeUndefined();
  });

  it("makes the vault's own folder", async () => {
    const { remote, sent } = remoteWith(json({ metadata: {} }));
    await remote.createFolder("");
    expect(sent[0].body).toEqual({ path: "/Test", autorename: false });
  });

  it("passes on rate limits with how long to wait", async () => {
    const { remote } = remoteWith(error(429, "too_many_requests/..", { "Retry-After": "7" }));
    const failure = await remote.list().catch((e) => e);
    expect(failure).toBeInstanceOf(DropboxHttpError);
    expect(failure.retryAfter).toBe(7);
  });

  it("long-polls the notify host without a token", async () => {
    const { remote, sent } = remoteWith(json({ changes: true, backoff: 5 }));
    expect(await remote.longpoll("C1")).toEqual({ changes: true, backoff: 5 });
    expect(sent[0].url).toBe("https://notify.dropboxapi.com/2/files/list_folder/longpoll");
    expect(sent[0].headers.Authorization).toBeUndefined();
    expect(sent[0].body).toEqual({ cursor: "C1", timeout: 30 });
  });
});

describe("signing in", () => {
  it("makes a verifier and its S256 challenge", async () => {
    const { verifier, challenge } = await createPkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(challenge).toBe(expected);
  });

  it("asks for an offline (refresh) token with PKCE", () => {
    const url = new URL(
      authorizeUrl({
        clientId: "KEY",
        redirectUri: "http://localhost:53682/callback",
        challenge: "CH",
        state: "S",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://www.dropbox.com/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "KEY",
      response_type: "code",
      code_challenge: "CH",
      code_challenge_method: "S256",
      token_access_type: "offline",
      redirect_uri: "http://localhost:53682/callback",
      state: "S",
    });
  });

  it("exchanges the code with the verifier and no secret", async () => {
    const f = fakeFetch(
      json({ access_token: "A", expires_in: 14400, refresh_token: "R", account_id: "dbid:1" }),
    );
    const tokens = await exchangeCode({
      clientId: "KEY",
      code: "CODE",
      verifier: "V",
      redirectUri: "http://localhost:53682/callback",
      fetch: f.fetch,
      now: () => 1000,
    });
    expect(f.sent[0].body).toEqual({
      grant_type: "authorization_code",
      code: "CODE",
      client_id: "KEY",
      code_verifier: "V",
      redirect_uri: "http://localhost:53682/callback",
    });
    expect(tokens).toEqual({
      accessToken: "A",
      expiresAt: 1000 + 14400 * 1000,
      refreshToken: "R",
      accountId: "dbid:1",
    });
  });

  it("refreshes the access token only near its expiry", async () => {
    let clock = 0;
    const f = fakeFetch(
      json({ access_token: "A1", expires_in: 3600 }),
      json({ access_token: "A2", expires_in: 3600 }),
    );
    const token = refreshingToken({
      clientId: "KEY",
      refreshToken: "R",
      fetch: f.fetch,
      now: () => clock,
    });
    expect(await token()).toBe("A1");
    clock = 3_000_000;
    expect(await token()).toBe("A1");
    clock = 3_550_000;
    expect(await token()).toBe("A2");
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1].body).toEqual({
      grant_type: "refresh_token",
      refresh_token: "R",
      client_id: "KEY",
    });
  });

  it("escapes every non-ASCII character in header JSON", () => {
    expect(headerJson({ path: "/日記 😀.md" })).toBe(
      '{"path":"/\\u65e5\\u8a18 \\ud83d\\ude00.md"}',
    );
  });
});
