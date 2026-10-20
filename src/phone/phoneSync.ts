import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import {
  authorizeUrl,
  createDropboxRemote,
  createPkce,
  exchangeCode,
  refreshingToken,
} from "../sync/dropboxClient";
import { syncPass } from "../sync/engine";
import { loadRecord } from "../sync/syncRecord";
import { createSyncRunner } from "../sync/syncRunner";
import { createSyncStatus, type FailureMeaning } from "../sync/syncStatus";
import { CursorResetError, type LocalStore } from "../sync/types";
import type { FileOps } from "./files";
import { SYNC_FOLDER } from "./syncFolder";

/**
 * Sign-in and sync for the phone. Dropbox's page opens in the phone's browser
 * and comes back through `boojynotes://oauth`, which only this app answers.
 * The refresh token is kept in the app's private storage (the real app keeps
 * it in Android's keystore). The vault is `SYNC_FOLDER` (syncFolder.ts).
 *
 * Sync runs while the app is open: on opening and on coming back to the
 * front, a moment after a save, whenever Dropbox's long-poll says the vault
 * changed, and when Dropbox can be reached again after it could not. The web
 * view's `online` event is not relied on: on Android it did not fire after
 * aeroplane mode. A pass that fails is tried again later: when Dropbox says
 * (a 429 or 503's Retry-After), soon when it was out of reach, slowly while a
 * problem stands, and not at all while signed out.
 *
 * There is one worker (runner, long-poll, listeners) for the app's life:
 * signing in again swaps the token it uses, never starts a second.
 */

const APP_KEY = "fupgkw6riwb8yrj"; // The Boojy Notes app key, which is public.
const REDIRECT = "boojynotes://oauth";
const SECRETS = "state/dropbox.json";
const PENDING = "state/sign-in.json";
const SAVE_DELAY_MS = 1500;
const RETRY_MS = 15_000;
/** While a problem stands, a retry is a slow check that it has gone. */
const PROBLEM_RETRY_MS = 5 * 60_000;
/** Back from the browser with no answer from Dropbox in this long: cancelled. */
const SIGN_IN_GRACE_MS = 2000;

interface Secrets {
  refreshToken: string;
  /** Missing in a sign-in kept before accounts were checked; looked up at start. */
  accountId?: string;
}

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array | null) =>
  bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
const message = (error: unknown) => (error as Error)?.message ?? String(error);

/**
 * The kept sign-in. A file that doesn't read as one (damaged) is no sign-in:
 * the sign-in screen shows, and signing in replaces it. Notes are untouched.
 */
export async function readSecrets(files: FileOps): Promise<Secrets | null> {
  try {
    const secrets = decode(await files.read(SECRETS));
    return typeof secrets?.refreshToken === "string" ? secrets : null;
  } catch {
    return null;
  }
}

const log = (...parts: unknown[]) => console.log("[sync]", ...parts);

