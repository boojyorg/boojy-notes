---
paths:
  - ".github/**"
  - "package.json"
  - "pnpm-lock.yaml"
  - ".npmrc"
  - "vite.config.js"
  - "vitest.config.js"
  - "playwright*.config.*"
  - "e2e/**"
  - "assets/**"
  - "electron/main.js"
---

# CI, build, deploy

Rule + one reason. Incidents and measurements are in git; command details in
`docs/private/code-signing.md` (local).

## Releases

- A `v*` tag runs `release.yml` (macOS + Windows, `pnpm build:electron`, electron-builder's
  GitHub publisher). macOS signs when `MACOS_CERTIFICATE` is set; builds before v0.7.0 are
  unsigned, and electron-updater silently refuses to update an unsigned app.
- **The `.p12` must be legacy-encoded** (`openssl pkcs12 -export -legacy …`, PBE-SHA1-3DES): the
  runner's `security import` rejects an OpenSSL 3 default export as "MAC verification failed",
  which is not the password. **electron-builder ≥ 26.16.1** (older versions pass the wrong
  password to `set-key-partition-list`, which `macos-26` enforces).
- **Notarisation is an App Store Connect Team API key, only** (`APPLE_API_KEY_B64`,
  `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID`). Never reintroduce `APPLE_ID` /
  `APPLE_APP_SPECIFIC_PASSWORD`: electron-builder checks that pair first and silently skips the
  key. The `.p8` is decoded to a path in `RUNNER_TEMP` (notarize wants a path; outside the
  workspace so no glob packs it). Check credentials before spending a run:
  `xcrun notarytool history --key <p8> --key-id <id> --issuer <uuid>`.
- **The macOS target is `dmg` and `zip`.** The DMG is the website download; the zip is the only
  thing `MacUpdater` can install from.
- **Releases land as drafts, sometimes two per tag** with the assets split between them, named
  after `package.json`'s version (so an rc tag with the version bumped fills the real drafts).
  Drafts are invisible to the website and the updater. After every tag push: `gh release list`,
  merge the assets into one release, publish it, delete the leftover draft.
- Publishing a release fires `site-rebuild.yml` (the boojy.org deploy hook; skips if the secret
  is absent).
- Every job carries `timeout-minutes` sized from actuals (a stalled job once ran six hours).
  `release.yml` is sized loose on purpose: Apple's notarisation queue is the variable.

## CI

- **Node is pinned to 22**: Node 24 hangs the Playwright browser install on the runner.
- **`playwright install chromium`, never `--with-deps`**: the apt half stalls on slow mirrors
  and adds only fonts. If Chromium fails to launch naming a library, confirm it is really absent
  before adding anything. The browser is cached on the lockfile hash; the install runs in a
  `timeout` + three-attempt loop sized to the work, not to patience.
- **`ci.yml` is side-by-side jobs plus a `ci` summary job**: `checks` (audit, lint, format,
  typecheck, coverage, web build), `web-e2e`, and `electron-e2e` in six `fullyParallel` shards.
  Branch protection requires the `ci` job name; keep it. More shards stop paying past six;
  a faster runner doesn't help (the suite waits on debounces). New pushes cancel a PR's run;
  master runs are never cancelled.
- **The gates are `pnpm test:coverage`, the web E2E suite and the Electron suite**, plus
  `pnpm audit --audit-level high`. Coverage counts every file under `src/` and `electron/`;
  thresholds in `vitest.config.js` sit just below actuals: ratchet up, never lower or exclude
  to pass.
- A failed run uploads its Playwright report and `test-results/` (14 days); the two suites
  report into separate folders. Workflows are read-only except `release.yml`.
- **The Electron suite**: drives the binary from `node_modules`, builds `dist/` itself.
  `e2e/electron/global-setup.ts` resolves the Electron binary once before workers start (two
  first launches raced into `spawn ETXTBSY`); don't remove it. **The window is shown on CI**
  (a hidden window on Linux ticks no rAF, so every Playwright action stalls); never bring back
  screenshot pumps or timer polling. **Each worker gets its own Xvfb** (`ownDisplay` in
  `harness.ts`): on a shared display the other worker's window stole focus and pointer,
  cancelling drags and hovers. A spec that presses a key into a menu waits for the menu to hold
  focus first. OS Trash and native dialogs are macOS-only and say so.

## pnpm and Electron

- `.npmrc` `node-linker=hoisted` (electron-builder needs it). `electron`, `electron-winstaller`
  and `esbuild` stay in `pnpm.onlyBuiltDependencies`.
- **The preload is built as CommonJS** (`vite.config.js`): a sandboxed preload is a classic
  script, and as ESM it failed silently (no `electronAPI`, empty sidebar). Main stays ESM.
- "Electron failed to install correctly" after an install: `pnpm rebuild electron`.
- Anything touching Electron needs a real desktop build to verify; green web CI proves nothing
  there.
- **Every dependency is a devDependency**: Vite bundles main and renderer, and electron-builder
  copies `dependencies` into the asar wholesale. Only an unbundleable native module goes back
  in `dependencies`.
- **Build input and output are separate**: `dist/` and `dist-electron/` are packaged input,
  installers go to `release/` (in `dist/`, each build packed the previous one).
  `build:electron` empties `dist-electron/` first. `files` takes only
  `assets/boojy-notes-app-icon.png` from `assets/`.
- **The app icon is generated, never hand-edited**, from the full-bleed source:
  `magick assets/boojy-notes-app-icon-source.png -resize 824x824 -background none -gravity center -extent 1024x1024 assets/boojy-notes-app-icon.png`
  (Apple's icon grid; full-bleed renders too large in the Dock).
- **Daily-driver build**: `pnpm build:electron` on master, quit the running app (its quit flush
  saves edits), replace `/Applications/Boojy Notes.app`, check `codesign --verify --deep
  --strict` and the version in Settings. Rebuild at coherent checkpoints, not per PR.

## Web deploy

Pushing `master` deploys the web build to Cloudflare Pages; the build command lives in the
Cloudflare dashboard, not the repo. The web build is a dev/test target, not the product.

## Dependencies

No `.github/dependabot.yml` (routine PRs made conflicting lockfile queues; don't re-add).
Vulnerability alerts on, automatic security-fix PRs off. Updates are a deliberate pass:
`pnpm outdated`, batch patch/minor into one PR through every gate; majors one per branch.
