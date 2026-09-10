# Boojy Notes — Backlog

Direction, what is left to do and what is known to be broken, checked against master on
2026-09-07. Shipped work goes in `CHANGELOG.md`, never here. The philosophy: finish Beta,
daily-drive Boojy Notes, and let observed friction decide what deserves to exist next. Nothing
is added because it sounds plausible.

Three tiers, kept apart. **Release requirements** are what Beta waits for. **Beta candidates**
are optional; each is judged on its own and may be declined. **Future** is everything after
Beta, recorded so a preference and its open question are not lost. Last reviewed: 2026-09-07,
closing out the whole-repo review of 2026-09-06 (its fixes are in `CHANGELOG.md` Unreleased; the
residue is here).

## Direction

Boojy Notes sits between Apple Notes, Obsidian and Notion: approachable writing, ordinary
Markdown files, lightweight organisation and easy movement between apps. All three audiences
inform the defaults; Notion's editing convenience is the reference and its clutter the thing to
avoid. Bring existing notes in, create and edit without ceremony, find them again, keep the
files. Migration quality, editing comfort and access across devices are expected to matter
more than any feature nobody else has. That is a product hypothesis, not validated demand.

- **Beta is desktop-first**: local files, no account, no sync. Web, mobile, accounts and cloud
  come after desktop; their sequence is undecided. Personal tools only; collaboration is
  excluded.
- **Boojy Notes and every editing feature are free.** Local use never needs an account. The
  suite position on hosted storage lives in the suite root's `VISION.md` §7; nothing in this
  backlog assumes any particular Cloud outcome.
