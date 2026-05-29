# DREAMS.md — Boojy Notes Intent Buffer & Devlog

> Live working memory. Read this at the start of every session to establish target
> context. Tick `- [ ]` → `- [x]` as items resolve. Law (slow-changing rules) lives in
> CLAUDE.md; this file is state (changes every session).

## 1. 🎯 Active Engineering Target

**Status:** v0.3.0 **pushed + tagged** (web-only pivot + Biome + pnpm + BoojyNotes slice-1).
v0.3.0 GitHub Release **published** (2026-05-29, marked Latest — macOS DMG + Windows EXE live).
Sidebar a11y violation **fixed** → **CI is GREEN** (run `26623799556`) for the first
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

### 🐛 Audit Backlog — bugs + QoL + a11y (2026-05-29, 4 parallel Sonnet auditors)

> Triaged sweep of the whole codebase. `✓` = Claude verified by reading the code; `?` =
> agent-reported, NOT yet verified (confirm before fixing). Tackle Tier 1 #2/#3/#4 first
> (small, low-risk, high-value); #1 is most important but needs runtime testing.

**Tier 1 — correctness bugs**
- [x] **#1 ✓ FIXED 2026-05-29 — Remote edits didn't appear in the open note** (High). Threaded
  `syncGeneration` into `useSync`; bump it (only when the applied note === `activeNoteIdRef`) at
  the 3 remote-apply sites: cross-tab BroadcastChannel, pull-merge, realtime upsert. Open-note-
  only guard avoids clobbering an in-progress edit elsewhere. `useSync.js`. _Still want a live
  two-device/two-tab runtime check to confirm._
- [x] **#2 ✓ FIXED 2026-05-29 — Wikilink autocomplete navigated away.** Dropped the
  `handleWikilinkClick(title)` call in `handleWikilinkSelect`; link inserts, cursor stays put.
- [x] **#3 ✓ FIXED 2026-05-29 — Nested folder rename orphaned it.** `useNoteCrud.js:145` now
  writes `newPath` not `newName`.
- [x] **#4 ✓ FIXED 2026-05-29 — Mobile image insert broken.** `saveAndInsertImage` now accepts
  either a File/Blob or the `{fileName,dataBase64}` picker result; mobile toolbar passes a real
  `afterIndex` (end of note). (Confirmed both platforms' `pickImageFile` return the picker shape.)
- [ ] **#5 ? Paste HTML-nesting corruption** (agent: Critical, UNVERIFIED). `sanitizeNode` may
  nest a block `<div>` inside inline tags → broken bold/italic/code on paste.
  `inlineFormatting.js:235,271`. _Verify first._
- [ ] **#6 ? `cancelFirstSync` doesn't block later auto-trigger** (agent: High, UNVERIFIED).
  visibilitychange/online listeners may fire full first-sync push after you cancelled →
  uploads all local notes unconfirmed. `useSync.js:547,559`. _Verify first._
- [ ] **#7 ? Link URL attr not escaped** (agent: High, UNVERIFIED). `inlineMarkdownToHtml` step 9
  interpolates URL into `href="$2"` without `escAttr` (already defined L43). `inlineFormatting.js:56`.
- [ ] **#8 ? Strikethrough/highlight toggle strips nested formatting** (agent: Med). Replaces
  element with `textContent`. `useInlineFormatting.js:83`.
- [ ] **#9 ? Type+Enter pushes two undo steps** (agent: Med). `pushHistory` microtask timing.
  `useHistory.js:35`.
- [ ] **#10 ? `markdownToBlocks` global ID counter** (agent: Low). Re-sync in same session
  remounts all block DOM (lost cursor/edit). `markdown.js:34`.
- [x] **#11 ✓ FIXED 2026-05-29 (pending visual verify) — Empty-block placeholder overlapped
  typed text** (Med, USER-REPORTED — **the QoL auditor missed this**). "Type / for commands…"
  lingered behind the first line until a second line existed, because the `empty-block` class
  was gated on the debounced `block.text===""` rather than live DOM emptiness. Fix: make the
  class stable (first block) + show via CSS `.empty-block:empty / :has(>br:only-child)::before`
  (empty blocks hold a `<br>`, so plain `:empty` alone was insufficient). `EditableBlock.jsx:247`,
  `GlobalStyles.jsx:458`. _Audit-miss lesson: the UX agent reviewed code statically and never
  ran the app, so a debounce/render-timing visual bug was invisible to it — interactive bugs
  need a running-app pass, not just code review._

**Tier 2 — high-impact QoL**
- [ ] Destructive actions w/o confirm: right-click→Delete (web has no Trash → gone) +
  **Empty Trash** (single click, irreversible). `ContextMenu.jsx:163`, `Sidebar.jsx:829`.
- [ ] Focus dropped after closing overlays (Settings/slash/context menus) — must re-click editor.
- [~] ~~Settings modal: Escape doesn't close~~ **FALSE POSITIVE** (interactive pass 2026-05-29:
  Escape DOES close Settings on the desktop web build). Audit agent was wrong; dropped.
- [ ] FindBar shows "0 of 0" silently on Firefox/older Safari (no CSS Highlight API).
- [ ] Backlinks panel entries are `div onClick` — not keyboard-activatable. `BacklinksPanel.jsx:57`.
- [ ] Mobile TopBar title not tappable to rename. `TopBarMobile.jsx:68`.
- [ ] Auth submit button shows "..." with no `aria-busy`/spinner. `ProfileTab.jsx:473`.

