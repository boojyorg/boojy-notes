# Boojy Notes — Backlog

Unscheduled / someday: bugs, QoL, chores, refactors. Pull an item into `dreams.md` when it becomes
the active target. Ordered milestones → `ROADMAP.md`; per-feature status → `FEATURE_TRACKER.md`.

## Refactor / docs
- [ ] `BoojyNotes.jsx` decomposition (standing-debt #1) — 5 hooks extracted across 2 cycles, root
  **1,675 → ~1,400 lines**. Further candidates: split-view glue, ghost-note/draft effects,
  `ProfileTab` (915 lines), `Sidebar` (897 lines).
- [ ] (optional) Create `FEATURES.md` — plain-language, recruiter/user-facing tour (docs-system gap).

## Bugs / QoL
- [ ] Orphaned onboarding hint bubble — the "Type / for commands" tooltip floats detached
  top-center of the editor, not anchored to anything (interactive-only find; reposition/anchor it).
- [ ] `markdownToBlocks` global ID counter — module-global `_parseBlockId` mints new block IDs on
  every re-parse → React remounts all block DOM (lost cursor) on re-sync. Low priority; fix is
  content-stable IDs (non-trivial, ripple risk). `markdown.js:34`.
- [ ] `TagMenu` space-dismiss — `preventDefault` swallows the space that legitimately ends a tag
  (minor). `TagMenu.jsx:48`.

## Cross-repo
- [ ] `notes.boojy.org` download buttons hardcoded to `v0.1.3` — in the **separate `boojy-web`
  repo** (now Astro). The pre-Astro path `website/src/pages/NotesPage.tsx:16,29,41` is **stale** —
  re-find the current download-link source in boojy-web before bumping. Version *text* auto-updates
  from the latest GitHub tag; the install links don't. (User-acknowledged deferred.)

## Feature ideas
(Folded in from the old `FUTURE-IDEAS.md`, grouped by effort/impact. **Status unverified** — some
may already be partly shipped; confirm against the app before picking one up.)

- [ ] **Backlinks panel** (high value / medium effort) — "Notes that link to this note" in a
  sidebar. Wikilink data is already in block text; needs a reverse index.
- [ ] **Note version history** (high value / medium) — browse/restore previous versions via the undo
  system or sync snapshots.
- [ ] **Keyboard shortcut cheat sheet** (high value / medium) — a `?` overlay listing all shortcuts;
  helps onboarding.
- [ ] **Math/LaTeX blocks** (high value / higher effort) — a `math` block rendering LaTeX via KaTeX.
- [ ] **Mermaid diagram blocks** (high value / higher) — a `diagram` block in the slash menu.
- [ ] **Export to PDF** (medium / low) — Electron `webContents.printToPDF()`.
- [ ] **Drag blocks between panes** (medium / low) — in split-pane mode.
- [ ] **Table improvements** (medium / low) — column resize, row/column sort, tab-to-next-cell.
- [ ] **Image lightbox** (medium / low) — zoom/pan, keyboard nav between images in a note.
- [ ] **Indent guides** (medium / low) — lines connecting indented blocks to their parent.
- [ ] **Auto-save indicator** (nice to have) — visual cue for last-saved / unsaved changes.

## Tier-3 accessibility clusters
(E2E axe only catches *critical* on the initial screen — these are the known sub-critical gaps.)
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