- **Obsidian compatibility and Notion-first import are complementary.** Existing Markdown
  folders, Obsidian vaults included, open as they are (the spec's support dimensions). Notion is
  the first migration priority; Apple Notes follows.
- **Dependable everyday Markdown and interoperability come before more formatting features.**
  The read/render, edit/write and preservation contract lives in
  `docs/SPEC-markdown-source-of-truth.md`; broader syntax support need not expand the menus.
- **One visible note and one New Note workflow.** Opening a note replaces it; no tabs, no
  split view. Every entry point (the button, Cmd+N, a folder's menu, any later global shortcut
  or share action) runs the same creation; there is no separate quick-note type.
- A small interface can still carry power through search, context menus and shortcuts. The
  subtraction pass of 2026-09-05 (`CHANGELOG.md`, Removed) is the standard for what stays.
- **The feature filter is three questions.** Does it make everyday writing easier (the Apple
  Notes half)? Does it give more ownership of the files (the Obsidian half)? Does it make
  editing more fluid (the Notion half)? A feature that answers none of them does not belong,
  however plausible it sounds.

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
- **Setext headings (`===` and hyphen underlines).** Recommended direction: recognise both
  forms while preserving their authored spelling. Editing behaviour remains unresolved; this
  recommendation does not change the spec's documented current behaviour. `===` underlines
  currently remain paragraph text. A `---` directly under a paragraph is read as a divider. To
  every other reader `hello` / `---` is a heading called "hello"; Boojy Notes shows a paragraph
  and a rule, and its first save writes the blank line that makes the file a divider everywhere
  (a sanctioned byte change, see the spec). Reading it as a heading would be right and needs a
  setext heading form the serializer can write back byte-exact. On record as one `it.fails` in
  `tests/utils/markdownInterop.test.js`. The same underline problem has a second form since
  2026-09-06: an empty bullet left tight under a paragraph (`hello` / `- `, now read as an empty
  item rather than folded into the paragraph) is a setext underline outside too, and no blank
  is written for it, so the file keeps meaning a heading there. One decision, two `it.fails`.

## Beta: release requirements

Beta starts when the local desktop app feels complete enough for ordinary daily use that
missing core features no longer limit it. Worked one item at a time, each judged live. This
list is the product scope the release waits for; the CI gates and any serious data-loss bug
found on the way gate it as well, without needing a line here.

- [ ] **Copy pass on Quote and Checklist.** The rest of the subtraction pass landed on
  2026-09-05 (`CHANGELOG.md`, Removed).
- [ ] **Preservation blockers** — the two first-edit mutations marked under Data safety below.
- [ ] **Visual polish and a Windows smoke test.** Before Windows testers: a
  `requestSingleInstanceLock` in `main.js` (a second launch opens a second instance today, which
  matters more on Windows than on macOS).
- [ ] **Publish the tested build.** Testers and the website only ever see the last *published*
  release (v0.5.0), never the daily-driver build, so a Beta that lives only in `/Applications`
  is not released. `CHANGELOG.md` holds the notes (Unreleased plus the two unpublished 0.6.x
  sections); the release runs the docs pass in `AGENTS.md` and the draft-release steps in the
  CI rule. Two decisions wait on it, deliberately deferred until a build is worth publishing:
  **sign macOS releases** (five secrets, then re-measure the release job's cap; until then every
  published macOS build is unsigned and Settings → Updates cannot update it, so the alternative
  is to say so in the release notes), and the **release path** (pre-create the release before
  the matrix and auto-publish when both jobs pass, retiring the manual draft merge; and whether
  a tag may be cut from a commit that never passed CI).

## Beta: candidates

Optional. Each is considered on its own, judged by daily-drive friction, and may be declined;
none blocks the release. The shared question comes first because three candidates wait on it.

- **Where app metadata lives.** Favourites, folder appearance and any later archive state need
  something the Markdown cannot hold. The spec permits app metadata outside the note (the note
  index already lives in userData). Options: userData (per machine, lost with the vault) or a
  dotfile in the vault such as `.boojy/` (travels with a provider-synced folder, visible to
  other tools). Still to weigh: how an entry follows a folder or note through the app's own
  moves and through external renames, and whether losing it on an external rename is
  tolerable. Two fixed requirements: losing it must never damage a note, and existing
  `.boojy-meta.json` files stay untouched and unread. Decide once.
- **Table row and column handles on hover.** The strips left of the rows and above the
  columns are invisible (click selects, hold to drag); Obsidian and Notion show a small handle
  when a row or column is hovered. Judged after the 2026-09-10 table pass (whole-table
  selection, arrows, content-sized width, revealed add bars): if discovering row or column
  selection is a struggle in daily use, add the handles; if not, low chrome wins.
- **Whole-block selection for code, callout and file blocks.** The table joined the divider
  and image as a block addressed as a whole on 2026-09-10 (Escape selects, Backspace from
  below and forward Delete from above select rather than step over). The other three still
  step over, so Backspace under a code block deletes the paragraph into the one above it.
  Extend the same rule once the table has been judged live; one block type at a time was the
  decision.
- **Note information** at the bottom of the note's ··· menu: "428 words · Edited today at
  11:37", exact timestamp on demand, counting written content rather than Markdown punctuation.
  Edited follows the sort's recency rule (rename and move count; opening never does); imports,
  external changes and appearance changes need the same rule stated once.
- **Favourites.** A Favourite action; a Favourites list that appears with the first favourite
  and disappears when empty; the note stays in its folder and the list is a second route to it.
  One concept, not Favourite and Pin. Open: ordering, placement (a sibling list above the vault
  header keeps the one-tree rule), whether folders qualify. Needs the metadata decision.
- **Folder colours and icons.** Colour the folder glyph, keep the label and row neutral; Light
  and Dark variants; selection never colour-only; a reset to the default folder. The reference
  used outline icons, not emoji, roughly 25–30 icons and 7–8 colours; the catalogue is
  undecided (a smaller first set drawn from Lucide is one option). Never renames a
  directory or adds emoji to its name. Needs the metadata decision. Not approved: per-note
  icons (small optional icons beside titles if ever revisited, never page covers), and
  arbitrary text or background colour inside notes (no portable Markdown syntax; word-level
  colour stored outside the file breaks when another editor changes the text; `==highlight==`
  is already an extension).
- **Editable Markdown source view** from the ··· menu and a shortcut; no permanent toggle. Two
  views of one note, one visible at a time. Switching alone never changes bytes; both views
  edit the same document with no lost pending change; undo and the caret behave coherently
  across a switch; unsupported syntax is visible and preserved; source mode is identifiable
  with an obvious way back. It is the one UI the preservation promise has, the tool for
  checking what an import did, and useful for unfamiliar syntax. A first version may commit
  source edits as one history entry on the way back.
- **Nested-bullet visual hierarchy.** Consider distinguishing bullet markers by nesting depth
  without changing the authored Markdown. Whether it helps, and which appearance to use, need
  live judgement; retaining today's markers is an option.
- **Searchable `/link`.** Consider an entry point to the existing inline-link controls, not a
  new block type. Discoverability and interaction need live judgement; adding it may be declined.
- **Notion import.** The first migration priority; whether it ships in Beta is undecided.
  Notion exports Markdown and CSV in a ZIP. Proposed flow: pick the ZIP, preview the
  conversion, choose a destination, review a report that counts notes and attachments and
  lists what was skipped or simplified. Must handle page hierarchy, duplicate titles,
  attachments and internal links; databases need an explicit policy (simple tables, or folders
  of notes with an index, keeping the CSV). Sources stay untouched; duplicate detection on
  repeated imports is worth considering. No live databases, relations or Notion layouts, ever.
  Next step, which sets the scope: gather representative exports and study what they contain;
  proving the conversion as a script over fixtures before any UI is one way to do that.
  Distinct from the File menu
  Import removed on 2026-09-05: a one-time journey with a report, not a converter.
- **Visible Undo and Redo controls.** Keyboard-only on desktop; the touch toolbar already
  carries them at its fixed left edge (see Technical debt for the rule that says otherwise).
  Desktop and touch are judged separately, and the answer may be no. For reference: Apple shows a button on iPhone and iPad, Notion keeps them in its
  mobile ··· menu, Obsidian is keyboard-only.
- **Move to…** for a single note: a destination without dragging (drag and the bulk menu cover
  it today).
- **Back and Forward** through recently open notes, remembering caret and scroll position.
  Controls unchosen; Cmd+[ and Cmd+] is the convention.
- **Context menu on plain text** and **rich paste** are listed under Known issues; promoting
  either is a candidate call, not a fix.
- **A Recent list** in the empty search palette, if the last-touched note proves hard to get
  back to. **A muted "N other files" hint** on folders holding files the app cannot open
  (Reveal in Finder answers it for now).
- **More New Note entry points** (a global shortcut; a share action on mobile later) run the
  same workflow. Initial focus, location and the moment an empty note becomes a file are
  undecided for every entry point. Not accepted: deriving the title from the first line.

## Known issues

### From the September 2026 review

Still reproduce on master, in the review's order. None blocks Beta on its own.

- [ ] **New note writes `Untitled.md` at once** — `createNote` makes a real note, so the sidebar's
  New note and Cmd+N reach disk within a second even if nothing is typed; only the empty-state
  draft waits for content (`useNoteCrud.js`). Cmd+N reuses an active draft where the button
  creates a real note: the one inconsistency in the New Note workflow, to be resolved with the
  focus and empty-file questions above. Prior art: at v0.2.0 an empty note reached disk only
  when something was typed.
- [ ] **A folder's inline rename does not select the name** — New folder and a double-click
  rename on a folder both open the input with the caret at the end, so typing appends
  (`Sidebar.jsx`); note rows select the name Finder-style, and the UI rule records that as the
  intent for both.
- [ ] **No context menu on plain text** — the editor's right-click handles links only and Electron
  supplies no default menu, so cut, copy and paste have no menu on desktop (`EditorArea.jsx`).
- [ ] **A multi-line rich paste is flattened** — a single line pasted from a browser or another
  app keeps its bold, italics and links (2026-09-09), but a paste of several lines reads
  `text/plain` only, so their formatting is dropped (`usePasteHandler.js`).
- [ ] **Sidebar drag needs a 400ms hold** before a note lifts (`useSidebarDrag.js`); no hint until
  the third attempt.
- [ ] **A cleared title shows a blank sidebar row** until the next write adopts `Untitled`.
- [ ] **Undo snapshots the open note whatever the commit touched** (`useHistory.js`
  `pushHistory`): a sidebar rename of another note pushes a no-op entry, so Cmd+Z "does
  nothing" once; deleting the open note and undoing within the flush debounce restores it in
  memory while the flush trashes the file. Decision to make: undo scope is the open note's text
  and structure only, skipping commits that do not change it and excluding delete (about ten
  lines), or per-note entries.
- [ ] **View → Reload ships in production** (`main.js` keeps the `reload` role) and discards
  up to ~800 ms of keystrokes, the text-commit and write debounces.
- [ ] **`#` inside a word or a URL fragment indexes as a tag** — `TAG_RE` in `utils/tags.js`
  has no left boundary, so `a#b` and `example.com/page#top` produce tags `b` and `top`.
- [ ] **Find counts a code block's matches twice** (the textarea and its highlight overlay,
  `FindBar.jsx`), and Replace leaves a match inside a table cell, a callout or a code block
  alone, since those blocks own their fields; replacing inside them is a decision to make once
  it has been felt.
