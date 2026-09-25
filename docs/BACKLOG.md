# Boojy Notes — Backlog

Direction, what is left to do and what is known to be broken, checked against master on
2026-09-17. Shipped work goes in `CHANGELOG.md`, never here. The philosophy: finish Beta,
daily-drive Boojy Notes, and let observed friction decide what deserves to exist next. Nothing
is added because it sounds plausible.

Three tiers, kept apart. **Release requirements** are what Beta waits for. **Beta candidates**
are optional; each is judged on its own and may be declined. **Future** is everything after
Beta, recorded so a preference and its open question are not lost. Last reviewed: 2026-09-24, the
v0.9.1 release pass (Known issues checked live the same day), then the planning pass for the
phase before cloud the same day (the Direction, Beta and Not doing sections). The 2026-09-12
pass for the v0.7.0 release closed out the whole-app review of 2026-09-07 (its fixes are in
`CHANGELOG.md` v0.7.0, PRs #144–#158; the residue is here, marked *review §n* where it came
from that file's B and C lists).

## Direction

Boojy Notes sits between Apple Notes, Obsidian and Notion: approachable writing, ordinary
Markdown files, lightweight organisation and easy movement between apps. All three audiences
inform the defaults; Notion's editing convenience is the reference and its clutter the thing to
avoid. Bring existing notes in, create and edit without ceremony, find them again, keep the
files. Migration quality, editing comfort and access across devices are expected to matter
more than any feature nobody else has. That is a product hypothesis, not validated demand.

- **Beta is desktop-first, and for Tyr and a few friends**: local files, no account, no sync.
  There is no rush to a public launch; the aim is the best product for daily use. Personal
  tools only; collaboration is excluded.
- **Before any cloud work, every area reaches a solid 8/10.** The scorecard of 2026-09-24 (Tyr
  and Claude agreed): editing 7.5, files and safety 6.5, tables 5.5, search 6.5, organisation 7,
  keyboard 5, feel and motion 6, accessibility 5, repo and tests 7.5, public face 5. The Beta
  sections below are that phase, and repo and tests reach 8 through the Technical debt list (the
  lint warnings, the dependency majors, CI hygiene, secret scanning). It ends when a re-score
  puts every row at 8. **Then, in order:** cloud sync between desktop and web, with the web
  build working well on a phone; a mobile app; a public launch.
- **Boojy Notes and every editing feature are free.** Local use never needs an account. The
  suite position on hosted storage lives in the suite root's `VISION.md` §7; nothing in this
  backlog assumes any particular Cloud outcome.
- **Obsidian compatibility and Notion-first import are complementary.** Existing Markdown
  folders, Obsidian vaults included, open as they are (the spec's support dimensions). Notion is
  the first migration priority for a whole collection and a Word document for a single file;
  Apple Notes follows.
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

- **A spare empty row is two blank lines in the file.** One blank line between blocks is
  structure (the gap every Markdown reader needs), so Enter twice after a paragraph shows one
  empty row and writes two blank lines, as Obsidian needs it. Tyr is unsure it feels right
  (2026-09-24). The alternative, one blank line per spare row, would make a single blank mean
  either a gap or a row depending on context. Also open: whether the row's height (a line plus
  the paragraph gap) reads as a bigger hole than the Enter that made it.
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
- **Links when a note is renamed, reopened.** Decided on 2026-09-20 not to rewrite other notes
  (Data safety, below); reopened 2026-09-24 because Tyr's Obsidian vault has
  `alwaysUpdateLinks` on, so a rename here breaks the habit that vault was built with. The
  candidate is to ask on rename ("Update links in N notes?"), which needs a carve-out in the
  spec's preservation promise and a backlink index.

## Beta: release requirements

Beta starts when the local desktop app feels complete enough for ordinary daily use that
missing core features no longer limit it. Worked one item at a time, each judged live. This
list is the product scope the release waits for; the CI gates and any serious data-loss bug
found on the way gate it as well, without needing a line here.

- [ ] **Daily use feels reliable.** "A bit buggy" is the first reason Tyr still opens Obsidian
  (2026-09-24), ahead of any missing feature. The input is a friction log in the vault, one line
  for anything that felt off however vague; each entry is reproduced in the real app
  (`BOOJY_TRACE`, the files rule) before it is fixed, and a review pass follows only if the log
  shows a pattern.
- [ ] **Visual polish and a Windows smoke test.** Before Windows testers: a
  `requestSingleInstanceLock` in `main.js` (a second launch opens a second instance today, which
  matters more on Windows than on macOS). Traced only, no Windows machine (review §6, §2.10):
  reserved device names (`CON`, `NUL`, …) as a note or folder name, and the raw extension kept
  by `save-image` and `save-attachment`; both belong to this smoke test. Windows spell-check
  dictionaries download from Google's CDN on first launch (no
  `setSpellCheckerDictionaryDownloadURL`); a line in a privacy statement or a self-hosted URL.
