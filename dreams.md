# DREAMS.md — Boojy Notes Active Target

> Live working memory: the Active Engineering Target + milestone/backlog checklist. Read at the
> start of every session to establish target context; tick `- [ ]` → `- [x]` as items resolve.
> Slow-changing rules live in `CLAUDE.md` + `.claude/rules/`; session history lives in `git log`
> and Claude Code auto memory. This file is volatile state only.

## 1. 🎯 Active Engineering Target

**Status:** **v0.4.0 shipped** (2026-05-29) — terminal removed (`terminal-snapshot` tag for re-add)
+ top bar simplified, web delete-confirm, bug/a11y batch. Pushed to `master` (web auto-deploys to
`notes.boojy.org`); `v0.4.0` tag built the desktop DMG/EXE. CI **green**.

**In flight (unreleased) — v0.5.0 "Markdown is the truth" milestone:**
- **Constraint adopted:** `docs/SPEC-markdown-source-of-truth.md` (a note *is* its markdown;
  blocks are a rendering; every block must round-trip losslessly). Bound from `CLAUDE.md`.
  Enforced by `tests/utils/markdown.test.js` (31 cases incl. documented intrinsic losses).
- **C2:** indent restricted to list types (`useKeyboardHandlers`) — closed a silent
  paragraph/heading-indent round-trip data-loss bug.
- **Part B:** starfield fades on first content (`StarField` opacity prop + `EditorArea`
  `noteHasContent` ref+state; live-DOM signal on first keystroke, blocks signal on open/empty).
- **C3:** drag-reorder *already existed* (`useBlockDrag`, hold-and-drag) — added the missing
  **keyboard reorder** `Cmd/Ctrl+Shift+↑/↓` via new `moveBlock` in `useBlockOperations`,
  threaded through `useEditorHandlers` → `useKeyboardHandlers`. Reorder round-trips cleanly
  (confirmed via the C1 test — blocksToMarkdown walks the array in order).
- **Gates:** typecheck clean, 634 unit tests + 5 E2E green, coverage gate passes, format clean.
- **Not yet manually walked through on `pnpm dev`** — spot-check the starfield fade (type → fade
  out; empty → fade in; focus-only keeps stars), keyboard block-move, and list-only indent.

**Prior (unreleased):** `BoojyNotes.jsx` decomposition (standing-debt #1) — 5 hooks extracted
across 2 cycles, root **1,675 → ~1,400 lines**, all unit-tested. Further candidates: split-view
glue, ghost-note/draft effects, `ProfileTab`/`Sidebar`.

### Milestone checklist (recent)

- [x] Drop Capacitor → web + desktop only (v0.3.0)
- [x] ESLint + Prettier → Biome; npm → pnpm
- [x] Fix CI coverage gate (thresholds → floor at actuals) + sidebar-tree a11y → green E2E/CI
- [x] Confirm web live (`notes.boojy.org`); desktop installers built (v0.3.0, v0.4.0)
- [x] Remove terminal (tagged `terminal-snapshot`) + simplify top bar — shipped in v0.4.0
- [x] Release v0.4.0 (package.json + CHANGELOG bumped, tag pushed, DMG/EXE built)

### Backlog (unscheduled)

**Refactor / docs**
- [ ] (optional) Phase 3 cont.: extract from `ProfileTab` (915 lines) / `Sidebar` (897 lines)
- [ ] (optional) Create `FEATURES.md` (docs-system gap)

**Bugs / QoL**
- [ ] Orphaned onboarding hint bubble — the "Type / for commands" tooltip floats detached
  top-center of the editor, not anchored to anything (interactive-only find; reposition/anchor it).
- [ ] `markdownToBlocks` global ID counter — module-global `_parseBlockId` mints new block IDs on
  every re-parse → React remounts all block DOM (lost cursor) on re-sync. Low priority; fix is
  content-stable IDs (non-trivial, ripple risk). `markdown.js:34`.
- [ ] `TagMenu` space-dismiss — `preventDefault` swallows the space that legitimately ends a tag
  (minor). `TagMenu.jsx:48`.

**Cross-repo**
- [ ] `boojy.org/notes` download buttons hardcoded to `v0.1.3` (in the *separate* `Boojy` website
  repo: `website/src/pages/NotesPage.tsx:16,29,41` — macOS DMG, Windows EXE, hero CTA). Version
  *text* auto-updates from the latest GitHub tag; the install links don't. Now unblocked — bump the
  3 URLs to a published release. (User-acknowledged deferred.)

**Tier-3 accessibility clusters** (E2E axe only catches *critical* on the initial screen)
- [ ] Sidebar focus ring invisible — inline `outline:none` overrides global; global ring is also
  25%-opacity (fails contrast). `Sidebar.jsx`, `GlobalStyles.jsx:66`.
- [ ] Icon-only buttons use `title` not `aria-label` (TopBar undo/redo/toggles/Help/Settings; Help &
  Settings close buttons). `TopBarDesktop.jsx`, `HelpDropdown.jsx`.
- [ ] Context menus are `<div onClick>` (Link/Table/Image/Slash/CalloutPicker) — not keyboard-
  reachable; missing roles + focus traps. SlashMenu `aria-selected` on `menuitem` is also invalid.
- [ ] Low-contrast theme tokens fail AA: DAY/NIGHT `TEXT.muted`, DAY accent-as-text, DAY wikilink.
  `themes.js`.
- [ ] Sidebar tree: no arrow-key nav + missing `aria-level`/`setsize`/`posinset` (role is currently
  aspirational; axe is satisfied but full keyboard nav isn't implemented). `Sidebar.jsx`.
- [ ] PaneTabBar: `<span role=button>` nested inside `<button role=tab>` — invalid. `PaneTabBar.jsx:137`.
- [ ] ProfileTab inputs: placeholder-only, no `<label>`/`aria-label`; password toggle unlabeled.