- [ ] **Edits across a block boundary that the app refuses rather than makes** (the block-root
  rule in the UI rule, 2026-09-07): a selection reaching from a text block into a table, callout
  or code block, then Backspace or typing, changes nothing (deleting the run is not attempted);
  a text drag across blocks copies rather than moves; Cmd+B across blocks toggles each block on
  its own; an IME composition begun over a selection spanning blocks cannot be intercepted
  (`insertCompositionText` is not cancelable). None loses data; each is a decision to make
  once it has been felt.
- **Judge live, not by reasoning:** Shift+Enter twice (`a\n\n` inside one block) reads back as
  `a` plus two empty rows: bytes identical, structure differs. Decide whether that matters only
  after it has been felt.

- **Cmd+B at a bare caret** (press, type, press, as Apple Notes and Notion do). Probed in the
  real app 2026-09-10: bold and italic work through Chromium's own typing style, but a space
  typed first lands inside the element and as U+00A0, so `Cmd+B`, ` bold`, `Cmd+B` reaches the
  file as `** bold**`, which no reader takes for bold; strikethrough, highlight and code do
  nothing (their toggles return early on a collapsed selection, `useInlineFormatting`). Making
  it real means owning the typing style for all five and keeping the space outside.
- **Nested typed formatting** (`*x*` typed inside existing bold) is left literal until the next
  repaint, by the trigger's own guard; the renderer decides it then. Judge live.

