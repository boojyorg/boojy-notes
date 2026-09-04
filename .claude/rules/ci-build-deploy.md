# CI, build, deploy

Durable operational rules for this repo's pipelines. Each carries the one reason a future
change needs; the incidents behind them are in git.

## Releases

- Pushing a `v*` tag runs `release.yml`: a macOS and a Windows job, each running
  `pnpm build:electron` and uploading through electron-builder's GitHub publisher. macOS
  signs and notarises only if the certificate secrets are set; otherwise it builds unsigned.
- **Releases land as drafts, and the matrix creates two of them** on the same tag (DMG in one,
  EXE in the other). A draft is invisible to "latest release" lookups, so the website version
  text and the auto-updater keep resolving to the last *published* release. After every tag
  push: check `gh release list`, merge the assets into one release, **publish it**, delete the
  leftover draft. Proper fix, unscheduled: create the release once before the matrix so both
  jobs upload to it, or auto-publish when both succeed.
- Publishing a release fires `site-rebuild.yml`, which POSTs the boojy.org Cloudflare deploy
  hook so the site picks up the new version. It skips gracefully if the secret is absent.
- Every workflow job carries `timeout-minutes` (`ci.yml` 30, `release.yml` 30,
  `site-rebuild.yml` 5), sized from measured actuals (installers take 1-2m on macOS, 2-4m on
  Windows). Keep it that way; a stalled job once ran six hours unnoticed. Turning on
  notarisation is the one change that needs the release number re-measured; it can add 10-20m.

## CI

- **Node is pinned to 22.** Node 24 deterministically hangs the Playwright browser install on
  the GitHub runner image. The actions themselves run on Node 24 via `@v6`; only the project
  runtime is held at 22. Don't rebump it without fixing the Playwright install first.
- **Playwright installs the browser only: `playwright install chromium`, never
  `--with-deps`.** The apt half stalls for tens of minutes on a slow mirror and buys nothing:
  every library Chromium links against is already on `ubuntu-latest`, and the packages it
  would add are fonts this suite never renders. If a future image drops a library, Chromium
  fails to launch naming it, in seconds. Don't restore `--with-deps` to fix a launch error
  without confirming the named library is genuinely absent.
- The browser is cached at `~/.cache/ms-playwright`, keyed on the lockfile hash with a
  prefix restore-key, so an unchanged lockfile skips the download and a dep bump degrades to a
  partial hit. A cold miss is about ten seconds. If the install step is ever slow, look at the
  CDN or the cache action, not apt.
- The install runs inside a `timeout` and a three-attempt loop, with `timeout-minutes` on the
  step as the outer cap. Size any timeout to the work, not to patience: one short enough to
  feel safe will kill a download that is merely slow and turn a passing step into a guaranteed
  failure.
- **The gates are `pnpm test:coverage`, the web E2E suite and the Electron suite, not
  `pnpm test`.** Coverage thresholds in `vitest.config.js` are a floor just below actuals;
  ratchet up, never lower to pass. Run `pnpm test:coverage` before claiming green. `pnpm audit --audit-level critical`
  also gates every run; it is the live security net.
- **The real-Electron suite runs under `xvfb-run` on the same Ubuntu job**, after the web E2E.
  `pnpm test:electron` builds `dist/` and `dist-electron/` itself, because the job's build step
  uses `ELECTRON_DISABLE=1` and produces no main process. Its assertions are about files on disk,
  so Linux is a fair proxy for the renderer and main-process logic; anything that depends on the
  OS Trash or native dialogs is macOS-only and says so in the spec. `--no-sandbox` is passed only
  when `CI` is set.

## pnpm and Electron

- `.npmrc` sets `node-linker=hoisted` so electron-builder resolves dependencies; a DMG built
  this way is verified clean.
- pnpm 10 blocks native build scripts by default. `electron`, `electron-winstaller` and
  `esbuild` must stay in `pnpm.onlyBuiltDependencies` in `package.json`, or their binaries
  never build (symptom: an "Ignored build scripts" warning after install).
- **If `pnpm dev` dies with "Electron failed to install correctly"**, a lockfile-churning
  install relinked `node_modules/electron` without re-running its download script. Fix:
  `pnpm rebuild electron` (about 30 seconds).
- Anything touching Electron needs a real desktop build to verify; green web CI does not
  exercise it.

## Web deploy

- Pushing `master` deploys the web build to Cloudflare Pages. The build command
  (`ELECTRON_DISABLE=1 pnpm build`) is set **in the Cloudflare dashboard**, not read from the
  repo; confirm the deploy is green after any build change.
- The web deploy is not the product surface. Desktop is; the web build is a development and
  test target. Don't spend Beta effort on web-only product issues.

## Dependencies

Three independent controls, deliberately set:

| Control | Where it lives | State |
| --- | --- | --- |
| Routine Dependabot version-update PRs | `.github/dependabot.yml` | **off** (no file; don't re-add one) |
| Dependabot vulnerability alerts | repo security setting | **on** |
| Automatic security-fix PRs | repo security setting | **off** |

Routine PRs are off because automatic bumps produced a queue of mutually conflicting lockfile
PRs that nobody asked for. The config file has no authority over the two security settings, so
its absence changes nothing there.

Maintenance is a deliberate pass, not a queue: occasionally run `pnpm outdated`, batch patch
and minor bumps into one commit, run the whole gate sequence, one PR. Majors go one at a time
on their own branch. A vulnerability alert is the trigger for an unscheduled pass.