- [ ] **Fix the release path.** v0.7.0 (2026-09-11) published the daily-driver line as early
  access, the first tag since v0.5.0, and the first signed and notarised macOS build (the signing and
  notarisation secrets are set; the two traps the first run hit are in the CI rule and
  `docs/private/code-signing.md`). Testers and boojy.org only ever see the last *published*
  release, so Beta too is a tag and a published release, never a build that lives only in
  `/Applications`; every release runs the docs pass in `AGENTS.md` and the draft-release steps
  in the CI rule. Left open: pre-create the release before the matrix and auto-publish when
  both jobs pass, retiring the manual draft merge (electron-builder already uploads into an
  existing draft of the version's name, so pre-creating one is most of the fix); and whether a
  tag may be cut from a commit that never passed CI.

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
- **Spell check in Settings: on/off and British or US English.** Wanted (Tyr, 2026-09-23). The
  main process already reads `spellCheckEnabled` and `spellCheckLanguages` from `settings.json`
  at window creation, but nothing writes them, so today it is always on. Two platform facts,
  probed in Electron 42 the same day: **on macOS the language cannot be chosen by the app**
  (`setSpellCheckerLanguages(["en-GB"])` is ignored and the checker stays on the system's
  language, `es` on Tyr's Mac; it follows System Settings → Keyboard → Text Input), and the
  current "off" path (an empty language list) is therefore also a no-op there;
  `session.setSpellCheckerEnabled(false)` is the switch that works everywhere, live, without a
  restart. So: the switch on every platform; the UK/US choice on Windows only, with macOS
  saying where its language comes from rather than showing a control that does nothing. Also
  still open from the Windows smoke test: dictionaries download from Google's CDN.
- **Tables that work better.** Wanted (Tyr, 2026-09-24): 101 of the 213 notes in his vault hold
  one. Grips, alignment, Duplicate and Clear contents shipped (`CHANGELOG.md`). Left, in the
  order daily use asks for them: a paste from a spreadsheet (tab-separated text) into a
  paragraph becoming a table, a keyboard path for moving a row or column, and dragging several
  rows at once. No colour, by decision: Markdown cannot hold it.
- **Whole-block selection for code, callout and file blocks.** The table joined the divider
  and image as a block addressed as a whole on 2026-09-10 (Escape selects, Backspace from
  below and forward Delete from above select rather than step over). **The arrows caught up on
  2026-09-19**: they walk into any block that keeps a field of its own, code and callout
  included. Deletion did not, deliberately — Backspace merges text, so it may only land where
  text can go, and Backspace under a code block still deletes the paragraph into the one above
  it. That is the half left to judge; a file block, which has no field, is stepped over by both.
- **Note information** at the bottom of the note's ··· menu. The word count half shipped on
  2026-09-16 (`428 words`, one muted line under the menu's only rule, counting written content
  rather than Markdown punctuation; a character count was shown and dropped, since nobody writes
  a note to a character limit). Still a candidate: "Edited today at 11:37" beside it, exact
  timestamp on demand. Edited follows the sort's recency rule (rename and move count; opening
  never does); imports, external changes and appearance changes need the same rule stated once.
- **Favourites.** Decided in shape (2026-09-12), not scheduled: a note is favourited and
  unfavourited from its own ··· menu; a Favourites section appears with the first favourite and
  disappears when the last is removed; the note keeps its place in its folder, and the section
  is a second route to it, never a move. One concept, not Favourite and Pin. Still open:
  ordering, placement (a sibling list above the Notes row keeps the one-tree rule), whether
  folders qualify. Needs the metadata decision above; nothing here is built until that is made.
- **Folder colours and icons.** Colour the folder glyph, keep the label and row neutral; Light
  and Dark variants; selection never colour-only; a reset to the default folder. The reference
  used outline icons, not emoji, roughly 25–30 icons and 7–8 colours; the catalogue is
  undecided (a smaller first set drawn from Lucide is one option). Never renames a
  directory or adds emoji to its name. Needs the metadata decision. Not approved: per-note
  icons (small optional icons beside titles if ever revisited, never page covers), and
  arbitrary text or background colour inside notes (no portable Markdown syntax; word-level
  colour stored outside the file breaks when another editor changes the text; `==highlight==`
  is already an extension).
- **The Markdown view's residue** (shipped 2026-09-24: ··· menu, View, ⌘/, the lit `</>`).
  No Find in it yet: ⌘F and Edit → Find do nothing while it is on. The keys are a plain text
  field's (no list continuation on Enter, no auto-pairing); add them only if typing there
  proves common. Its edits are typing-grain undo entries; the "one entry on the way back"
  alternative was not needed. Decided 2026-09-24, to revisit after daily use: **no slash menu
  in it** (`/` is typed there constantly, in addresses, paths and dates, and the view is where
  the syntax is written by hand), and **no table alignment as you type** (padding every row
  when one cell grows is the rewrite the table preservation fix removed, and it moves text
  under the caret). Tidy table shipped in the formatted view's cell menu (`CHANGELOG.md`); a
  Tidy for the table under the caret in this view is the candidate if hand-aligning pipes here
  becomes a chore.
- **Local version history**, brought forward from Future (Tyr, 2026-09-24: version control
  matters). Undo reverses recent actions; history recovers older saved states: preview, restore,
  restore as a copy, and a restore keeps the current version. Snapshots in userData, never in
  the vault; Previous versions from the note's ··· menu. For reference, Obsidian keeps local
  snapshots five minutes apart for seven days, both configurable; Notion gives 7/30/90 days by
  tier; Apple offers 30-day deleted-note recovery and no general version browser. Open:
  retention, attachment recovery, storage budget, a readable comparison. Not a git interface:
  a vault kept in git keeps git. Neither sync nor history replaces an independent backup.
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
- **Word import.** Wanted for Beta (Tyr, 2026-09-24): a `.docx` arrives as a note that looks
  right in the app. A converter to semantic HTML (mammoth is the candidate) feeding the rich
  paste reader that already exists (`utils/richPaste.ts`: headings, lists, tasks, tables,
  links, emphasis), with the pictures saved into `attachments/`. The source file is left
  untouched. Entry point unchosen: File → Import…, a drop on the sidebar, or both. PowerPoint is
  not imported.
- **Export and print to PDF.** Wanted (Tyr, 2026-09-24). Electron prints a page to PDF, so the
  work is a clean print layout (no chrome, the note's own type, page breaks that never split a
  table row or a picture). Word export is later (Future).
- **Other files in the tree.** Wanted (Tyr, 2026-09-24), replacing the muted "N other files"
  hint. A folder is a directory, and hiding its PDFs and slides makes it look emptier than it
  is; in Tyr's vault about 240 documents sit beside the notes of the module they belong to.
  Shown dimmer than notes with a file-type glyph; a click opens the default app (Preview,
  Keynote), with Show in Finder, Rename, Move to… and Delete on the row; a drag into a note
  writes a link to it; Search finds them by name. A setting hides them. `attachments/` stays
  hidden. Every file operation must then be right for a non-note file too. Built-in viewers are
  the later step (Future), and "open in the default app" stays one click away when they come.
- **Quick capture and a `boojy-notes://` link.** Wanted (Tyr, 2026-09-24): a global shortcut
  from anywhere on the Mac makes an ordinary new note, the same creation as Cmd+N (no inbox, no
  quick-note type). A `boojy-notes://new?title=…&text=…` scheme is the one door for it, a
  bookmarklet, the Shortcuts app and Raycast, and later a web clipper (Future). Initial focus,
  location and the moment an empty note becomes a file are undecided for every entry point. Not
  accepted: deriving the title from the first line.
- **Search, a few additions.** Quoted phrases, other files by name (above), and a timing check
  on a vault of 2,000 notes. Still no fuzzy matching. A heading picker was declined (Not doing).
- **Find in note, as good as a code editor's.** Cmd+F finds and replaces (it opens as it was
  last left; Edit → Find ▸ since the menu bar); Tyr asked for it without knowing it was there
  (2026-09-24). Add match-case and whole-word toggles, and draw it in the app's grammar (Lucide
  glyphs, not the three hand-drawn SVGs and the `▶`/`▼` text). Its double count and Replace's
  reach are under Known issues.