### Markdown compatibility

Priority for assessment, not additional Beta release requirements. New findings here come from
the 2026-09-10 code inspection and sample probes, not a full desktop interaction test. Verify
the relevant read, edit and save journeys before choosing a fix; missing support is distinct
from a correctness defect. Existing preservation blockers retain their status under Data safety.

- **Missing support: H4–H6.** Currently read as paragraph text. Consider recognition and
  editing while retaining authored source; menu exposure remains undecided. Setext headings
  have their own existing item under Open decisions.
- **Links: parsing defects and missing navigation.** Optional link titles are treated as part
  of the URL and parentheses can truncate a destination. Reference-style links are unresolved;
  relative `.md` links use the external-link path rather than navigating within the vault.
  Assess correct parsing, source preservation and destination handling together. Heading
  targets are a separate future item below.
- **Code: literal handling and delimiter support.** Formatting inside a code span can render
  as active emphasis; multi-backtick spans need correct delimiter handling. Indented code is
  not recognised as code. Keep contents literal through reading, editing and writing. Tilde
  fences and closing-fence preservation already have items under Data safety; do not duplicate
  or downgrade them here.
- **Missing rendering: imported underscore emphasis.** `_italic_` and `__bold__` are CommonMark,
  and typing them converts (saved in the star form, 2026-09-10), but the renderer and writer
  speak only `*`. Rendering imported underscores must not cause the first edit to rewrite
  their marker style; source-preserving editing needs to accompany rendering support.
- **Missing syntax variants: alternate dividers.** `***` and `___` are not recognised as
  dividers. Assess common forms without normalising their authored spelling on save.

### Data safety / reliability

**First-edit mutations.** Fine on open; the first edit of an affected note rewrites third-party
content. `KNOWN_FAILURES` in `tests/utils/preservation.test.js` holds the fixtures that already
fail; tilde fences are not in it because their fixture round-trips byte-exact (the damage is
on interaction). These two block Beta.

- [ ] **Tilde fences (`~~~`) parse as paragraphs** — the fence lines round-trip byte-exact, but
  the content renders as live blocks, so interacting with it rewrites code, and content that
  matches a normalising construct (tables, `- [X]`, `[!NOTE]`, bare `>`) is rewritten on any
  save. The fence matcher in `markdown.js` is backtick-only.
- [ ] **Table `:---` separators normalise to `---`** on first edit.
- [ ] **A typed trailing space can reach the file as U+00A0** — Chromium holds a space at the
  end of a text node as `&nbsp;` so it renders, and turns it back into a space at the next
  keystroke; a save that lands in a pause after the space writes the non-breaking byte
  (`hello world\u00A0`, probed in the real app 2026-09-09; the next character rewrites it as a
  space). A trailing U+00A0 the file itself holds is indistinguishable from it at read-back,
  which is why no normalisation was added with the inline-preservation fix; `pre-wrap` was
  rejected earlier for changing how every run of spaces renders.

