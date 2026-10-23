/**
 * Runs once before any worker starts: make sure the Electron binary is on
 * disk. Electron 42 fetches its binary on the first `require("electron")`
 * when `node_modules/electron/dist` is empty, which on CI is the first test's
 * launch. With two workers, both first launches fetched at once and one
 * spawned the half-written executable (`spawn ETXTBSY`, seen 2026-09-06).
 * Resolving the path here triggers that fetch exactly once, serially, and
 * every worker then finds the binary in place. Locally it also catches a
 * lockfile-churn relink that dropped the binary (see the CI rule's
 * `pnpm rebuild electron` note) with a clear message instead of a hang.
 *
 * On Linux it also fetches the spelling dictionary once (`DICTIONARY`).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { DICTIONARY } from "./harness";

export default async function globalSetup() {
  const require = createRequire(import.meta.url);
  const executable: string = require("electron");
  if (!fs.existsSync(executable)) {
    throw new Error(
      `Electron binary missing at ${executable}; run \`pnpm rebuild electron\` and try again`,
    );
  }
  if (process.platform === "linux") await fetchDictionary();
}

async function fetchDictionary() {
  if (fs.existsSync(DICTIONARY.cached)) return;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(DICTIONARY.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.subarray(0, 4).toString() !== "BDic") throw new Error("not a dictionary");
      fs.mkdirSync(path.dirname(DICTIONARY.cached), { recursive: true });
      // Written whole under a temporary name, so a half file is never found.
      fs.writeFileSync(`${DICTIONARY.cached}.part`, bytes);
      fs.renameSync(`${DICTIONARY.cached}.part`, DICTIONARY.cached);
      return;
    } catch (error) {
      if (attempt === 5) throw new Error(`Spelling dictionary not fetched: ${error}`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}