- **Motion, small and fast.** Wanted (Tyr, 2026-09-24): menus and tooltips fade and grow a
  little from their anchor, dialogs fade in, the checkbox tick draws, a dragged row lifts and a
  drop settles. Enter under 150 ms, exit faster; tokens in `tokens/motion.js`; nothing moves
  under reduced motion; the editor column still never carries a transform (opacity alone
  there). Nothing animates on a key that repeats (filtering, arrowing through a menu).
- **Keyboard-only use.** Create, find, move, rename and delete a note without the mouse; that
  walkthrough is the Accessibility pass's test (below), done with the menu unification. Not a
  vim mode (Not doing).
- **The vault in your own sync and version control, verified.** It works by design, since the
  notes are a folder; the work is proving it and writing the help page. Run a real vault in
  iCloud Drive (files evicted to placeholders), Dropbox and Google Drive (their conflicted
  copies), and git (a checkout's burst of watcher events). Cheap, and useful before Boojy Cloud
  exists.
- **The public face, current.** The README's screenshots and feature list, the GitHub repo's
  description, topics and social preview, and boojy.org/notes (in `boojy-web`) describe the app
  as it is at Beta. Short, friendly help pages come after Beta (the sync-folder page may come
  first); the aim is that nobody needs them.

## Known issues

### From the September 2026 review

Still reproduce on master, in the review's order. None blocks Beta on its own.

- [ ] **New note writes `Untitled.md` at once** — `createNote` makes a real note, so the sidebar's
  New note and Cmd+N reach disk within a second even if nothing is typed; only the empty-state
  draft waits for content (`useNoteCrud.js`). Cmd+N reuses an active draft where the button
  creates a real note: the one inconsistency in the New Note workflow, to be resolved with the
  focus and empty-file questions above. Prior art: at v0.2.0 an empty note reached disk only
  when something was typed.
- [ ] **Find counts a code block's matches twice** (the textarea and its highlight overlay,
  `FindBar.jsx`), and Replace leaves a match inside a table cell, a callout or a code block
  alone, since those blocks own their fields; replacing inside them is a decision to make once
  it has been felt.