**Undocumented normalisations** (decision pending: carry the raw bytes with the
`indentStr`/`marker`/`numRaw`/`bare` pattern, or sanction each in the spec). None is in the
spec's sanctioned list; each needs a preservation fixture either way. Re-probed on master on
2026-09-07, every one still occurs on any save of the note:

- [ ] Uppercase `- [X]` is written as `- [x]`.
- [ ] Headings, dividers and table rows with 1–3 leading spaces are dedented; an indented table
  body row (`  | 1 | 2 |`) also gains an empty leading cell.
- [ ] A closing fence longer than its opener (four backticks closing a three-backtick fence) is
  not recognised, so the rest of the file becomes code and the opener is rewritten.
- [ ] Mixed line endings are healed to the dominant style (a code comment records this as
  intended; the spec does not).
- [ ] An unclosed fence or unclosed frontmatter gains a closer.
- [ ] Trailing space after a fence's info string (```` ```js ````) is trimmed.
- [ ] `[[Note|Note]]` collapses to `[[Note]]` on the first edit of its block (the DOM walker,
  not the parser).

**Lost edits and filesystem.**

- [ ] **Concurrent flushes are not serialised** — blur, quit and the write-debounce timer can
  each run `flush` at once (`useFileSystem.js`, `useQuitFlush.js`); a flush cancels the pending
  timer, so the residue is a redundant write when two overlap and a theoretical mid-write kill
  if the quit handshake completes while a blur write is in flight (the atomic rename keeps the
  last complete file).
- [ ] **Rename crash window** — a crash between unlink and index save re-IDs the note; a crash
  before unlink leaves a visible duplicate that needs manual cleanup.
- [ ] **A crashed renderer burns the quit handshake's 2 s cap** — the flush listener now removes
  itself and a destroyed window is checked, so nothing accumulates on rapid Cmd+W then Cmd+Q;
  what is left is that a renderer that has already died still holds the quit for the cap.
- [ ] **Orphaned `.*.tmp` files** after a crash followed by a rename.
- [ ] **Wikilink rename does not update referrers** — silent link breakage.
- [ ] **Search index goes stale on text-only edits**, and results cap at 20.
- [ ] **Unparseable files vanish from the sidebar** silently.
- [ ] **A symlinked `.md` is replaced by a regular file on write** — the atomic rename lands a
  new inode over the link, so the target file is left stale and the link is gone.
- [ ] **The last-writer race under a synced folder** — `write-note` never compares the file's
  mtime, so the app's own debounced write can land over an outside write the watcher has not yet
  reported. Not reproduced; instrument with `BOOJY_TRACE` under iCloud or Drive before designing
  anything (the conflict-copy rule in the UI rule covers only changes the watcher reports first).
- [ ] **Pre-0.5 residue that reads or rewrites user files**: a legacy `id:` frontmatter key makes
  the first write strip the whole frontmatter block; `resolve-attachment` still scans the v0.1
  `.attachments/<noteId>/` layout; the `.trash` migration runs at every launch. Retire the three
  migrations (about 210 lines) once every tester has installed a post-0.5 build, not before.

**A trailing space typed at the end of a line is saved as U+00A0** while the caret rests after
it (found 2026-09-07 while fixing Enter on a tag suggestion). Chromium writes a space typed at
the end of a line as a non-breaking space so it renders, and turns it back into a plain space
once a character follows; a save that lands in between reads the DOM verbatim and writes
`Notes\u00A0`. The walkers keep U+00A0 on purpose (a file's own non-breaking spaces must
survive an edit), so the fix is narrower than a global normalisation: probably a block-final
U+00A0 read as a space at commit time, weighed against a file that genuinely ends a block with
one. Nothing is lost on screen; the byte is wrong only until the next keystroke in that block.

### Accessibility

E2E axe only catches critical violations on the initial screen. Known gaps below that:

- [ ] **Sidebar focus ring is invisible** — inline `outline:none` overrides the global ring, and
  the global ring is 25% opacity (`Sidebar.jsx`, `GlobalStyles.jsx`).
