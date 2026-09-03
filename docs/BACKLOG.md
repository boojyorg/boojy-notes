# Boojy Notes — Backlog

What we are doing, what we might do, and what is known to be broken. Shipped work is in
`CHANGELOG.md`, never here. Pull an item up a section when it becomes real; delete it when it
ships or stops mattering.

## Now — Beta finishing pass (desktop-only)

Worked one item at a time, each judged live in daily use. Standing instruction: nothing is
picked up until friction is observed. The product triangle to judge against: Apple Notes
simplicity, Obsidian ownership, Notion editing fluidity.

- [ ] Tables: finished-feeling basic interaction (visible cells, caret in first cell, Tab to
  the next cell, whole-table delete). Not started; Tyr gives the go.
- [ ] Real empty folders and Move to folder… Today a folder with no notes exists only in
  memory (no directory on disk), so it vanishes on restart. The product decision (create the
  directory eagerly, or accept folders as a view of where notes are) is deliberately open;
  needs a filesystem/data-safety plan presented before any code. Don't pick semantics without
  Tyr.
- [ ] Hints/onboarding removal; copy pass (Quote/Checklist); font-size preference removal.
- [ ] Preservation blockers: indented fences, tilde-fence interaction, image width clamp,
  indented-content whitespace, trailing-space trim on list lines (details under Data safety).
- [ ] Visual polish, Windows smoke test, release. The desktop daily-driver build does not track
  master: rebuild or cut a `v*` tag. `CHANGELOG.md` Unreleased already holds the notes.

## Next — worth considering after Beta

- **Quick Open** — Cmd+O/Cmd+P fuzzy note switcher; the natural companion to single-active-note
  navigation.
- **Back/forward history** — a small stack behind Cmd+[ / Cmd+]; would also soften
  delete-lands-on-draft.
- **Recents** — last-N notes in the sidebar or Quick Open's empty state.
- **Keyboard shortcut reference** — a `?` overlay. The old `HelpDropdown` content is in git
  history; re-verify its shortcuts against `useAppKeyboard` before reusing any of it.
- **Table extras** beyond the Now item — column resize, row/column sort.

## Later — deliberately parked

- Note version history (browse/restore previous versions).
- Math/LaTeX blocks (KaTeX) and Mermaid diagram blocks. Both must pass the source-of-truth
  spec's round-trip rule first.
- Indent guides for nested lists; auto-save indicator.
- Web persistence storing markdown strings instead of block JSON (the spec's committed
  direction, not a milestone).

## Known technical debt

- [ ] Rename `useIsMobile` → `useIsTouch` across its call sites. It answers "is this a touch
  device", not "is the window narrow"; `useSidebarFits.ts` already carries the fit question.
- [ ] `playwright.config.js` shells out to `npm run build && npm run preview`, so CI builds the
  app a second time and the pnpm repo logs an `Unknown project config "node-linker"` warning.
  Switch to pnpm.
- [ ] `tests/electron/markdown.test.js` tests `src/utils/markdown.js`, not Electron code; it
  belongs beside `tests/utils/markdown.test.js` (no overlapping test names).
- [ ] `src/components/settings/ExportTab.jsx` renders the Storage section; export was removed.
  Rename to `StorageTab`.
- [ ] `ci.yml` triggers on pushes to `feature/**` but branches are named `feat/…`, so push-CI
  never fires; the PR trigger covers everything. Fix the glob or drop the push trigger.
- [ ] `engines.node` says `>=18`; Vitest 4 needs 20, Electron 42 needs 22.12, CI pins 22.
- [ ] PWA residue on the web build: `manifest.json` and the apple-touch-icon point at
  `/assets/icon.png`, which is not in `public/`, so the built site 404s on its own icon; the
  theme colours are the old night values. Decide whether the web build keeps its service worker
  at all now the product is desktop-only.
- [ ] `markdownToBlocks` global ID counter: `_parseBlockId` mints new block IDs on every
  re-parse, so React remounts every block (lost cursor) on re-sync. Fix is content-stable IDs;
  non-trivial, ripple risk.
