# CI / build / deploy gotchas

Durable operational gotchas for this repo's pipelines. (No `paths:` frontmatter — these are
project-wide and always relevant.)

## Releases land as DRAFTS — and the matrix creates TWO of them

electron-builder publishes GitHub releases as **drafts**; nobody had clicked publish since v0.3.0,
so "latest release" lookups (website version text, auto-updater) resolved to v0.3.0 for weeks —
v0.4.0 shipped its installers into a draft nobody could see. Worse, `release.yml`'s macOS and
Windows matrix jobs **each create their own draft** on the same tag (v0.5.0: DMG in one, EXE in the
other) — consolidated manually via the API on 2026-06-12. After every tag push: check
`gh release list` for split drafts, merge assets into one, **publish it**, and delete the leftover.
Proper fix (unscheduled): create the release once before the matrix (e.g. a `gh release create`
job) so both builders upload to it, or auto-publish when both jobs succeed.

## CI Node version is pinned to 22, NOT 24

`node-version: 24` in `setup-node` **deterministically hangs** `playwright install --with-deps
chromium` on the GitHub runner image — the Install Playwright step stalls indefinitely after the
Chromium download (hung ~19m on two consecutive runs; instant green on revert to 22). The *actions*
run on Node 24 via `@v6`; only the project build/test runtime is held at 22. Don't rebump
`node-version` without fixing the Playwright install side first (pin browser deps / split the step).
A comment is left on the line in CI.

**Node 22 is not immunity, and `--with-deps` is gone — CI installs the browser only.**
On 2026-08-19 PR #76 hung **40 minutes** on Node 22, in the *apt* half of `playwright install
--with-deps chromium`, never reaching the browser download; every earlier gate had passed in ~90s.
The retry attempt exposed the real mechanism: apt is not deadlocked, it is **crawling** — the
runner's Azure mirror served 11.4 MB in 1m52s (**~100 kB/s**), and the install then wants another
21 MB. Read the package list and the apt half turns out to be pointless: all 25 shared libraries
Chromium links against report *"is already the newest version"* on the `ubuntu-latest` image, and
the 9 NEW packages are **fonts only** (CJK, Cyrillic, Thai, unifont). This suite renders none of
them — no visual snapshots, no non-Latin fixtures.

So CI now caches `~/.cache/ms-playwright` and runs plain **`playwright install chromium`** — no apt
at all — wrapped in `timeout -k 10 300` inside a 3-attempt loop, with `timeout-minutes` outside it.
If a future runner image really does drop a library, Chromium fails to launch *naming the missing
dependency* — seconds, and legible. Don't "restore" `--with-deps` to fix a launch error without
first checking whether the named library is genuinely absent.

Two traps found on the way, worth not repeating: a `timeout` short enough to feel safe (180s) will
**kill a download that is merely slow**, converting a slow-but-succeeding step into a guaranteed
3-attempt failure — size the timeout to the work, not to your patience. And `pkill -9 -f
"apt-get|dpkg"` **matches its own command line** and kills itself (`Killed  sudo pkill -9 -f …` in
the run log); match on `-x` or a pattern that can't self-match.

The job carries `timeout-minutes: 30` — a master run once burned **6h1m** before a human noticed.
A stall must fail in minutes and retry itself, never sit there waiting to be cancelled by hand.

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