- [ ] **Context menus are `<div onClick>`** (Link/Image/Slash/CalloutPicker): not
  keyboard-reachable, no roles or focus traps. SlashMenu's `aria-selected` on `menuitem` is
  invalid. The table's cell menu left this list on 2026-09-10 (rebuilt on the note menu's
  grammar); the note, vault and table menus now carry three copies of that grammar, and one
  shared menu primitive is the cleanup that would also fix the four above.
- [ ] **NIGHT `TEXT.muted` fails AA contrast** (`themes.js`); DAY was fixed, NIGHT was left for
  a later pass.
- [ ] **Sidebar tree has no arrow-key navigation** and lacks `aria-level`/`setsize`/`posinset`
  (`Sidebar.jsx`).
- [ ] **Tab never leaves the editor** — `useKeyboardHandlers.js` prevents the default for every
  block type and indents only lists, so Tab in a paragraph is swallowed and Shift+Tab cannot
  reach the chrome. Notion does the same; a keyboard trap to resolve in the accessibility pass,
  not in isolation.
- **Do the menu unification inside this pass, not before it.** Menu keyboard grammar is
  implemented six times (`ContextMenu`, `VaultMenu`, `WikilinkMenu`, `TagMenu`, `CalloutBlock`,
  `SearchPalette`, plus the sidebar's own), outside-click dismissal fourteen times, positioning
  three ways (`CodeBlock` keeps a hand-rolled clamp). One `useMenuKeyboard`/`useDismiss` pair
  is worth it only because the accessibility pass touches every one of them anyway.

### Technical debt

- **`useIsMobile` → `useIsTouch`** — the hook answers "is this a touch device", not "is the
  window narrow"; `useSidebarFits.ts` already owns the fit question.
- **`tests/electron/markdown.test.js` is misfiled** — it tests `src/utils/markdown.js`; move it
  beside `tests/utils/markdown.test.js` and drop its round-trip block, which duplicates
  `LOSSLESS_CASES` there (no overlapping test names otherwise).
- **`ExportTab.jsx` renders Storage** — export was removed; rename to `StorageTab`.
- **Untested seams worth a case each**: `remapNoteFolders` (undo across a folder rename), the
  `boojy-att://` traversal guard, and a pending title at quit. No layer covers them today.
- **Confirmed deletion never runs in CI** — both Trash journeys and the case-only rename skip
  off macOS (`deletion.spec.ts`, `folders.spec.ts`) and CI is Ubuntu only. A macOS job for
  `pnpm test:electron` (~5 min) is the fix; deferred, since the daily-driver build exercises
  them by hand.
- **CI hygiene not yet done**: no `concurrency` group (two pushes to one branch run twice), no
  `permissions` block, and nothing is uploaded on failure, so a red E2E job has no trace or
  report to read; the two Playwright configs also share one `playwright-report/`.
- **Secret scanning and push protection are off** on this public repo (repository settings,
  free). Turn both on.
- **Block IDs are minted on every re-parse** — `markdownToBlocks` uses a module-global counter,
  so a re-sync remounts every block and loses the caret. Fix is content-stable IDs; non-trivial.
- **The touch layout's grammar is recorded nowhere in the rules** (two screens, fixed-edge
  toolbar with Undo and Redo, long-press FAB, bottom-sheet menu); the archived, local
  `docs/private/archive/mobile-spec.md` header lists it. Write it into
  `.claude/rules/ui-chrome-and-theme.md` the next time a change touches the touch layout. The
  touch ··· menu (`mobile/EditorMoreMenu.jsx`) also carries its own delete-confirm copy beside
  `utils/deletionPrompt.ts`, and `BoojyNotes.jsx` calls the raw `deleteNote` for it to avoid a
  double prompt; fold it into the shared wording.
- **`[perf]` warnings ship in production** — `console.warn('[perf] …')` timing lines remain in
  `EditorArea.jsx`, `useAppPersistence.js` and `useHistory.js`; gate them or remove them.
- **Updater behaviour is undecided** — today `autoDownload` is on and every launch checks,
  with a failed check swallowed (`autoUpdater.checkForUpdates().catch(() => {})` in
  `electron/settingsManager.js`). The alternative is check-and-ask with a visible error. Moot
  for release users until macOS builds are signed (release requirements); the other empty
  catches are localStorage guards and are fine.
- **Editor hook copies, for a quiet window with the Electron suite green**: the "text before and
  after the caret" split helper exists six times and the block-update boilerplate about
  eighteen times across the editor hooks (~150 lines on hot paths). Mechanical, but not during
  Beta bug-fixing.
