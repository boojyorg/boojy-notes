import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  authorizeUrl,
  createDropboxRemote,
  createPkce,
  exchangeCode,
  refreshingToken,
} from "../sync/dropboxClient";
import { type PassResult, syncPass } from "../sync/engine";
import { loadRecord } from "../sync/syncRecord";
import { createSyncRunner } from "../sync/syncRunner";
import { createSyncStatus, type FailureMeaning, SyncProblemError } from "../sync/syncStatus";
import { CursorResetError, type LocalStore } from "../sync/types";
import type { FileOps } from "./files";
import { SYNC_FOLDER } from "./syncFolder";

/**
 * Sign-in and sync for the phone, both optional: with no Dropbox connected
 * the notes are the phone's alone and nothing here reaches the network.
 *
 * **Connected is one file, the binding** (`state/binding.json`): the Dropbox
 * folder the notes sync with and the account it is in. A connect writes it
 * last, so one cut short leaves the notes unconnected. A binding whose
 * sign-in is missing or damaged is signed out, never unconnected, so nobody
 * is locked out and nothing is merged twice. **No pass reaches Dropbox's
 * files until the sign-in's account is the binding's** (`verify`, once per
 * sign-in): a leftover sign-in or a connect cut short can never sync one
 * account's notes against another's folder.
 *
 * A connect starts from no sync record, so the engine merges: notes only on
 * the phone go up, only in Dropbox come down, and one different on both is
 * kept twice. A disconnect forgets the record, then the binding, then the
 * sign-in, keeping every note. A note deleted while disconnected comes back
 * at the next connect, by design: a record kept for another folder would read
 * as every note deleted there.
 *
 * Dropbox's page opens in the phone's browser and comes back through
 * `boojynotes://oauth`, which the app answers. The refresh token is kept in
 * the app's private storage (the real app keeps it in Android's keystore).
 *
 * Sync runs while the app is open and connected: on opening and on coming
 * back to the front, a moment after a save, whenever Dropbox's long-poll says
 * the vault changed, and when Dropbox can be reached again after it could
 * not. The web view's `online` event is not relied on: on Android it did not
 * fire after aeroplane mode. A pass that fails is tried again later: when
 * Dropbox says (a 429 or 503's Retry-After), soon when it was out of reach,
 * slowly while a problem stands, and not at all while signed out or signed
 * in to another account.
 *
 * There is one worker (runner, long-poll, listeners) for the app's life: it
 * idles while disconnected, and connecting or signing in again swaps the
 * token it uses, never starts a second.
 */

const APP_KEY = "fupgkw6riwb8yrj"; // The Boojy Notes app key, which is public.
const REDIRECT = "boojynotes://oauth";
const SECRETS = "state/dropbox.json";
const BINDING = "state/binding.json";
const PENDING = "state/sign-in.json";
const SAVE_DELAY_MS = 1500;
const RETRY_MS = 15_000;
/** While a problem stands, a retry is a slow check that it has gone. */
const PROBLEM_RETRY_MS = 5 * 60_000;
/** Back from the browser with no answer from Dropbox in this long: cancelled. */
const SIGN_IN_GRACE_MS = 2000;

interface Secrets {
  refreshToken: string;
  /** Missing in a sign-in kept before accounts were checked. */
  accountId?: string;
}

/** The Dropbox folder the notes sync with, and the account it is in. */
interface Binding {
  folder: string;
  /** Missing in a binding made before accounts were bound: learnt before its first pass. */
  accountId?: string;
}

/** The phone's store, which also forgets what sync knew (the record) on a disconnect. */
export type PhoneSyncStore = LocalStore & { forgetSync(): Promise<void> };

/** Dropbox's page was closed without an answer: nothing changes, and nothing needs saying. */
export class SignInCancelled extends Error {
  name = "SignInCancelled";
  constructor() {
    super("the page was closed");
  }
}

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array | null) =>
  bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
const message = (error: unknown) => (error as Error)?.message ?? String(error);

/**
 * The kept sign-in. A file that doesn't read as one (damaged) is no sign-in:
 * a connected phone is then signed out, and signing in again replaces it.
 * Notes are untouched.
 */
export async function readSecrets(files: FileOps): Promise<Secrets | null> {
  try {
    const secrets = decode(await files.read(SECRETS));
    return typeof secrets?.refreshToken === "string" ? secrets : null;
  } catch {
    return null;
  }
}

