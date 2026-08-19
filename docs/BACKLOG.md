# Boojy Notes — Backlog

Unscheduled / someday: bugs, QoL, chores, refactors. Pull an item into `dreams.md` when it becomes
the active target. Ordered milestones → `ROADMAP.md`; per-feature status → `FEATURE_TRACKER.md`.

## Data safety / vault-import hazards
(From the 2026-06-12 readiness audit + adversarial review — full details with file:line in
`docs/reviews/2026-06-12-reliability-wave-review.md`. The four worst items — vault index
mutation, split-pane flush loss, missing fsync, in-flight sync after toggle-off — were fixed
on the review branch and are not listed here.)

**First-edit mutations** (fine on open; the first edit of an affected note silently rewrites
third-party content — these gate confident Vault migration):
- [ ] Tilde-fence (`~~~`) code blocks parse as paragraphs — structure destroyed on save (P1).
  `markdown.js:189` only matches backtick fences.
- [ ] Table `:---` explicit-left-align separators normalize to `---` on first edit (P2).
- [ ] Indented non-list content (HTML embeds, continuation paragraphs) loses leading
  whitespace (P2). Parse loop trims every line; `indent` only attaches to list blocks.
- [ ] Wikilink image widths `![[img|N]]` with N < 70 clamp up to 70 on first save (P2).

**Reliability follow-ups:**
- [ ] Failed disk writes drop the note from the dirty set with no retry — error toast, then the
  note exists only in React state (P2). `useFileSystem.js:172`.
- [ ] Rename crash-window can re-ID a note (crash between unlink and index save) or leave a
  visible duplicate (crash before unlink — by design, but cleanup is manual) (P2/P3).
- [ ] Double-close races: `ipcMain.once` flush listeners accumulate on rapid Cmd+W + Cmd+Q;
  no renderer-alive guard before the flush IPC (wastes the 2s cap after a renderer crash) (P3).
- [ ] Orphaned `.*.tmp` files accumulate after a crash followed by a note rename (P3).
- [ ] Wikilink rename doesn't update referrers — silent link breakage (audit).
- [ ] Search index stale on text-only edits + hard 20-result cap (audit).
- [ ] Same-title notes invisible to backlinks (audit).
- [ ] Unparseable files silently vanish from the sidebar (audit).
- [ ] `changeNotesDir` leaks the old vault's folders into the new one (audit).
- [ ] Undo within 300ms gets overwritten by the text flush (audit).

**Sync (before sync is ever re-enabled on desktop):**
- [ ] Sync pull has no timestamp merge — stale cloud copy can clobber newer local notes (audit;
  **hard blocker** for re-enabling sync).
- [ ] Conflict-resolution UI unreachable on desktop — the whole Profile/sync surface is
  unmounted (2026-08-18), so pre-existing conflict notes have no resolution path (P2).
  Resolve as part of whatever sync UI is (re)built when sync returns.
- [ ] BroadcastChannel receive path applies cross-tab note changes without a `syncEnabled`
  guard (P3). `useSync.js:114`.
- [ ] Web `beforeunload` flush reads stale state (web-only, deferred; audit).

**Split-pane:** section retired 2026-08-18 — split view and tabs were removed outright
(single-active-note refactor), which closes the PaneContainer tag-autocomplete and
per-pane `editedNoteHint` items with them.

## Refactor / docs
- [ ] `BoojyNotes.jsx` decomposition (standing-debt #1) — 5 hooks extracted across 2 cycles, then
  the single-active-note refactor removed the split-view glue (root now ~1,110 lines). Remaining
  candidates: ghost-note/draft effects, `Sidebar` (1,314 lines — now the largest file: tree +
  search results).
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

- [ ] **Quick Open** (high value / medium effort) — Cmd+O/Cmd+P fuzzy note switcher; the natural
  companion to single-active-note navigation (no tabs to lean on).
- [ ] **Back/forward history** (high value / low-medium) — a small stack behind Cmd+[ / Cmd+]
  now that opening a note replaces the current one; would also soften delete-lands-on-draft.
- [ ] **Recents** (medium / low) — last-N notes in sidebar or Quick Open's empty state.
- [ ] **Backlinks panel** (high value / medium effort) — "Notes that link to this note" in a
  sidebar. Wikilink data is already in block text; needs a reverse index.
- [ ] **Note version history** (high value / medium) — browse/restore previous versions via the undo
  system or sync snapshots.
- [ ] **Keyboard shortcut cheat sheet** (high value / medium) — a `?` overlay listing all shortcuts;
  helps onboarding.
- [ ] **Math/LaTeX blocks** (high value / higher effort) — a `math` block rendering LaTeX via KaTeX.
- [ ] **Mermaid diagram blocks** (high value / higher) — a `diagram` block in the slash menu.
- [ ] **Table improvements** (medium / low) — column resize, row/column sort, tab-to-next-cell.
- [ ] **Image lightbox** (medium / low) — zoom/pan, keyboard nav between images in a note.
- [ ] **Indent guides** (medium / low) — lines connecting indented blocks to their parent.
- [ ] **Auto-save indicator** (nice to have) — visual cue for last-saved / unsaved changes.

## Tier-3 accessibility clusters
(E2E axe only catches *critical* on the initial screen — these are the known sub-critical gaps.)
- [ ] Sidebar focus ring invisible — inline `outline:none` overrides global; global ring is also
  25%-opacity (fails contrast). `Sidebar.jsx`, `GlobalStyles.jsx:66`.
- [ ] Icon-only buttons use `title` not `aria-label` (Help & Settings close buttons).
  `HelpDropdown.jsx`. *(Narrowed: TopBar undo/redo/Help were removed in the minimal-chrome pass;
  the surviving `EditorChrome` buttons set `aria-label`. `HelpDropdown` was deleted 2026-08-19
  (git history has it) — this item only applies if Help returns, rebuilt.)*
- [ ] Context menus are `<div onClick>` (Link/Table/Image/Slash/CalloutPicker) — not keyboard-
  reachable; missing roles + focus traps. SlashMenu `aria-selected` on `menuitem` is also invalid.
- [ ] Low-contrast theme tokens fail AA: **NIGHT** `TEXT.muted`. `themes.js`.
  *(DAY was fixed in the Phase 1 light-palette pass — `TEXT.muted` 4.6:1, accent 5.3:1, wikilink now
  uses the accent. NIGHT was deliberately left untouched in that pass.)*
- [ ] Sidebar tree: no arrow-key nav + missing `aria-level`/`setsize`/`posinset` (role is currently
  aspirational; axe is satisfied but full keyboard nav isn't implemented). `Sidebar.jsx`.
- [ ] ProfileTab inputs: placeholder-only, no `<label>`/`aria-label`; password toggle unlabeled.
  *(ProfileTab was deleted 2026-08-19 — a rebuilt sign-in surface must not repeat this.)*
