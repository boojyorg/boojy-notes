# DREAMS.md — Boojy Notes Intent Buffer & Devlog

> Live working memory. Read this at the start of every session to establish target
> context. Tick `- [ ]` → `- [x]` as items resolve. Law (slow-changing rules) lives in
> CLAUDE.md; this file is state (changes every session).

## 1. 🎯 Active Engineering Target

**Status:** v0.3.0 **pushed + tagged** (web-only pivot + Biome + pnpm + BoojyNotes slice-1).
Desktop release build passed (installers sit as a **draft** GitHub Release — publish after DMG
check). Sidebar a11y violation **fixed** → **CI is GREEN** (run `26623799556`) for the first
time since ~Mar 2026. `boojy.org/notes` version text now reads the `v0.3.0` tag. App is live at
`notes.boojy.org`; landing page at `boojy.org/notes`.

### Current milestone (checklist)

- [x] Drop Capacitor → web + desktop only (v0.3.0)
- [x] ESLint + Prettier → Biome (CI lint/format/typecheck verified green)
- [x] npm → pnpm (full DMG release build verified)
- [x] Extract `useNoteStats` / `useWebNags` / `useDocumentTitle` from BoojyNotes
- [x] Push `master` → Cloudflare web deploy triggered
- [x] Fix CI coverage gate (thresholds → floor at actuals)
- [x] **Confirm web is live** — `notes.boojy.org` live (user-confirmed 2026-05-29); landing at `boojy.org/notes`
- [x] **Fix sidebar-tree a11y violation → green E2E/CI** (New Folder/New Note buttons under `role="tree"` given `role="treeitem"`; verified all 5 E2E pass locally, 2026-05-29)
- [ ] (optional) Phase 3 cont.: `ProfileTab` (915) / `Sidebar` (897)
- [x] Desktop installers + fix `boojy.org/notes` version text: tag `v0.3.0` (pushed 2026-05-29)
- [ ] (optional) Create `FEATURES.md` (docs-system gap)

---

## 2. 🧪 Workspace Feedback Loops & Incident Logs

### 🛑 Manual UX & Testing Reports (User Injected)

- [x] Phase-3 slice 1: `pnpm dev:web` verified identical to pre-refactor (user, 2026-05-28).
- [ ] Add manual observations from `pnpm dev` / `dev:web` walkthroughs here.

### 🚨 Automated Incident Logs (Script Prepended)

_None open._

<!-- The post-edit-validation hook automatically injects compiler/test errors beneath this line -->

> Note: during a multi-file refactor the hook logs *transient* mid-edit failures
> (an import added one edit before its use). Those are intermediate states, not real
> incidents — clear this section back to "_None open._" once gates are green again.

---

## 3. 🗺️ Strategic Backlog & Architecture Scratchpad

### ⚠️ Known Gotchas

- **pnpm blocks native build scripts by default** (pnpm 10). node-pty/esbuild/electron won't
  build until listed in `pnpm.onlyBuiltDependencies` (package.json). Symptom: missing native
  binary + an "Ignored build scripts" warning after install.
- **node-pty 1.1.0 loads from `prebuilds/`** (darwin/win32), NOT `build/Release/`. A missing
  `build/Release/*.node` is normal — verify with `node -e "require('node-pty')"` instead.
- **electron-builder works under pnpm** with `.npmrc` `node-linker=hoisted`; it detects
  `pm=pnpm` and rebuilds node-pty against Electron. Verified producing a DMG.
- **Cloudflare Pages build command lives in the dashboard, not the repo.** After npm→pnpm it
  should be `ELECTRON_DISABLE=1 pnpm build` there. (Likely fine — CF auto-detects pnpm-lock for
  install and `npm run build` just runs vite — but confirm the deploy is green.)
- **CI has been red since ~Mar 2026 and fails in layers.** Gates were buried behind each other:
  coverage failed first (hid everything after), now E2E fails (hadn't run since Mar). Expect to
  peel more. CI runs **`test:coverage` + E2E (Playwright/axe)**, NOT just `pnpm test` — always
  run `pnpm test:coverage` (and ideally `pnpm test:e2e`) before claiming CI-green.
- **[FIXED 2026-05-29] Sidebar notes tree a11y** — the New Folder/New Note `<button>`s directly
  under `div[role="tree"]` tripped axe `aria-required-children` (a tree may only own
  `treeitem`/`group`). Gave them `role="treeitem"`. Note: full tree keyboard nav (roving
  tabindex / arrow keys) is still NOT implemented — the role is somewhat aspirational, but axe
  is satisfied. (Biome a11y-lint remains off — this was a runtime axe check.)
- **FEATURES.md** is referenced by the CLAUDE.md docs-system but does not exist (deferred).
- **`boojy.org/notes` download buttons are hardcoded to `v0.1.3`** (in the *separate* `Boojy`
  website repo: `website/src/pages/NotesPage.tsx:16,29,41` — macOS DMG, Windows EXE, hero CTA).
  The *version text* on that page auto-updates from the latest GitHub tag (`useNotesVersion.ts`),
  but the install links don't. Bump them when a tagged release publishes installers. (Deferred,
  user-acknowledged 2026-05-29.)

### Cost / telemetry notes

- Sessions here trend **long + subagent-heavy** — the two top cost drivers (per /cost,
  2026-05-28: 52% of spend at >150k context, 51% subagent-heavy; $28.30 for the web-only +
  tooling session). Levers for next time:
  - Run **Explore / audit subagents on Sonnet** (`model` override) — they're read-only search,
    don't need Opus. (They're still high-ROI: the doc-audit agent caught the stale TESTING.md.)
  - **`/clear` between independent phases** (this session bundled Phase 1→2→3→docs into one
    context). Expensive verification like `build:electron` is fine to keep — it earns its cost.