- [ ] `TagMenu` space-dismiss: `preventDefault` swallows the space that legitimately ends a tag.
- [ ] Orphaned onboarding hint bubble: the "Type / for commands" tooltip floats detached at the
  top-centre of the editor, anchored to nothing (moot if the Now item removes hints).

## Data safety / vault-import hazards

**First-edit mutations.** Fine on open; the first edit of an affected note silently rewrites
third-party content. These gate confident use on a vault you care about.

- [ ] Tilde-fence (`~~~`) code blocks parse as paragraphs. A rendering defect, not save damage:
  the fence lines and typical content round-trip byte-exact (`tilde-fences.md` passes the
  preservation corpus). The real hazards: fence content renders as live rich blocks, so
  *interacting* with it rewrites code text; and fence content matching a normalising construct
  is rewritten on any save (tables reflow padding and `:---`, `- [X]` lowercases, `[!NOTE]`
  lowercases, bare `>` gains a space). The fence matcher in `markdown.js` is backtick-only (P2).
- [ ] Table `:---` explicit-left-align separators normalise to `---` on first edit (P2).
- [ ] Indented non-list content (HTML embeds, continuation paragraphs) loses leading whitespace;
  the parse loop trims every line and `indent` only attaches to list blocks (P2).
- [ ] Wikilink image widths `![[img|N]]` with N < 70 clamp up to 70 on first save (P2).

**Reliability.**

- [ ] Rename crash-window can re-ID a note (crash between unlink and index save) or leave a
  visible duplicate (crash before unlink; cleanup is manual) (P2/P3).
- [ ] Double-close races: `ipcMain.once` flush listeners accumulate on rapid Cmd+W then Cmd+Q;
  no renderer-alive guard before the flush IPC, which wastes the 2s cap after a renderer crash
  (P3).
- [ ] Concurrent flushes are not serialised: blur, quit and the write-debounce timer can each
  run `flush` at once (`useFileSystem.js`, `useQuitFlush.js`), and flush never clears the pending
  timer. Today that means a redundant write, plus a theoretical mid-write kill if the quit
  handshake completes while a blur write is still in flight (the atomic rename keeps the last
  complete file) (P3).
- [ ] Orphaned `.*.tmp` files accumulate after a crash followed by a note rename (P3).
- [ ] Numbered items keep their parsed `num` after an in-app reorder, so dragging item 3 above
  item 1 saves `3. 1. 2.`: lossless on round-trip, out of sequence in any other renderer
  (`markdown.js` `numCounter`) (P3).
- [ ] Wikilink rename doesn't update referrers: silent link breakage.
- [ ] Search index stale on text-only edits, plus a hard 20-result cap.
- [ ] Same-title notes invisible to backlinks.
- [ ] Unparseable files silently vanish from the sidebar.
- [ ] `changeNotesDir` leaks the old vault's folders into the new one.
- [ ] Undo within 300ms gets overwritten by the text flush.
- [ ] Web `beforeunload` flush reads stale state (web-only).

## Accessibility

E2E axe only catches *critical* violations on the initial screen. Known sub-critical gaps:

- [ ] Sidebar focus ring invisible: inline `outline:none` overrides the global ring, and the
  global ring is 25%-opacity, which fails contrast (`Sidebar.jsx`, `GlobalStyles.jsx`).
- [ ] Context menus are `<div onClick>` (Link/Table/Image/Slash/CalloutPicker): not
  keyboard-reachable, missing roles and focus traps. SlashMenu's `aria-selected` on `menuitem`
  is also invalid.
- [ ] NIGHT `TEXT.muted` fails AA contrast (`themes.js`). DAY was fixed in the light-palette
  pass; NIGHT was deliberately left for a later pass.
- [ ] Sidebar tree has no arrow-key navigation and is missing `aria-level`/`setsize`/`posinset`;
  axe is satisfied but full keyboard navigation isn't implemented (`Sidebar.jsx`).
