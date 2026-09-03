# Boojy Notes — Backlog

What is left to do and what is known to be broken. Shipped work goes in `CHANGELOG.md`, never
here. The product philosophy that shapes this list: finish Beta, daily-drive Boojy Notes, and let
observed friction decide what deserves to exist next. Nothing is added because it sounds
plausible.

## Beta

Beta starts when the local desktop app feels complete enough for ordinary daily use that
missing core features no longer limit it. Worked one item at a time, each judged live.

- [ ] **Tables** — finished-feeling basic interaction: visible cells, caret in the first cell,
  Tab to the next cell, whole-table delete. Not started; Tyr gives the go.
- [ ] **Real empty folders and Move to folder…** — a folder with no notes exists only in memory
  today (no directory on disk) and vanishes on restart. Whether to create the directory eagerly
  or treat folders as a view of where notes are is Tyr's call; a filesystem/data-safety plan
  comes before any code.
- [ ] **Appearance cleanup** — remove the star field from the product (`StarField.jsx`,
  `DAY.starField`/`NIGHT.starField`, its `EditorArea` mount) and collapse the "Auto" mode plus
  its "Auto method" row into a plain System option so the picker reads Light / Dark / System.
  Stored `day`/`night`/`auto` values stay. Own small branch.
- [ ] **Subtraction** — onboarding hints, the font-size preference; copy pass on Quote and
  Checklist.
- [ ] **Preservation blockers** — the first-edit mutations listed under Data safety below.
- [ ] **Visual polish, Windows smoke test, release.** The daily-driver desktop build does not
  track master: rebuild or cut a `v*` tag. `CHANGELOG.md` Unreleased already holds the notes.

## Later / ideas

Only ideas worth remembering. Empty is fine.

- Quick Open (Cmd+P note switcher), if daily use shows switching friction now there are no tabs.
- Genuine folder nesting (folder rows are not draggable today, on purpose).

## Known technical debt

- **`useIsMobile` → `useIsTouch`** — the hook answers "is this a touch device", not "is the
  window narrow"; `useSidebarFits.ts` already owns the fit question.
- **Playwright shells out to npm** — `playwright.config.js` runs `npm run build && npm run
  preview`, so CI builds twice and the pnpm repo logs an unknown-config warning. Use pnpm.
- **`tests/electron/markdown.test.js` is misfiled** — it tests `src/utils/markdown.js`; move it
  beside `tests/utils/markdown.test.js` (no overlapping test names).
- **`ExportTab.jsx` renders Storage** — export was removed; rename to `StorageTab`.
- **`ci.yml` push trigger never matches** — it watches `feature/**`, branches are `feat/…`;
  the PR trigger covers everything. Fix the glob or drop the push trigger.
- **`engines.node` says `>=18`** — Vitest 4 needs 20, Electron 42 needs 22.12, CI pins 22.
- **Block IDs are minted on every re-parse** — `markdownToBlocks` uses a module-global counter,
  so a re-sync remounts every block and loses the caret. Fix is content-stable IDs; non-trivial.
- **`TagMenu` swallows the space that ends a tag** — `preventDefault` on space-dismiss.
- **Web build residue** — `manifest.json` and the apple-touch-icon point at an icon path that
  is not in `public/`, the theme colours are old night values, and the service worker's
  purpose is unclear now web is on hold. Parked with the web question, not Beta work.

## Data safety / reliability

**First-edit mutations.** Fine on open; the first edit of an affected note rewrites
third-party content. These are the preservation blockers in the Beta list.

- [ ] **Tilde fences (`~~~`) parse as paragraphs** — the fence lines round-trip byte-exact, but
  the content renders as live blocks, so interacting with it rewrites code, and content that
  matches a normalising construct (tables, `- [X]`, `[!NOTE]`, bare `>`) is rewritten on any
  save. The fence matcher in `markdown.js` is backtick-only.
- [ ] **Table `:---` separators normalise to `---`** on first edit.
- [ ] **Indented non-list content loses its leading whitespace** — the parse loop trims every
  line; `indent` only attaches to list blocks.
- [ ] **Wikilink image widths below 70 clamp up to 70** on first save.

**Lost edits and filesystem.**

- [ ] **Concurrent flushes are not serialised** — blur, quit and the write-debounce timer can
  each run `flush` at once (`useFileSystem.js`, `useQuitFlush.js`), and flush never clears the
  pending timer. Today: a redundant write, plus a theoretical mid-write kill if the quit
  handshake completes while a blur write is in flight (the atomic rename keeps the last
  complete file).
- [ ] **Rename crash window** — a crash between unlink and index save re-IDs the note; a crash
  before unlink leaves a visible duplicate that needs manual cleanup.
- [ ] **Double-close races** — `ipcMain.once` flush listeners accumulate on rapid Cmd+W then
  Cmd+Q; no renderer-alive check before the flush IPC, so a crashed renderer burns the 2s cap.
- [ ] **Orphaned `.*.tmp` files** after a crash followed by a rename.
- [ ] **Numbered lists keep their parsed number after an in-app reorder** — dragging item 3
  above item 1 saves `3. 1. 2.`; lossless on round-trip, wrong in any other renderer
  (`markdown.js` `numCounter`).
- [ ] **Wikilink rename does not update referrers** — silent link breakage.
- [ ] **Search index goes stale on text-only edits**, and results cap at 20.
- [ ] **Same-title notes are invisible to backlinks.**
- [ ] **Unparseable files vanish from the sidebar** silently.
- [ ] **`changeNotesDir` leaks the old vault's folders** into the new one.
- [ ] **Undo within 300ms is overwritten by the text flush.**

## Accessibility

E2E axe only catches critical violations on the initial screen. Known gaps below that:

- [ ] **Sidebar focus ring is invisible** — inline `outline:none` overrides the global ring, and
  the global ring is 25% opacity (`Sidebar.jsx`, `GlobalStyles.jsx`).
- [ ] **Context menus are `<div onClick>`** (Link/Table/Image/Slash/CalloutPicker): not
  keyboard-reachable, no roles or focus traps. SlashMenu's `aria-selected` on `menuitem` is
  invalid.
- [ ] **NIGHT `TEXT.muted` fails AA contrast** (`themes.js`); DAY was fixed, NIGHT was left for
  a later pass.
- [ ] **Sidebar tree has no arrow-key navigation** and lacks `aria-level`/`setsize`/`posinset`
  (`Sidebar.jsx`).