/**
 * The binding, or null: no Dropbox connected. One that doesn't read as one
 * (damaged) is none; a connect replaces it, from no record.
 */
export async function readBinding(files: FileOps): Promise<Binding | null> {
  try {
    const binding = decode(await files.read(BINDING));
    return typeof binding?.folder === "string" ? binding : null;
  } catch {
    return null;
  }
}

const log = (...parts: unknown[]) => console.log("[sync]", ...parts);
const nothingDone = (): PassResult => ({ again: false, attention: [], log: [] });

export function createPhoneSync(files: FileOps, local: PhoneSyncStore) {
  const status = createSyncStatus();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  /**
   * Asks for a pass; one the person asked for (`byHand`) needn't wait out
   * Dropbox. Settles when that pass has, or at once when it waits.
   */
  let request: (byHand?: boolean) => Promise<void> = async () => {};
  /** Dropbox asked for no request before this (Retry-After), ms. */
  let notBefore = 0;
  /** What the notes sync with; null while they are the phone's alone. */
  let binding: Binding | null = null;
  let remote: ReturnType<typeof createDropboxRemote> | null = null;
  /** The kept sign-in; null while signed out. */
  let secrets: Secrets | null = null;
  /** The sign-in found to be the binding's account (its refresh token). */
  let verified: string | null = null;
  let token: () => Promise<string> = () => Promise.reject(new Error("not signed in"));
  /** The pass under way, which a disconnect waits out. */
  let inFlight: Promise<unknown> = Promise.resolve();
  let begun = false;

  const takeSecrets = (kept: Secrets | null) => {
    secrets = kept;
    token = kept
      ? refreshingToken({ clientId: APP_KEY, refreshToken: kept.refreshToken })
      : () => Promise.reject(new Error("not signed in"));
  };

  /**
   * Opens Dropbox's sign-in; resolves with the tokens once Dropbox sends the
   * browser back. Back in the app with no answer (the page closed) is a
   * cancel: the sign-in kept before is untouched.
   */
  async function signIn(): Promise<Secrets> {
    const { verifier, challenge } = await createPkce();
    const state = crypto.randomUUID();
    await files.write(PENDING, encode({ verifier, state }));
    let answered = false;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    const handles: Promise<{ remove: () => Promise<void> }>[] = [];
    const done = new Promise<Secrets>((resolve, reject) => {
      handles.push(
        App.addListener("appUrlOpen", async ({ url }) => {
          if (!url.startsWith(REDIRECT)) return;
          answered = true;
          clearTimeout(cancelTimer);
          try {
            const params = new URL(url.replace(REDIRECT, "https://localhost/oauth")).searchParams;
            const pending = decode(await files.read(PENDING));
            const code = params.get("code");
            if (!code || params.get("state") !== pending?.state) {
              throw new Error(params.get("error_description") ?? "Sign-in failed");
            }
            const tokens = await exchangeCode({
              clientId: APP_KEY,
              code,
              verifier: pending.verifier,
              redirectUri: REDIRECT,
            });
            if (!tokens.refreshToken) throw new Error("Dropbox gave no refresh token");
            await files.remove(PENDING);
            log("signed in", tokens.accountId);
            resolve({ refreshToken: tokens.refreshToken, accountId: tokens.accountId });
          } catch (error) {
            reject(error);
          } finally {
            Browser.close().catch(() => {});
          }
        }),
        App.addListener("resume", () => {
          if (answered) return;
          clearTimeout(cancelTimer);
          cancelTimer = setTimeout(() => {
            if (answered) return;
            files.remove(PENDING).catch(() => {});
            reject(new SignInCancelled());
          }, SIGN_IN_GRACE_MS);
        }),
      );
    });
    await Browser.open({
      url: authorizeUrl({ clientId: APP_KEY, redirectUri: REDIRECT, challenge, state }),
    });
    try {
      return await done;
    } finally {
      clearTimeout(cancelTimer);
      for (const handle of handles) (await handle).remove();
    }
  }

  const retryIn = (ms: number | null) => {
    clearTimeout(retry);
    if (ms !== null) retry = setTimeout(() => request(), ms);
  };
  const retryDelay = (meaning: FailureMeaning) => {
    if ("offline" in meaning) return meaning.retryAfterMs ?? RETRY_MS;
    const waitsForPerson = ["signed-out", "other-account"];
    if ("problem" in meaning && waitsForPerson.includes(meaning.problem.kind)) return null;
    return status.status().state === "problem" ? PROBLEM_RETRY_MS : RETRY_MS;
  };

  /**
   * Whether an account holds a file the record synced (Dropbox ids are one
   * account's own); any account does while nothing has synced.
   */
  async function holdsSyncedFiles(probe: ReturnType<typeof createDropboxRemote>) {
    const ids = Object.values((await loadRecord(local)).synced).map((s) => s.id);
    return ids.length === 0 || probe.holdsAnyOf(ids.slice(0, 10));
  }

  /**
   * Before a pass touches Dropbox's files: the sign-in's account must be the
   * binding's, else the pass stops with `other-account` and waits for the
   * person. A binding made before accounts were bound takes the account that
   * holds the record's files, and keeps its id from then on.
   */
  async function verify(bound: Binding, through: ReturnType<typeof createDropboxRemote>) {
    if (!secrets) throw new SyncProblemError({ kind: "signed-out" });
    const signedIn = secrets.refreshToken;
    if (verified === signedIn) return;
    if (bound.accountId) {
      if ((await through.accountId()) !== bound.accountId) {
        throw new SyncProblemError({ kind: "other-account" });
      }
    } else {
      if (!(await holdsSyncedFiles(through))) throw new SyncProblemError({ kind: "other-account" });
      bound.accountId = await through.accountId();
      await files.write(BINDING, encode(bound));
      log("bound to", bound.accountId);
    }
    verified = signedIn;
  }

  async function pass(): Promise<PassResult> {
    // Read once: a disconnect during the pass waits for it, against this folder.
    const bound = binding;
    const through = remote;
    if (!bound || !through) return nothingDone();
    const started = Date.now();
    status.started();
    try {
      await verify(bound, through);
      const result = await syncPass({ local, remote: through });
      for (const line of result.log) log(line);
      if (result.attention.length) log("needs attention:", JSON.stringify(result.attention));
      log(`pass done in ${Date.now() - started} ms${result.again ? ", another to follow" : ""}`);
      status.finished(result);
      return result;
    } catch (error) {
      log("pass failed:", message(error));
      const meaning = status.failed(error);
      if ("offline" in meaning && meaning.retryAfterMs !== null) {
        notBefore = Date.now() + meaning.retryAfterMs;
      }
      retryIn(retryDelay(meaning));
      throw error;
    }
  }

  /** Syncs `kept` from now, with `signIn` (null: signed out, said by the first pass). */
  function bind(kept: Binding, signIn: Secrets | null, { accountKnown = false } = {}) {
    binding = kept;
    remote = createDropboxRemote({ root: `/${kept.folder}`, token: () => token() });
    takeSecrets(signIn);
    verified = accountKnown && signIn ? signIn.refreshToken : null;
    notBefore = 0;
    status.connected(kept.folder);
    request();
  }

  /** Sets the one worker going, and syncs the bound folder if there is one. Once per app. */
  async function start() {
    if (begun) return;
    begun = true;
    // Each pass reports once, however many requests waited on it.
    const runner = createSyncRunner(() => {
      const running = pass();
      inFlight = running.catch(() => {});
      return running;
    });
    request = (byHand = false) => {
      if (!binding) return Promise.resolve();
      // A save, a return or a reconnect waits out Dropbox's wait: the retry
      // set for its end runs the pass.
      if (!byHand && Date.now() < notBefore) {
        retryIn(notBefore - Date.now());
        return Promise.resolve();
      }
      clearTimeout(retry);
      return runner
        .request()
        .then((result) => {
          // The runner stopped repeating with work still to do: come back to it.
          if (result.again) retryIn(RETRY_MS);
        })
        .catch(() => {}); // Reported, and its retry set, by the pass.
    };

    let active = true;
    App.addListener("appStateChange", ({ isActive }) => {
      active = isActive;
      if (isActive) request();
    });
    window.addEventListener("online", () => request());
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const cursorNow = async () => {
      const record = await local.loadRecord();
      return record ? JSON.parse(record).cursor : null;
    };

    // Dropbox answers a long-poll when the vault changes; each answer asks
    // for a pass. Only for a sign-in verified as the binding's account.
    (async () => {
      let unreachable = false;
      for (;;) {
        try {
          const through = remote;
          const ready = !!binding && !!secrets && verified === secrets.refreshToken;
          const cursor = ready ? await cursorNow() : null;
          if (!active || !through || !cursor) {
            await wait(5000);
            continue;
          }
          const { changes, backoff } = await through.longpoll(cursor);
          // Reachable again: what was saved meanwhile goes up now.
          const ask = changes || unreachable;
          unreachable = false;
          if (ask) await request();
          if (backoff) await wait(backoff * 1000);
          else if (changes && (await cursorNow()) === cursor) {
            // The pass could not move the cursor (signed out, the phone full,
            // Dropbox's wait), so the next long-poll would answer at once:
            // wait as a retry would.
            const pause = status.status().state === "problem" ? PROBLEM_RETRY_MS : RETRY_MS;
            await wait(Math.max(notBefore - Date.now(), pause));
          }
        } catch (error) {
          if (error instanceof CursorResetError) {
            // Dropbox expired the cursor: a pass lists afresh and saves a new one.
            request();
            await wait(10_000);
            continue;
          }
          if (!unreachable) log("long-poll failed:", message(error));
          unreachable = true;
          await wait(10_000);
        }
      }
    })();

    const kept = await readBinding(files);
    if (kept) bind(kept, await readSecrets(files));
  }

  /**
   * Whether a new sign-in is the account these notes sync with: the
   * binding's, or, for a binding made before accounts were bound, one that
   * holds the files the record synced.
   */
  async function belongs(bound: Binding, fresh: Secrets) {
    const probe = createDropboxRemote({
      root: `/${bound.folder}`,
      token: refreshingToken({ clientId: APP_KEY, refreshToken: fresh.refreshToken }),
    });
    if (bound.accountId) return (fresh.accountId ?? (await probe.accountId())) === bound.accountId;
    return holdsSyncedFiles(probe);
  }

  const removeIfThere = async (path: string) => {
    if (await files.exists(path)) await files.remove(path);
  };

  return {
    status,
    start,
    /**
     * From Home, with no Dropbox connected: signs in, then binds the folder
     * from no record, so the first pass merges. A record left by a connect
     * or binding that didn't last is forgotten first: it must never be read
     * against this account. Throws when cancelled (`SignInCancelled`) or
     * failed; nothing is connected then.
     */
    async connect() {
      if (binding) throw new Error("Dropbox is already connected");
      const fresh = await signIn();
      if (!fresh.accountId) throw new Error("Dropbox didn't say which account signed in");
      await local.forgetSync();
      await files.write(SECRETS, encode(fresh));
      const kept: Binding = { folder: SYNC_FOLDER, accountId: fresh.accountId };
      await files.write(BINDING, encode(kept));
      log("connected", kept.folder, kept.accountId);
      // Its account is the binding's: the binding was made from it.
      bind(kept, fresh, { accountKnown: true });
    },
    /**
     * From Home: the notes stay; what sync knew goes, the record first, then
     * the binding, then the sign-in, so a crash part-way leaves either a
     * binding with no record (the next pass merges) or nothing connected.
     * Waits out a pass under way. One that fails part-way settles where a
     * restart would: still bound, or not (a sign-in left behind is ignored
     * without a binding, and replaced by the next connect).
     */
    async disconnect() {
      if (!binding) return;
      binding = null;
      clearTimeout(retry);
      clearTimeout(saveTimer);
      await inFlight;
      try {
        await local.forgetSync();
        await removeIfThere(BINDING);
      } catch (error) {
        const kept = await readBinding(files);
        if (kept) {
          bind(kept, await readSecrets(files));
          throw error;
        }
      }
      await removeIfThere(SECRETS).catch((error) => log("sign-in left behind:", message(error)));
      takeSecrets(null);
      verified = null;
      notBefore = 0;
      log("disconnected");
      status.disconnected();
    },
    /**
     * From the sync menu, connected: the running worker takes the new token.
     * Another account is refused, since its folder would read as every note
     * deleted there. Throws when cancelled; nothing changes then.
     */
    async signInAgain() {
      const bound = binding;
      if (!bound) throw new Error("Dropbox isn't connected");
      const fresh = await signIn();
      if (!(await belongs(bound, fresh))) {
        status.refused({ kind: "other-account" });
        return;
      }
      await files.write(SECRETS, encode(fresh));
      takeSecrets(fresh);
      verified = bound.accountId ? fresh.refreshToken : null;
      status.accepted();
      request(true);
    },
    /** Try again, from the sync menu. */
    syncNow: () => request(true),
    /** A save in the editor asks for a pass a moment later, while connected. */
    localChanged() {
      if (!binding) return;
      status.changed();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => request(), SAVE_DELAY_MS);
    },
  };
}
