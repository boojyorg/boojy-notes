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
 */
import fs from "node:fs";
import { createRequire } from "node:module";

export default function globalSetup() {
  const require = createRequire(import.meta.url);
  const executable: string = require("electron");
  if (!fs.existsSync(executable)) {
    throw new Error(
      `Electron binary missing at ${executable}; run \`pnpm rebuild electron\` and try again`,
    );
  }
}