**Tier 3 — accessibility clusters** (E2E axe only catches *critical* on initial screen)
- [ ] Sidebar focus ring invisible — inline `outline:none` overrides global (`Sidebar.jsx:97,
  225,336,481`); global ring also 25%-opacity, fails contrast (`GlobalStyles.jsx:66`).
- [ ] Icon-only buttons use `title` not `aria-label` — TopBar undo/redo/toggles/Help/Settings;
  Help & Settings close (`✕`) buttons. Cluster fix. `TopBarDesktop.jsx:221+`, `HelpDropdown.jsx:102`.
- [ ] Context menus are `<div onClick>` (Link/Table/Image/Slash/CalloutPicker) — not keyboard-
  reachable; missing roles + focus traps. Also SlashMenu `aria-selected` on `menuitem` is invalid.
- [ ] Low-contrast theme tokens fail AA: DAY/NIGHT `TEXT.muted`, DAY accent-as-text, DAY wikilink.
  `themes.js:16,122,124,169`.
- [ ] Sidebar tree: no arrow-key nav + missing `aria-level`/`setsize`/`posinset` (the
  "aspirational tree" gap). `Sidebar.jsx:627,78,156`. _Overlaps the planned sidebar-keyboard-nav._
- [ ] PaneTabBar: `<span role=button>` nested inside `<button role=tab>` — invalid. `PaneTabBar.jsx:137`.
- [ ] ProfileTab inputs: placeholder-only, no `<label>`/`aria-label`; password toggle unlabeled.

**Calibration note:** the agent-flagged "TagMenu space dismisses" was over-rated High — tags are
single-token so space legitimately ends a tag; the only real issue is `preventDefault` swallows
that space (minor). `TagMenu.jsx:48`.

### 🖥️ Interactive pass findings (2026-05-29, Playwright drive of `dev:web`)

> Ran the actual app to catch runtime/visual bugs the static audit structurally couldn't.
- ✅ **Placeholder fix verified live** — `.empty-block::before` content is `none` once text is typed; no overlap.
- ✅ **Wikilink #2 (no-navigation) verified live** — active note unchanged after selecting from `[[ ]]` menu.
- ✅ Editor core clean: markdown (`#`, `**bold**`, `*italic*`), slash menu (all block types), undo/redo, new note, Settings modal — all render correctly. **Zero console errors/warnings** across every flow.
- 🔎 **2 audit false-positives corrected:** TagMenu-space (above) and Settings-Escape (now struck through in Tier 2).
- [ ] 🐛 **NEW — orphaned onboarding hint bubble** (Med, interactive-only find). The "Type / for
  commands" onboarding tooltip floats detached top-center of the editor, not anchored to anything
  (see screenshots). Static audit missed it; only visible when running. Worth repositioning/anchoring.
- [x] 🐛 **FIXED 2026-05-29 — Wikilink menu selection was fully broken** (user-reported; my
  removing the nav call exposed TWO latent bugs the earlier Playwright run actually caught but I
  wrongly explained away — lesson: trust the failing test). Both now fixed + verified live via
  click AND Enter:
  1. **Enter inserted a newline instead of selecting.** `WikilinkMenu`'s window keydown listener
     called `preventDefault()` but not `stopPropagation()`, so Enter bubbled to the editor's
     keydown handler, which split the block. Fix: `stopPropagation()` on the keys the menu owns.
     `WikilinkMenu.jsx`.
  2. **Clicking inserted nothing.** `handleWikilinkSelect` ran from a *native* window listener, so
     React never re-rendered the (text-optimised) editor → the `syncGen` DOM-resync effect never
     fired → the inserted `]]` was invisible. `commitTextChange`→`commitNoteData`, reorder, and
     `flushSync` all FAILED to force the re-render. Fix that worked: write the rendered HTML to the
     block element **directly** (`inlineMarkdownToHtml` → `el.innerHTML`, the `useInputHandler`
     pattern) + place caret at end; keep `commitNoteData` for state. `BoojyNotes.jsx`.
  - **Architecture note for next time:** the syncGen re-sync mechanism does NOT work when invoked
    from a native event listener (only React synthetic events re-render the optimised editor). The
    wikilink menu is the only menu using a native window listener; the slash menu uses the React
    keydown path. Worth unifying eventually.

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
  but the install links don't. **NOW UNBLOCKED** — v0.3.0 is published with assets
  (`Boojy-Notes-0.3.0-arm64.dmg`, `Boojy-Notes-Setup-0.3.0.exe`). Bump the 3 hardcoded URLs to
  v0.3.0. NB: v0.2.0/v0.1.9 releases are still *drafts* — v0.1.3 was the last published before
  v0.3.0. (Deferred, user-acknowledged 2026-05-29.)

### Cost / telemetry notes

- Sessions here trend **long + subagent-heavy** — the two top cost drivers (per /cost,
  2026-05-28: 52% of spend at >150k context, 51% subagent-heavy; $28.30 for the web-only +
  tooling session). Levers for next time:
  - Run **Explore / audit subagents on Sonnet** (`model` override) — they're read-only search,
    don't need Opus. (They're still high-ROI: the doc-audit agent caught the stale TESTING.md.)
  - **`/clear` between independent phases** (this session bundled Phase 1→2→3→docs into one
    context). Expensive verification like `build:electron` is fine to keep — it earns its cost.