export function createPhoneSync(files: FileOps, local: LocalStore) {
  const status = createSyncStatus();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  /** Asks for a pass; one the person asked for (`byHand`) needn't wait out Dropbox. */
  let request: (byHand?: boolean) => void = () => {};
  /** Dropbox asked for no request before this (Retry-After), ms. */
  let notBefore = 0;
  let token: () => Promise<string> = () => Promise.reject(new Error("not signed in"));

  const takeSecrets = (secrets: Secrets) => {
    token = refreshingToken({ clientId: APP_KEY, refreshToken: secrets.refreshToken });
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
            reject(new Error("the page was closed"));
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
    if ("problem" in meaning && meaning.problem.kind === "signed-out") return null;
    return status.status().state === "problem" ? PROBLEM_RETRY_MS : RETRY_MS;
  };

  async function start() {
    const secrets = await readSecrets(files);
    if (!secrets) throw new Error("not signed in");
    takeSecrets(secrets);
    let accountKnown = !!secrets.accountId;
    const remote = createDropboxRemote({ root: `/${SYNC_FOLDER}`, token: () => token() });
    // Each pass reports once, however many requests waited on it.
    const runner = createSyncRunner(async () => {
      const started = Date.now();
      status.started();
      try {
        const result = await syncPass({ local, remote });
        for (const line of result.log) log(line);
        if (result.attention.length) log("needs attention:", JSON.stringify(result.attention));
        log(`pass done in ${Date.now() - started} ms${result.again ? ", another to follow" : ""}`);
        status.finished(result);
        if (!accountKnown) {
          accountKnown = true; // One lookup at a time; one that fails leaves it to the next pass.
          noteAccount(remote.accountId).then((found) => {
            accountKnown = found;
          });
        }
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
    });
    request = (byHand = false) => {
      // A save, a return or a reconnect waits out Dropbox's wait: the retry
      // set for its end runs the pass.
      if (!byHand && Date.now() < notBefore) {
        retryIn(notBefore - Date.now());
        return;
      }
      clearTimeout(retry);
      runner
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
    request();
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Dropbox answers a long-poll when the vault changes; each answer asks for a pass.
    (async () => {
      let unreachable = false;
      for (;;) {
        try {
          const record = await local.loadRecord();
          const cursor = record ? JSON.parse(record).cursor : null;
          if (!active || !cursor) {
            await wait(5000);
            continue;
          }
          const { changes, backoff } = await remote.longpoll(cursor);
          // Reachable again: what was saved meanwhile goes up now.
          if (changes || unreachable) request();
          unreachable = false;
          if (backoff) await wait(backoff * 1000);
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
  }

  /**
   * A sign-in kept before accounts were checked learns its account after a
   * pass gets through (Dropbox is reachable then), so a later one can be.
   */
  async function noteAccount(accountId: () => Promise<string>) {
    try {
      const id = await accountId();
      const secrets = await readSecrets(files);
      if (secrets && !secrets.accountId) {
        await files.write(SECRETS, encode({ ...secrets, accountId: id }));
      }
      return true;
    } catch (error) {
      log("couldn't look up the account:", message(error));
      return false;
    }
  }

  /**
   * Whether a new sign-in is the account these notes sync with: the kept
   * sign-in's account, or, for one kept before accounts were, an account that
   * holds a file the record synced (Dropbox ids are one account's own). A
   * record with nothing synced is bound to no account yet.
   */
  async function sameAccount(kept: Secrets | null, fresh: Secrets) {
    const remote = createDropboxRemote({
      root: `/${SYNC_FOLDER}`,
      token: refreshingToken({ clientId: APP_KEY, refreshToken: fresh.refreshToken }),
    });
    if (kept?.accountId) return (fresh.accountId ?? (await remote.accountId())) === kept.accountId;
    const ids = Object.values((await loadRecord(local)).synced).map((s) => s.id);
    return ids.length === 0 || remote.holdsAnyOf(ids.slice(0, 10));
  }

  return {
    status,
    signedIn: async () => !!(await readSecrets(files))?.refreshToken,
    /** The first sign-in, before the app shows. */
    async signIn() {
      await files.write(SECRETS, encode(await signIn()));
    },
    start,
    /**
     * From the sync menu, the app open: the running worker takes the new
     * token. Another account is refused, since its folder would read as every
     * note deleted there. Throws when cancelled; nothing changes then.
     */
    async signInAgain() {
      const fresh = await signIn();
      if (!(await sameAccount(await readSecrets(files), fresh))) {
        status.refused({ kind: "other-account" });
        return;
      }
      await files.write(SECRETS, encode(fresh));
      takeSecrets(fresh);
      status.accepted();
      request(true);
    },
    /** Try again, from the sync menu. */
    syncNow: () => request(true),
    /** A save in the editor asks for a pass a moment later. */
    localChanged() {
      status.changed();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => request(), SAVE_DELAY_MS);
    },
  };
}
