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
- [ ] `saveTrashMeta` is non-atomic — power loss can corrupt `.boojy-trash-meta.json`, orphaning
  every trashed note from the UI (P2). `trashManager.js:34`.
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
- [ ] Conflict-resolution UI unreachable on desktop now that the sync panel hides when the
  toggle is off — pre-existing conflict notes have no resolution path (P2). `ProfileTab.jsx:779`.
- [ ] Auth session refresh + billing-profile fetch hit Supabase even with sync off — note data
  never moves, but "local-only" should mean no cloud traffic (P2). `useAuth.js:28`.
- [ ] BroadcastChannel receive path applies cross-tab note changes without a `syncEnabled`
  guard (P3). `useSync.js:114`.
- [ ] Web `beforeunload` flush reads stale state (web-only, deferred; audit).

**Split-pane (beyond the fixed flush bug):**
- [ ] `PaneContainer` doesn't pass `tagMenuRef`/`setTagMenu` to `useEditorHandlers` — tag
  autocomplete silently broken in split panes (P2). `PaneContainer.jsx:131`.
- [ ] `editedNoteHint`/`activeNoteRef` track the mouse-clicked pane only — keyboard-focus into
  the other pane stamps the wrong note id (P1 finding; impact reduced now that the quit flush
  uses the `unflushedNotes` set, but sync's hint can still mis-target). `useHistory.js:102`.

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