- **Two dependencies to try removing locally first**: `vite-plugin-electron-renderer`, whose job
  is Node shimming in a `nodeIntegration` renderer this app does not have, and the `accentColor`
  prop threaded through 18 files when it is always `theme.ACCENT.primary` (worth it only if a
  second accent ever appears).
- **Small residue, tidy when touching the file**: `z-index: 999`/`9999` literals in
  `GlobalStyles.jsx` beside the `Z` scale; the `index.html` viewport meta is PWA residue; the
  crash screen's `boojy-error-backup` is written but nothing reads it back; a bad `%` in a
  `boojy-att://` URL throws in `decodeURIComponent`; the UI rule's known colour leaks (plain
  black alphas, per-theme callout and syntax colours) and Dark's first-paint flash.

## Future, after Beta

Recorded so a preference survives; nothing here is scheduled, and nothing here is an
instruction to start. Each line carries the direction taken and what is still open. The dated
research behind these (checked 2026-09-06, with links and cost tables) is the archived
discussion record in `docs/private/archive/` (gitignored; on Tyr's machine only).

### Migration and portability

- **Obsidian: open the files.** Conventional Markdown, lists, tables and alignment, relative
  attachment paths, wikilinks and aliases, heading links, callouts, frontmatter, and
  preservation of everything else. Compatibility with a document never requires the feature
  that produced it; plugin syntax stays preserved source, never executable. Graph, Canvas and
  plugin configuration are outside the promise.
- **Apple Notes.** The Mac exports Markdown per note (File → Export as → Markdown); dropped
  into the vault, that works today, and bulk export is the gap. A later Mac importer could
  follow the route Obsidian's Importer proves (images, scans, PDFs, note links; locked notes
  unlocked first): evidence of feasibility, not a decision to reuse it. Good formatted paste
  helps with a few notes. Attachments, dates and formatting need tested policies.
- **Export.** Desktop already exposes the files. A web or mobile build must offer a folder or
  ZIP of Markdown and attachments with working relative links. Importing converts; editing an
  existing Markdown folder preserves.
- **Copy as Markdown and as formatted text.** Useful clipboard representations for moving
  content between apps. Define selection, whole-note and attachment behaviour. Whole-note
  Markdown is the file itself; how rich text is produced is open.

### Editor and organisation

- **Heading navigation or folding**, without another permanent panel. No choice yet between a
  heading picker (an `@` mode in the search palette would add no panel) and folding. Consider
  links to sections within and between notes, including heading targets in wikilinks. Explicit
  heading IDs are a separate syntax decision; target naming and behaviour when headings change
  remain open.
- **Table alignment controls.** Consider restoring a way to set left, centre and right column
  alignment. Existing file alignments already render; the current absence of controls remains
  intentional. Placement and interactions are unchosen. Preserving separator spelling is the
  separate Data safety item, not dependent on adding controls.
- **Footnotes.** Consider rendering, editing and navigation between references and definitions.
  Supported syntax and interactions remain open; no citation-management system is implied.
- **Richer nested quotes and list contents.** Consider nested quote depth and Markdown elements
  inside quotes or list items. Basic list indentation is separate. Source preservation and
  editing across those structures need a design before broader support is selected.
- **Limited subscript/superscript, if useful.** Assess demand before choosing syntax or controls.
  A narrow HTML subset is one possibility to weigh against Markdown extensions; no broad HTML
  rendering is authorised by this idea.
- **Archive.** "Keep it, remove it from everyday browsing", with no expiry. A real Archive
  directory is preferred (visible to Finder and other editors, ordinary files) over status
  stored separately (stable paths, simple unarchive, invisible to other apps). Costs of the
  preferred route: moves affect links and attachments, and restoring to the original place
  needs remembered information. Open: search scope, hierarchy inside the archive, unarchive
  destination, links into archived notes. Opening an archived note never restores it. Normal,
  archived and deleted stay three distinct states; no archive or Trash surface is authorised
  by the preference alone.
- **Version history**, which is not undo. Undo reverses recent actions with sensible
  boundaries for typing, pasting, formatting and moving blocks, and its scope across notes and
  sidebar operations must be explicit so it never silently alters an unseen note. History
  recovers older saved states: preview, restore safely, restore as a copy, and a restore
  preserves the current version. Local snapshots could come before cloud history; the
  mechanism is undesigned and is to be designed carefully when the work is active. For
  reference, Obsidian keeps local snapshots five minutes apart for seven days, both
  configurable; Notion gives 7/30/90 days by tier; Apple offers 30-day deleted-note recovery
  and no general version browser was found. Open: retention, attachment recovery, storage
  budget, a readable comparison. Neither sync nor history replaces an independent backup.
