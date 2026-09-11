# CI, build, deploy

Durable operational rules for this repo's pipelines. Each carries the one reason a future
change needs; the incidents behind them are in git.

## Releases

- Pushing a `v*` tag runs `release.yml`: a macOS and a Windows job, each running
  `pnpm build:electron` and uploading through electron-builder's GitHub publisher. macOS
  signs and notarises when the five certificate secrets are set (`MACOS_CERTIFICATE`,
  `MACOS_CERTIFICATE_PWD`, `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID`; notarisation is
  electron-builder's own, triggered by the three Apple variables) and builds unsigned
  otherwise. **Set on 2026-09-11** for the v0.7.0 release; every published macOS build before it
  (v0.5.0 included) is unsigned, and electron-updater refuses to update an unsigned app with
  the error swallowed, so Settings → Updates only works from a signed build onward. Two things
  the first signed run taught, each a silent failure until found (`docs/private/code-signing.md`,
  local, has the commands): **the `.p12` must be legacy-encoded** (`openssl pkcs12 -export
  -legacy -nomaciter -descert -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES`); an OpenSSL 3
  default export (AES/PBES2) verifies with `openssl` but the runner's `security import` rejects
  it as "MAC verification failed (wrong password?)", which is not the password. And
  **electron-builder must be ≥ 26.16.1**: before that it handed `security set-key-partition-list`
  the certificate's password where the keychain's own is required (upstream #10066, fixed in
  #10172), which the `macos-26` runner image enforces and older images let through.
  **Notarisation authenticates with an App Store Connect *Team* API key**
  (`APPLE_API_KEY_B64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, plus `APPLE_TEAM_ID`), not an
  Apple ID and app-specific password: that password had died with Audio's June credentials and
  cost two rehearsals, and a team key does not expire with an Apple ID password. Three things
  it demands. It must be a **Team** key: an Individual key cannot use notarytool at all, and
  Developer is role enough. `@electron/notarize` wants **a filesystem path** to the `.p8`, not
  its contents, so `release.yml` decodes the secret into `RUNNER_TEMP` before the build and
  removes it after (outside the workspace, so no `files` glob can pack it). And `APPLE_ID` and
  `APPLE_APP_SPECIFIC_PASSWORD` must stay **out** of that step's env: electron-builder checks
  the Apple ID pair first and returns early, so their presence silently reinstates the dead
  path. Check credentials against Apple before spending a run:
  `xcrun notarytool history --key <p8> --key-id <id> --issuer <uuid>`.
- **Releases land as drafts, and one tag can produce two of them** with the assets split
  between them (seen 2026-09-11 from the Windows job alone: EXE and `latest.yml` in one,
  the blockmap in the other; the matrix adds the same race across jobs). electron-builder
  names the draft after `package.json`'s version, never the pushed tag, and **uploads into an
  existing draft of that name** when it finds one, so a rehearsal tag (`v0.7.0-rc.1`) with the
  version already bumped makes the real `v0.7.0` drafts. A draft is invisible to "latest
  release" lookups, so the website version text and the auto-updater keep resolving to the
  last *published* release. After every tag push: check `gh release list`, merge the assets
  into one release, **publish it**, delete the leftover draft. Proper fix, unscheduled: create
  the release once before the matrix so both jobs upload to it, or auto-publish when both
  succeed.
- Publishing a release fires `site-rebuild.yml`, which POSTs the boojy.org Cloudflare deploy
  hook so the site picks up the new version. It skips gracefully if the secret is absent.
- Every workflow job carries `timeout-minutes` (`ci.yml`: checks 15, web E2E 15, Electron 20,
  the `ci` summary 5; `release.yml` 45; `site-rebuild.yml` 5), sized from measured actuals.
  Keep it that way; a stalled job once ran six hours unnoticed. The release number is the one
  exception to sizing tight: measured 2026-09-11 on the first notarised run, macOS is 3m34s end
  to end (notarisation 2m20s of it) and Windows 2m26s, but the variable is Apple's notarisation
  queue rather than the build, and a cap that kills a submission mid-queue wastes the run.

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
- **`ci.yml` is three jobs side by side plus a summary** (2026-09-06): `checks` (audit, lint,
  format, typecheck, unit tests with coverage, the web build), `web-e2e` and `electron-e2e`,
  each installing for itself from the pnpm cache, so the wall clock follows the slowest job
  rather than their sum. The `ci` job at the end only reports whether all three succeeded; it
  is the one status branch protection requires, so keep that job name. Measured 2026-09-06 over
  five runs of one commit: wall clock 197 s (serial, the same steps took 256 s; before the
  two-worker change, 422 s), with the Electron job the critical path at ~190 s, checks ~74 s,
  web E2E ~29 s. Speeding CI up further means speeding up the Electron job alone.
- **The gates are `pnpm test:coverage`, the web E2E suite and the Electron suite, not
  `pnpm test`.** Coverage is measured against every file under `src/` and `electron/`
  (`coverage.include`, 2026-09-07), whether or not a test imports it; before that, Vitest 4
  counted only files the tests happened to load, and a quarter of the source was missing from
  the denominator. The thresholds in `vitest.config.js` are a floor just below those honest
  actuals; ratchet up, never lower to pass, and never exclude a source directory to lift them. Run `pnpm test:coverage` before claiming green. `pnpm audit --audit-level critical`
  also gates every run; it is the live security net.
- **The real-Electron suite runs under `xvfb-run` in its own job**, with no Playwright browser
  download: it drives the Electron binary from `node_modules`. `pnpm test:electron` builds
  `dist/` and `dist-electron/` itself; the web build elsewhere in the workflow uses
  `ELECTRON_DISABLE=1` and produces no main process. **It runs on two Playwright workers**
  (each test owns its app process, vault and userData; measured 2026-09-06: 333 s to 175 s on the
  runner, five runs with no flake), and `e2e/electron/global-setup.ts` resolves the Electron
  binary once before any worker starts: Electron 42 fetches its binary on the first
  `require("electron")` when `dist/` is empty, which on CI is the first test's launch, and two
  first launches at once left one worker spawning a half-written executable (`spawn ETXTBSY`).
  Don't remove the global setup when touching the workers. Its assertions are about files on disk,
  so Linux is a fair proxy for the renderer and main-process logic; anything that depends on the
  OS Trash or native dialogs is macOS-only and says so in the spec. `--no-sandbox` is passed only
  when `CI` is set. The window is always hidden (`BOOJY_TEST_HEADED=1` shows it for watching a
  run); the `headed` project and `pnpm test:electron:headed` were removed on 2026-09-07 because
  the bucket never held a spec and the script exited 1 with "No tests found".

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
- **The app icon is `assets/boojy-notes-app-icon.png`**: 1024px, transparent corners, the
  rounded square at 824px on Apple's icon grid so the Dock draws it the size of every other app.
  Both electron-builder targets (macOS DMG, Windows NSIS; the unused Linux block went on
  2026-09-07 with the default-valued `npmRebuild`) and the `BrowserWindow` icon in `main.js` point at it, and
  electron-builder makes the `.icns` itself. It is generated, never hand-edited, from
  `assets/boojy-notes-app-icon-source.png`, the full-bleed 1071px export of the artwork:
  `magick <source> -resize 824x824 -background none -gravity center -extent 1024x1024 <icon>`.
  Replace the source and re-run that; a full-bleed PNG handed straight to electron-builder
  renders about a quarter too large beside native icons.
- **The daily-driver build is `pnpm build:electron` on master.** It writes
  `release/mac-arm64/Boojy Notes.app` and the DMG beside it; electron-builder signs with
  whatever Developer ID identity the keychain holds and builds unsigned without one. Quit the
  running app first (its quit flush saves pending edits), replace `/Applications/Boojy Notes.app`,
  then check `codesign --verify --deep --strict` and the version in Settings. The installed app
  never self-updates, so rebuild at coherent checkpoints (a batch of merges worth judging live),
  not per PR. Distributed releases go through `release.yml` only.
- **Build input and output are separate directories** (2026-09-07). `dist/` (the renderer) and
  `dist-electron/` (main and preload) are the packaged input; installers land in `release/`,
  never in `dist/`. With both in `dist/`, the `files` glob `dist/**/*` packed the previous
  build's own app and DMG into every new `app.asar` (345 MB, 5,800 entries; now 1.2 MB and 18),
  and the DMG was 244 MB where 118 MB is the Electron floor. `build:electron` empties
  `dist-electron/` first, because vite-plugin-electron never does and every removed feature's
  chunks were shipping. `pnpm test:e2e` and the Electron suite rebuild `dist/`, which is
  harmless now; the packaged app in `release/` is untouched. The `files` list takes only
  `assets/boojy-notes-app-icon.png` from `assets/` (2026-09-07): the wordmarks are bundled by Vite
  and the icon source is build-time input, so nothing else in that directory is read at runtime.
- **Every dependency is a devDependency, on purpose.** Vite bundles the renderer and the
  main process alike; the built `main.js` requires only Node built-ins and `electron`, the
  renderer nothing. electron-builder copies `dependencies` into the asar wholesale, so listing
  `react`, `lucide-react`, `chokidar` or `electron-updater` there shipped 5,200 files nothing
  read (29 MB). Proven 2026-09-07 by launching the packaged app from `release/` against a
  throwaway vault: `app.isPackaged` true, the vault rendered, Settings → Updates completed the
  GitHub check (`Up to date`) with no module or page errors. A new runtime import that Vite
  cannot bundle (a native module) is the one reason to put something back in `dependencies`.

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
