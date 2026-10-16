/**
 * Prints Dropbox's change feed for the test vault as it arrives, for ten minutes:
 * what Dropbox reports, raw, when something changes on the Mac. Dev only.
 *
 *   DROPBOX_APP_KEY=… node_modules/.bin/jiti dev/dropbox-poc/feed.ts
 */
import fs from "node:fs";
import os from "node:os";
import { createDropboxRemote, refreshingToken } from "../../src/sync/dropboxClient";
const { refreshToken } = JSON.parse(
  fs.readFileSync(`${os.homedir()}/.boojy-dropbox-poc.json`, "utf8"),
);
const token = refreshingToken({ clientId: process.env.DROPBOX_APP_KEY ?? "", refreshToken });
const remote = createDropboxRemote({ root: "/test", token });
let page = await remote.list();
while (page.hasMore) page = await remote.listContinue(page.cursor);
for (const e of page.entries) console.log("now:", JSON.stringify(e));
let cursor = page.cursor;
const end = Date.now() + 600_000;
while (Date.now() < end) {
  const { changes } = await remote.longpoll(cursor, 30);
  if (!changes) continue;
  let p: Awaited<ReturnType<typeof remote.listContinue>>;
  do {
    p = await remote.listContinue(cursor);
    cursor = p.cursor;
    console.log(new Date().toISOString().slice(11, 19), "batch:", JSON.stringify(p.entries));
  } while (p.hasMore);
}
