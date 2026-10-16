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
import { createSyncRunner } from "../sync/syncRunner";
import type { LocalStore } from "../sync/types";
import type { FileOps } from "./files";

/**
 * Sign-in and sync for the phone (proof of concept, step 2). Dropbox's page
 * opens in the phone's browser and comes back through `boojynotes://oauth`,
 * which only this app answers. The refresh token is kept in the app's
 * private storage (the real app keeps it in Android's keystore). The vault is
 * fixed to `test` for now; the first version will choose it at sign-in.
 *
 * Sync runs while the app is open: on opening and on coming back to the
 * front, a moment after a save, when the network returns, and whenever
 * Dropbox's long-poll says the vault changed.
 */

const APP_KEY = "fupgkw6riwb8yrj"; // The Boojy Notes app key, which is public.
const REDIRECT = "boojynotes://oauth";
const VAULT = "test";
const SECRETS = "state/dropbox.json";
const PENDING = "state/sign-in.json";
const SAVE_DELAY_MS = 1500;

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array | null) =>
  bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;

const log = (...parts: unknown[]) => console.log("[sync]", ...parts);

export function createPhoneSync(files: FileOps, local: LocalStore) {
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let request: () => void = () => {};

  /** Opens Dropbox's sign-in; resolves once the app holds a refresh token. */
  async function signIn() {
    const { verifier, challenge } = await createPkce();
    const state = crypto.randomUUID();
    await files.write(PENDING, encode({ verifier, state }));
    const done = new Promise<void>((resolve, reject) => {
      const listener = App.addListener("appUrlOpen", async ({ url }) => {
        if (!url.startsWith(REDIRECT)) return;
        (await listener).remove();
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
          await files.write(SECRETS, encode({ refreshToken: tokens.refreshToken }));
          await files.remove(PENDING);
          log("signed in", tokens.accountId);
          resolve();
        } catch (error) {
          reject(error);
        } finally {
          Browser.close().catch(() => {});
        }
      });
    });
    await Browser.open({
      url: authorizeUrl({ clientId: APP_KEY, redirectUri: REDIRECT, challenge, state }),
    });
    return done;
  }

  async function start() {
    const { refreshToken } = decode(await files.read(SECRETS));
    const token = refreshingToken({ clientId: APP_KEY, refreshToken });
    const remote = createDropboxRemote({ root: `/${VAULT}`, token });
    const runner = createSyncRunner(async () => {
      const started = Date.now();
      const result = await syncPass({ local, remote });
      for (const line of result.log) log(line);
      if (result.attention.length) log("needs attention:", result.attention.join(", "));
      log(`pass done in ${Date.now() - started} ms${result.again ? ", another to follow" : ""}`);
      return result;
    });
    request = () => {
      runner.request().catch((error) => log("pass failed:", error?.message ?? error));
    };

    let active = true;
    App.addListener("appStateChange", ({ isActive }) => {
      active = isActive;
      if (isActive) request();
    });
    window.addEventListener("online", () => request());
    request();

    // Dropbox answers a long-poll when the vault changes; each answer asks for a pass.
    (async () => {
      for (;;) {
        try {
          const record = await local.loadRecord();
          const cursor = record ? JSON.parse(record).cursor : null;
          if (!active || !cursor || !navigator.onLine) {
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          const { changes, backoff } = await remote.longpoll(cursor);
          if (changes) request();
          if (backoff) await new Promise((r) => setTimeout(r, backoff * 1000));
        } catch (error) {
          log("long-poll failed:", (error as Error)?.message ?? error);
          await new Promise((r) => setTimeout(r, 10_000));
        }
      }
    })();
  }

  return {
    signedIn: async () => !!decode(await files.read(SECRETS))?.refreshToken,
    signIn,
    start,
    /** A save in the editor asks for a pass a moment later. */
    localChanged() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => request(), SAVE_DELAY_MS);
    },
  };
}