- [ ] **Edits across a block boundary that the app refuses rather than makes** (the block-root
  rule in the editor rule): a selection reaching from a text block into a table, callout
  or code block, then Backspace or typing, changes nothing (deleting the run is not attempted);
  a text drag across blocks copies rather than moves; Cmd+B across blocks toggles each block on
  its own; an IME composition begun over a selection spanning blocks cannot be intercepted
  (`insertCompositionText` is not cancelable). None loses data; each is a decision to make
  once it has been felt.
- [ ] **The empty state and the focus ring are short of ink** (review §5): the empty-state line
  at half muted is 1.95:1; the focus ring at 25% accent is under 2:1 where a component needs
  3:1. Full `TEXT.muted` for the empty state and a 2px ring at 60% would still be quiet. (The
  toasts in the same finding were redrawn on 2026-09-19.) Not re-verified.
- [ ] **⌘N then ··· → Rename at once leaves focus on the ··· button**, so the name typed goes
  nowhere; with the caret in the body first, Rename works on a draft as on a note (checked
  2026-09-24). Duplicate and Delete on an empty draft do nothing visible and write nothing.
- **Taste calls, judge live:** `\# bar` shown after a reopen (the soft-break escape of
  2026-09-09); opening `/` after a space mid-line as well as at the start of an empty block
  (Craft's compromise; review §7.6). Multi-line paste into a code block should be native since
  2026-09-08 (review §1.10); confirm once.
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
**Two-way use with Obsidian is not yet a general guarantee** (assessed 2026-09-15 on a copy of
Tyr's vault, six findings reproduced in the real app, four of them since fixed): a note's
*text* survives switching apps, and a click on any link Obsidian writes now opens the note or
creates nothing, and a table keeps its spelling through a save, but a rename leaves dangling
references (Data safety). Until that closes, treat the promise as "the bytes it
understands are safe and the rest is preserved", not "switch freely".

- **Links: parsing defects and missing navigation.** Optional link titles are treated as part
  of the URL. Reference-style links are unresolved;
  relative `.md` links use the external-link path rather than navigating within the vault.
  Assess correct parsing, source preservation and destination handling together. Heading
  targets are a separate future item below.
- **Code: literal handling and delimiter support.** Formatting inside a code span can render
  as active emphasis; multi-backtick spans need correct delimiter handling. Indented code is
  not recognised as code. Keep contents literal through reading, editing and writing.
- **Missing rendering: imported underscore emphasis.** `_italic_` and `__bold__` are CommonMark,
  and typing them converts (saved in the star form, 2026-09-10), but the renderer and writer
  speak only `*`. Rendering imported underscores must not cause the first edit to rewrite
  their marker style; source-preserving editing needs to accompany rendering support.
- **Missing syntax variants: alternate dividers.** `***` and `___` are not recognised as
  dividers. Assess common forms without normalising their authored spelling on save.

### Data safety / reliability

**First-edit mutations.** The first edit of an affected note can rewrite third-party content.
`KNOWN_FAILURES` in `tests/utils/preservation.test.js` holds the fixtures that already fail.

- [ ] **A typed trailing space can reach the file as U+00A0** — Chromium holds a space at the
  end of a text node as `&nbsp;` so it renders, and turns it back into a space at the next
  keystroke; a save that lands in a pause after the space writes the non-breaking byte
  (`hello world\u00A0`, probed in the real app 2026-09-09; the next character rewrites it as a
  space; a space typed right after a link, on the caret anchor, is held the same way and stays
  U+00A0 when the next word follows, seen 2026-09-16 in a copy that carried it into Obsidian's
  file). A trailing U+00A0 the file itself holds is indistinguishable from it at read-back,
  which is why no normalisation was added with the inline-preservation fix; `pre-wrap` was
  rejected earlier for changing how every run of spaces renders. A leading space, or a double
  space, typed in a line reaches the file the same way and, unlike the trailing one, persists
  (review §1.7, reproduced live); one decision for the three.

**Undocumented normalisations** (decision pending: carry the raw bytes with the
`indentStr`/`marker`/`numRaw`/`bare` pattern, or sanction each in the spec). None is in the
spec's sanctioned list; each needs a preservation fixture either way. Re-probed on master on
2026-09-07, every one still occurs on any save of the note:

- [ ] Uppercase `- [X]` is written as `- [x]`.
- [ ] Dividers with 1–3 leading spaces are dedented.
- [ ] Mixed line endings are healed to the dominant style (a code comment records this as
  intended; the spec does not).
- [ ] Unclosed frontmatter gains a closer.
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
- [ ] **Wikilink rename does not update referrers** — silent link breakage, and a two-way
  compatibility gap even though it is current behaviour rather than a regression (reproduced
  2026-09-15: rename `Beta` to `Gamma` and `[[Beta]]` in another note stays as written and shows
  broken). The rename is a new file plus an unlink, so Obsidian sees a delete and a create and
  its own link update never runs either; a vault edited in both apps accumulates dangling links
  from every rename made here. **Decided 2026-09-20 (Tyr): not rewritten, for now; reopened
  2026-09-24 (Open decisions).** Rewriting other files on a rename needs a carve-out in the
  preservation promise (`SPEC-markdown-source-of-truth.md`) and a backlink index; instead the
  broken link draws dashed, the chip says the note is missing, and a click opens the link picker
  to point it somewhere. "Ask on rename: update N links in M notes?" is the candidate if this
  grates.
- [ ] **Unparseable files vanish from the sidebar** silently.
- [ ] **A symlinked `.md` is replaced by a regular file on write** — the atomic rename lands a
  new inode over the link, so the target file is left stale and the link is gone.
- [ ] **Birthtime, Finder tags and other xattrs are lost on every save** (review §2.8; the
  permission bits are kept since 2026-09-09). The same root cause as the symlink above: the
  atomic rename lands a new inode. One design decision for both, copy the xattrs onto the temp
  file or write in place with a backup; never fixed by writing in place without a decision on
  the backup strategy.
- [ ] **A symlinked folder inside the vault is skipped by the walk and followed by chokidar**
  (review §2.9), so a note under it can be reported changed but is never listed.
  `followSymlinks: false` is the one-line consistent answer when the watcher is next touched.
- [ ] **Pre-0.5 residue that reads or rewrites user files**: a legacy `id:` frontmatter key makes
  the first write strip the whole frontmatter block; `resolve-attachment` still scans the v0.1
  `.attachments/<noteId>/` layout; the `.trash` migration runs at every launch. Retire the three
  migrations (about 210 lines) once every tester has installed a post-0.5 build, not before.

### Accessibility

axe runs over five surfaces in both themes (`e2e/accessibility.spec.ts`) and the palette's contrast
is a unit test (`themeContrast.test.js`); both fixed in the pass of 2026-09-25. Known gaps:

- [ ] **Context menus are `<div onClick>`** (Link/Image/Slash/CalloutPicker): not
  keyboard-reachable, no roles or focus traps. SlashMenu's `aria-selected` on `menuitem` is
  invalid. The table's cell menu left this list on 2026-09-10 (rebuilt on the note menu's
  grammar); the note, sort and table menus and the folder popup carry four copies of that grammar, and
  one shared menu primitive is the cleanup that would also fix the four above.
- [ ] **Tab never leaves the editor** — `useKeyboardHandlers.js` prevents the default for every
  block type and indents only lists, so Tab in a paragraph is swallowed and Shift+Tab cannot
  reach the chrome. Notion does the same; a keyboard trap to resolve in the accessibility pass,
  not in isolation.
- [ ] **The crash screen loses its theme**: `GlobalStyles` renders inside the boundary.
- **Do the menu unification inside this pass, not before it.** Menu keyboard grammar is
  implemented seven times (`ContextMenu`, `SortMenu`, `PathTreeMenu`, `WikilinkMenu`, `TagMenu`,
  `CalloutBlock`, `SearchPalette`, plus the sidebar's own), outside-click dismissal fourteen times, positioning
  three ways (`CodeBlock` keeps a hand-rolled clamp). One `useMenuKeyboard`/`useDismiss` pair
  is worth it only because the accessibility pass touches every one of them anyway.

### Technical debt

- **`useIsMobile` → `useIsTouch`** — the hook answers "is this a touch device", not "is the
  window narrow"; width decides nothing about navigation since the sidebar overlay went
  (2026-09-14).
- **`tests/electron/markdown.test.js` is misfiled** — it tests `src/utils/markdown.js`; move it
  beside `tests/utils/markdown.test.js` and drop its round-trip block, which duplicates
  `LOSSLESS_CASES` there (no overlapping test names otherwise).
- **Untested seams worth a case each**: `remapNoteFolders` (undo across a folder rename), the
  `boojy-att://` traversal guard, and a pending title at quit. No layer covers them today.
- **Confirmed deletion never runs in CI** — both Trash journeys and the case-only rename skip
  off macOS (`deletion.spec.ts`, `folders.spec.ts`) and CI is Ubuntu only. A macOS job for
  `pnpm test:electron` (~5 min) is the fix; deferred, since the daily-driver build exercises
  them by hand.
- **No Content-Security-Policy on the renderer** (review §6). The escaping is sound (every
  path-taking IPC handler goes through the vault guard, `will-navigate` and the window-open
  handler deny everything, `open-external` is `http(s)`-only), but it is a hand-rolled regex
  pipeline across three files and three `dangerouslySetInnerHTML` sites; one `<meta>` CSP is the
  control that makes a future slip inert. It touches HMR, inline styles and `boojy-att:`, so it
  is a job on its own. `javascript:` hrefs survive into the DOM and only the main process
  filters them: inert on desktop, and the web build's `window.open` fallback is not product.
- **The hook-dependency warnings are the lint gate's last noise** (2026-09-24): `pnpm check`
  now warns about nothing else, 206 `useExhaustiveDependencies` in all. Most name a ref's
  `.current` or a function from the frozen `EditorContext` (AGENTS.md gotcha 3), which the rule
  cannot see is stable, so adding them blindly would change behaviour; a few may be real stale
  closures. One audit: teach the rule the app's stable hooks, suppress each deliberate site with
  its reason, fix the real ones. Two rules are off by decision: `noAssignInExpressions` (the
  `while ((node = walker.nextNode()))` idiom throughout the walkers and the parser) and
  `noNonNullAssertion` (an invariant TypeScript cannot prove, and the tests' idiom). Also from
  review §6: Actions are pinned by major tag, not SHA. Zero unit coverage on
  `useTableInteractions`, `useSidebarDrag`, `FindBar`, `SidebarContext`, the watcher's event
  handlers and `folderOps`; the Electron suite is the trustworthy layer for those journeys.
- **Chrome ink, one pass if it is seen** (review §5): fourteen popovers carry hardcoded black
  shadows at 0.4–0.5 where `theme.modalShadow` is 0.12/0.08 in Light; the code block's
  context-menu hover is white at 6% over a white surface, invisible in Light; the find
  highlight colours are hardcoded amber in `main.jsx`; `CalloutBlock` imports eleven icons
  straight from `lucide-react` at 15 and 17px, stroke 1.8, off both tiers; no font token
  (`Inter` is named first and never shipped, so every geometry judgement in the rules was made
  in SF Pro), four mono stacks, no `tabular-nums` where counts change width; `Toast` ids are
  `Date.now()`, so two toasts in one millisecond share a key.
- **Block IDs are minted on every re-parse** — `markdownToBlocks` uses a module-global counter,
  so a re-sync remounts every block and loses the caret. Fix is content-stable IDs; non-trivial.
- **The touch layout goes** (decided 2026-09-24): about 1,700 untested lines in
  `src/components/mobile`, plus 55 `isMobile` branches the desktop files pay for. **Switched
  off** on 2026-09-24 (`TOUCH_LAYOUT` in `BoojyNotes.jsx`), not deleted, because the web build
  on a phone comes straight after this phase and its design may want a starting point; deleted
  once that design starts and does not reuse it (git keeps it). The archived
  `docs/private/archive/mobile-spec.md` header records its grammar. Deletion retires the
  `useIsMobile` → `useIsTouch` rename above and the touch ··· menu's separate delete copy.
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
  black alphas, per-theme callout and syntax colours), Dark's first-paint flash, and the
  consume-once `textOnlyEdit` flags in `useHistory`, which have no margin against a second
  reader (a spurious recompute costs a repaint, never a keystroke).

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
  existing Markdown folder preserves. **Word export** after PDF (Beta candidates): the `docx`
  library handles headings, lists, tables and pictures, but "looks right in Word" is a long
  tail, so it waits for a real document to judge it against.
- **A web clipper**, "save to Boojy Notes" from a page, through the `boojy-notes://` link
  (Beta candidates). What it keeps is undecided: the link and the selected text, or the whole
  article as Markdown with its pictures.
- **Copy as Markdown and as formatted text.** Selection behaviour shipped on 2026-09-16: a
  whole-block copy carries the blocks' Markdown as plain text and their structure as block
  HTML, an ordinary selection its visible text and inline formatting (editor rule, "Paste keeps
  the block you are in"). Still open: a whole-note copy (the file itself), attachments (an
  image or file copies as its `![[…]]` reference, never the file), and whether a "Copy as"
  control earns a place at all.

### Editor and organisation

- **Built-in viewers for PDFs, pictures, audio and video.** Wanted later (Tyr, 2026-09-24:
  staying in the app to read slides is what he likes in Obsidian). One note is open at a time,
  so a viewer takes the note's place, with Open in the default app one click away in the chrome
  row. Chromium's own PDF viewer and the native media elements do the work, and both run in a
  browser too, which the web build will need. Never a viewer for PowerPoint or Word: those open
  in their own app. A local video embedded in a note (`![[clip.mp4]]`, Obsidian's form) plays
  inline once this exists. **A YouTube link** is a card (thumbnail, title) that opens the
  browser first; inline playback brings Google's player, tracking and a hole in the window's
  navigation rules, and waits until the card is found wanting.
- **Maths** (`$…$`, `$$…$$`): no for now, possibly later (Tyr, 2026-09-24).
- **Open a note in a new window**: yes, later (Tyr, 2026-09-24). Still one note per window, never
  tabs.
- **Heading targets in links, and folding.** An outline or heading picker was declined on
  2026-09-24 (Not doing); folding was not asked and stays open. What remains is links to
  sections within and between notes, including heading targets in wikilinks (since
  2026-09-15 a `[[Note#Heading]]` or `[[Note#^block]]` click opens the note; the jump to the
  heading or block is what is missing, and a folder-path link to a note that does not exist
  creates nothing rather than making the folder). Explicit
  heading IDs are a separate syntax decision; target naming and behaviour when headings change
  remain open.
- **Table alignment controls.** Consider restoring a way to set left, centre and right column
  alignment. Existing file alignments already render; the current absence of controls remains
  intentional. Placement and interactions are unchosen. A separator is kept as written until
  its alignments change (editor rule).
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
  selection, attachments, filesystem access and background sync need real-device evaluation.
  The web build working well on a phone comes before any app (Direction). Drawer versus
  two-screen navigation was explored on 2026-04-06 and left undecided; the two-screen touch
  layout is switched off and then removed (Technical debt). The earlier Capacitor spec, mobile
  spec, navigation exploration and release strategy are archived in `docs/private/archive/` as
  reference, not plan.
- **Accounts: email-only** when accounts are needed (codes or links; session length open).
  Local desktop use never requires one.
- **Encryption undecided.** End-to-end (privacy; against it, recovery, new-device setup,
  browser access and implementation cost, and an email recovery flow cannot recover a lost key)
  against service-managed (simpler; more provider access and trust). No privacy or recovery
  promise before the approach is chosen and verified. **Private or encrypted notes in a local
  vault: not now** (2026-09-24). An encrypted file is no longer an ordinary file anyone can open,
  search cannot read it, and Obsidian cannot either; FileVault already covers a lost laptop.
  Revisit alongside the cloud encryption decision.
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

Declined 2026-09-12, when the sidebar was rearranged: **Collapse all folders** (folders toggle
on click and persist as left, and the list menu has no room for an action nobody reached for),
and **Back and Forward** through recently open notes (one active note, no navigation stack; the
sidebar and Search are how you get back to a note; Recent notes in Search, which shipped on
2026-09-20, is the idea that survives from it).

Declined 2026-09-24, planning the phase before cloud: **databases, properties views, bases and
saved searches** (folders, tags and search are the whole model; "avoid becoming gimmicky"), **an
outline or heading picker**, **a vim mode** (keyboard-only use is the goal, not modal editing),
**a git interface** (a vault kept in git keeps git; local version history is the app's answer),
and **more block types** for now. Templates and daily notes stay out, reconsidered only if
duplicating notes by hand becomes a daily chore.
