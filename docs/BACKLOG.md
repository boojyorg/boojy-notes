# Boojy Notes — Backlog

What is left to do and what is known to be broken, checked against master after the September
2026 correctness wave (PRs #97–#106). Shipped work goes in `CHANGELOG.md`, never here. The
philosophy: finish Beta, daily-drive Boojy Notes, and let observed friction decide what deserves
to exist next. Nothing is added because it sounds plausible.

## Open decisions

Product calls for Tyr; each trades conventional Markdown meaning against byte preservation.

- **A paragraph typed straight after a quote is folded into the quote by other readers.** A lazy
  line read from a file stays its own paragraph so its bytes survive (quote lines are written
  with `> `), which means no blank line can be written before a paragraph after a quote. Fixing
  it needs a way for a quote to remember a lazy line without hidden per-block state. On record as
  one `it.fails` in `tests/utils/markdownInterop.test.js`.
- **Blank lines around headings, lists, fences and quotes are empty rows.** Only the blank line
  between a paragraph or list item and the paragraph or divider after it is structure; every
  other blank is a visible row, so an Obsidian-style note, which puts a blank line around nearly
  every heading, reads airy in the editor. The blank *after* a divider is the same case (the one
  before it became structure on 2026-09-05, because without it `---` is a heading underline).
  Making one such blank structural too keeps the common form tidy but needs a per-block "written
  tight" record to keep the rarer tight form byte-identical.
- **A `---` directly under a paragraph line is read as a divider, not a setext heading.** To
  every other reader `hello` / `---` is a heading called "hello"; Boojy Notes shows a paragraph
  and a rule, and its first save writes the blank line that makes the file a divider everywhere
  (a sanctioned byte change, see the spec). Reading it as a heading would be right and needs a
  setext heading form the serializer can write back byte-exact. On record as one `it.fails` in
  `tests/utils/markdownInterop.test.js`.

## Beta

Beta starts when the local desktop app feels complete enough for ordinary daily use that
missing core features no longer limit it. Worked one item at a time, each judged live.

- [ ] **Tables** — finished-feeling basic interaction: visible cells, caret in the first cell,
  Tab to the next cell, whole-table delete. Not started; Tyr gives the go.
- [ ] **Copy pass on Quote and Checklist.** (The rest of the subtraction pass landed on
  2026-09-05: theme picker Light / Dark / System, star field, onboarding hints, font-size
  preference, Collapse all folders, Change vault folder in the vault menu, Import, the
  backlinks panel and the PWA residue; see `CHANGELOG.md` Removed.)
- [ ] **Preservation blockers** — the first-edit mutations listed under Data safety below.
- [ ] **Visual polish, Windows smoke test, release.** The daily-driver build in `/Applications`
  is current master as of 2026-09-04 and never self-updates: rebuild after merges (CI rule) or
  cut a `v*` tag. `CHANGELOG.md` Unreleased already holds the notes.

## From the September 2026 review

Still reproduce on master, in the review's order. None blocks Beta on its own.

- [ ] **New note writes `Untitled.md` at once** — `createNote` makes a real note, so the sidebar's
  New note and Cmd+N reach disk within a second even if nothing is typed; only the empty-state
  draft waits for content (`useNoteCrud.js`).
- [ ] **A new folder's name is not selected** — the inline input autofocuses but does not select
  "Untitled Folder", so typing appends (`Sidebar.jsx`); note rows do select.
- [ ] **No context menu on plain text** — the editor's right-click handles links only and Electron
  supplies no default menu, so cut, copy and paste have no menu on desktop (`EditorArea.jsx`).
- [ ] **Rich paste is flattened** — paste reads `text/plain` only, so links and formatting from a
  browser or another app are dropped (`usePasteHandler.js`).
- [ ] **Sidebar drag needs a 400ms hold** before a note lifts (`useSidebarDrag.js`); no hint until
  the third attempt.
- [ ] **A cleared title shows a blank sidebar row** until the next write adopts `Untitled`.

## Later / ideas

Only ideas worth remembering. Empty is fine.

- A Recent list in the empty search palette, if daily use shows the last-touched note is hard to get back to.
- Move to folder… for a single note (drag and the bulk menu cover it today).
- A muted "N other files" hint on folders that hold PDFs and images the app cannot open; the
  folder's Reveal in Finder answers it for now.

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

## Data safety / reliability

**First-edit mutations.** Fine on open; the first edit of an affected note rewrites third-party
content. `KNOWN_FAILURES` in `tests/utils/preservation.test.js` is the full list; these two block Beta.

- [ ] **Tilde fences (`~~~`) parse as paragraphs** — the fence lines round-trip byte-exact, but
  the content renders as live blocks, so interacting with it rewrites code, and content that
  matches a normalising construct (tables, `- [X]`, `[!NOTE]`, bare `>`) is rewritten on any
  save. The fence matcher in `markdown.js` is backtick-only.
- [ ] **Table `:---` separators normalise to `---`** on first edit.

**Lost edits and filesystem.**

- [ ] **Concurrent flushes are not serialised** — blur, quit and the write-debounce timer can
  each run `flush` at once (`useFileSystem.js`, `useQuitFlush.js`). A flush now cancels the
  pending timer, so what remains is a redundant write when two overlap, and a theoretical
  mid-write kill if the quit handshake completes while a blur write is in flight (the atomic
  rename keeps the last complete file).
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
- [ ] **Unparseable files vanish from the sidebar** silently.

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
