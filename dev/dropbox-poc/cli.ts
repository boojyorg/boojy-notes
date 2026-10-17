/**
 * Proof of concept, step 1: the phone's sync engine run on the Mac against a
 * real Dropbox. Dev only, never bundled. A local folder stands in for the
 * phone's copy; the vault in `Dropbox/Apps/Boojy Notes/<vault>/` is the one
 * Dropbox's desktop app syncs and Boojy opens. Use a test vault, never a real one.
 *
 *   node_modules/.bin/jiti dev/dropbox-poc/cli.ts login
 *   node_modules/.bin/jiti dev/dropbox-poc/cli.ts sync <phone-folder> [--vault test]
 *   node_modules/.bin/jiti dev/dropbox-poc/cli.ts watch <phone-folder> [--vault test]
 *
 * Needs DROPBOX_APP_KEY (the Boojy Notes app key, which is public), and the
 * redirect URI http://localhost:53682/callback registered in Dropbox's app console.
 * The refresh token is kept in ~/.boojy-dropbox-poc.json, readable by you alone.
 */
import { execFile } from "node:child_process";
import { watch } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  authorizeUrl,
  createDropboxRemote,
  createPkce,
  DropboxHttpError,
  exchangeCode,
  refreshingToken,
} from "../../src/sync/dropboxClient";
import { syncPass } from "../../src/sync/engine";
import { createSyncRunner } from "../../src/sync/syncRunner";
import { nodeStore } from "./nodeStore";

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SECRETS = path.join(os.homedir(), ".boojy-dropbox-poc.json");

const appKey = () => {
  const key = process.env.DROPBOX_APP_KEY;
  if (!key) throw new Error("Set DROPBOX_APP_KEY to the Boojy Notes app key.");
  return key;
};

async function login() {
  const clientId = appKey();
  const { verifier, challenge } = await createPkce();
  const state = crypto.randomUUID();
  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT);
      if (url.pathname !== "/callback") return void res.writeHead(404).end();
      const got = url.searchParams.get("code");
      const ok = got && url.searchParams.get("state") === state;
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain" });
      res.end(ok ? "Signed in. You can close this tab." : "Sign-in failed.");
      server.close();
      if (ok) resolve(got);
      else reject(new Error(url.searchParams.get("error_description") ?? "Sign-in failed"));
    });
    server.listen(PORT, "127.0.0.1", () => {
      const url = authorizeUrl({ clientId, redirectUri: REDIRECT, challenge, state });
      console.log(`Opening Dropbox sign-in…\n${url}`);
      execFile("open", [url]);
    });
  });
  const tokens = await exchangeCode({ clientId, code, verifier, redirectUri: REDIRECT });
  if (!tokens.refreshToken) throw new Error("Dropbox gave no refresh token.");
  await fs.writeFile(
    SECRETS,
    JSON.stringify({ refreshToken: tokens.refreshToken, accountId: tokens.accountId }),
    { mode: 0o600 },
  );
  console.log(`Signed in as ${tokens.accountId}. Refresh token kept in ${SECRETS}.`);
}

async function connect(phoneFolder: string, vault: string) {
  const secrets = await fs.readFile(SECRETS, "utf8").catch(() => {
    throw new Error("Not signed in: run `cli.ts login` first.");
  });
  const { refreshToken } = JSON.parse(secrets);
  const token = refreshingToken({ clientId: appKey(), refreshToken });
  const remote = createDropboxRemote({ root: `/${vault}`, token });
  const root = path.resolve(phoneFolder);
  await fs.mkdir(root, { recursive: true });
  const local = nodeStore(root, `${root}.sync-record.json`);
  const runner = createSyncRunner(async () => {
    const started = Date.now();
    const result = await syncPass({ local, remote });
    for (const line of result.log) console.log(`  ${line}`);
    if (result.attention.length)
      console.log("  needs attention:", JSON.stringify(result.attention));
    console.log(
      `pass done in ${Date.now() - started} ms${result.again ? ", another to follow" : ""}`,
    );
    return result;
  });
  return { remote, local, runner, recordFile: `${root}.sync-record.json` };
}

async function watchLoop(phoneFolder: string, vault: string) {
  const { remote, runner, recordFile } = await connect(phoneFolder, vault);
  const request = () =>
    runner.request().catch((error) => console.error(`pass failed: ${error.message}`));
  await request();
  // A save in the stand-in phone folder asks for a pass a moment later.
  let timer: NodeJS.Timeout | undefined;
  watch(path.resolve(phoneFolder), { recursive: true }, (_event, name) => {
    if (
      name &&
      String(name)
        .split(path.sep)
        .some((part) => part.startsWith("."))
    )
      return;
    clearTimeout(timer);
    timer = setTimeout(request, 1500);
  });
  // Dropbox says when the vault changes; each answer asks for a pass.
  for (;;) {
    try {
      const { cursor } = JSON.parse(await fs.readFile(recordFile, "utf8"));
      const { changes, backoff } = await remote.longpoll(cursor);
      if (changes) await request();
      if (backoff) await new Promise((r) => setTimeout(r, backoff * 1000));
    } catch (error) {
      const wait = error instanceof DropboxHttpError && error.retryAfter ? error.retryAfter : 10;
      console.error(`long-poll failed (${(error as Error).message}); retrying in ${wait} s`);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}

const [command, folder, ...rest] = process.argv.slice(2);
const vaultFlag = rest.indexOf("--vault");
const vault = vaultFlag >= 0 ? rest[vaultFlag + 1] : "test";

const run = async () => {
  if (command === "login") return login();
  if (!folder) throw new Error("Usage: cli.ts sync|watch <phone-folder> [--vault test]");
  if (command === "sync") return void (await (await connect(folder, vault)).runner.request());
  if (command === "watch") return watchLoop(folder, vault);
  throw new Error(`Unknown command ${command}`);
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