- **Conflict handling.** Competing edits must be understandable and recoverable; keeping both
  versions is the fallback; automatic merging needs carefully defined limits. One person on two
  offline devices is enough to cause it.
- **Open a single Markdown file** through Open With, without importing it or choosing a vault.
  Open: how to return to the usual collection, and how links and search behave with one
  document. One option to evaluate is opening the file's folder as a temporary vault, which
  widens the experience from one file to a folder and may not be wanted.
- Deferred, neither approved nor ruled out: custom CSS, a plugin system, elaborate page covers.

### Platforms, sync and accounts

- **Sync: provider-synced folders first.** Evaluate Google Drive for desktop and iCloud Drive
  holding the vault locally, with the provider transferring files while the app edits them,
  before any Connect button or account. Offline placeholders, external changes, conflicts,
  renames and deletion need verification per provider; mobile access varies. One sync mechanism
  per collection, never overlapping. A direct Drive integration (authorisation, transfer,
  change tracking, recovery) is a larger later feature that free Boojy Cloud may make
  unnecessary; Drive authorisation is distinct from Google sign-in. CloudKit is an architecture
  to assess for Apple devices, not general access to iCloud Drive folders.
- **Web storage** needs its own design discussion. User-selected local folder (real files where
  the browser supports it; support and permission persistence vary, not a foundation for
  mobile, Safari or Firefox), browser-managed storage (offline without a folder; not visible,
  quota-bound, lost with site data), or cloud with offline storage (consistent across devices;
  needs accounts, sync, conflict recovery and a service). Cloud with offline capability was
  recommended; local-file behaviour is explicitly deferred. The spec keeps web outside the
  product promise until then. The ~200 lines of localStorage/IndexedDB note persistence stay
  meanwhile: they are what lets `pnpm dev:web` survive a reload during visual iteration.
- **Mobile shell** unchosen. One relationship to keep in view: the editor is `contentEditable`
  on the browser's Selection and Range APIs, so a shell that keeps the browser DOM (Capacitor
  and the like) can reuse it, and a shell that does not (full React Native, Flutter) means
  rebuilding the editor. Which of those to accept is part of the unchosen decision. Keyboard,
  selection, attachments, filesystem access and background sync need real-device evaluation. Drawer versus two-screen navigation was explored on 2026-04-06 and left
  undecided; the two-screen touch layout in `src/components/mobile` stands. The earlier
  Capacitor spec, mobile spec, navigation exploration and release strategy are archived in
  `docs/private/archive/` as reference, not plan. The touch layout itself (about 1,700 lines,
  untested, plus 55 `isMobile` branches in the desktop files) has three options: keep it, flag
  it off (`useIsMobile` returns `false`: one line, reversible, the cheap experiment), or delete
  it (git keeps it). Undecided; resolve it with the shell decision, not with pre-optimisation of
  the mobile-only work desktop pays for (`useNoteStats`, `useKeyboard`, undo-state churn).
- **Accounts: email-only** when accounts are needed (codes or links; session length open).
  Local desktop use never requires one.
- **Encryption undecided.** End-to-end (privacy; against it, recovery, new-device setup,
  browser access and implementation cost, and an email recovery flow cannot recover a lost key)
  against service-managed (simpler; more provider access and trust). No privacy or recovery
  promise before the approach is chosen and verified.
- **Free hosting.** When a quota is reached: local writing continues, nothing is deleted, the
  app distinguishes saved locally from synced. Still needed: account management, abuse
  controls, history accounting, a sustainable hosting budget. The September 2026 research
  (archived) found object storage cheap enough that a small free tier is plausible on stated
  assumptions; measure a prototype before setting any limit.
- **Deletion in the cloud.** A recoverable deleted state that needs no desktop Trash, plus a
  record of deletions so offline devices cannot resurrect notes.

## Not doing

No AI features or agents; no collaboration; no calendar; no Inbox; no daily-note feature; no
templates; no tabs or split view; no separate quick-note workflow. The spec
additionally excludes layouts and blocks that cannot round-trip to readable Markdown.
