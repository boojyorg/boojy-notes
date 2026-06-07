# CI / build / deploy gotchas

Durable operational gotchas for this repo's pipelines. (No `paths:` frontmatter — these are
project-wide and always relevant.)

## CI Node version is pinned to 22, NOT 24

`node-version: 24` in `setup-node` **deterministically hangs** `playwright install --with-deps
chromium` on the GitHub runner image — the Install Playwright step stalls indefinitely after the
Chromium download (hung ~19m on two consecutive runs; instant green on revert to 22). The *actions*
run on Node 24 via `@v6`; only the project build/test runtime is held at 22. Don't rebump
`node-version` without fixing the Playwright install side first (pin browser deps / split the step).
A comment is left on the line in CI.

## CI runs `test:coverage` + E2E, not just `pnpm test`

CI gates in layers (coverage, then Playwright/axe E2E). Coverage thresholds are a floor set just
below current actuals — ratchet **up** as presentational code gets covered, never lower to pass.
Always run `pnpm test:coverage` (and ideally `pnpm test:e2e`) before claiming CI-green — `pnpm test`
alone can pass while the coverage gate fails.

## electron-builder under pnpm needs `node-linker=hoisted`

`.npmrc` sets `node-linker=hoisted` so electron-builder resolves dependencies. Verified producing a
DMG (the v0.4.0 build was clean). pnpm 10 also blocks native build scripts by default — esbuild and
electron must stay listed in `pnpm.onlyBuiltDependencies` (package.json) or their native binaries
won't build (symptom: an "Ignored build scripts" warning after install).

**Electron binary vanishes after lockfile churn.** A `pnpm install` that reshuffles `node_modules`
(e.g. after a dep-bump wave) can relink `node_modules/electron` without re-running its download
script — `pnpm dev` then dies with *"Electron failed to install correctly, please delete
node_modules/electron"*. Fix: **`pnpm rebuild electron`** (re-runs `install.js`, ~30s). Happened
2026-06-07 after the Dependabot wave.

## Cloudflare Pages build command lives in the dashboard, not the repo

After the npm→pnpm migration the CF Pages build command must be `ELECTRON_DISABLE=1 pnpm build`,
set **in the Cloudflare dashboard** — it is not read from the repo. CF auto-detects `pnpm-lock` for
install, but the build command is dashboard-configured; confirm the deploy is green after changes.
