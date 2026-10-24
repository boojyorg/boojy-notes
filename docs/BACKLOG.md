# Boojy Notes — Backlog

Direction, what is left to do and what is known to be broken. Shipped work goes in
`CHANGELOG.md`, never here. The philosophy: daily-drive Boojy Notes, and let observed friction
decide what deserves to exist next. Nothing is added because it sounds
plausible.

**Stages.** Early access ran from v0.7.0 to v0.14.0. **Beta (now, since v0.15.0 on
2026-10-07)** is the desktop app complete enough for Tyr's and a few friends' daily use; its
release requirements (daily use reliable, the Windows smoke test, a tag that publishes itself)
were met. **Public Beta (next)** is when anyone can install it: desktop on macOS, Windows
(signed) and Linux, Android through Google Play, and a demo on boojy.org/notes. **1.0** adds
the iOS app, a web app that keeps notes, and a second sync route besides Dropbox.

**The bar for Public Beta, and again for 1.0 on its platforms: fully usable without depending
on future features.** Versions stay 0.x until 1.0. Problems bad enough to fix before anything
else sit in Fix now.

The tiers, kept apart. **Requirements** are what a stage waits for. **Candidates** are
optional; each is judged on its own and may be declined. **Future** is everything after 1.0,
recorded so a preference and its open question are not lost. Last reviewed: 2026-10-24, the 1.0
scope pass (a read-only audit of v0.18.0, an independent review and a Codex review). Items
marked *review §n* come from the whole-app review of 2026-09-07.

## Direction

Boojy Notes sits between Apple Notes, Obsidian and Notion: approachable writing, ordinary
Markdown files, lightweight organisation and easy movement between apps. All three audiences
inform the defaults; Notion's editing convenience is the reference and its clutter the thing to
avoid. Bring existing notes in, create and edit without ceremony, find them again, keep the
files. Migration quality, editing comfort and access across devices are expected to matter
more than any feature nobody else has. That is a product hypothesis, not validated demand.

- **Next: Public Beta** (decided 2026-10-24). Phone sync, the previous goal, works in Tyr's
  daily use (Mac and Pixel through Dropbox, offline writing included); the Android app is not
  yet distributed. There is no date: a stage ships when it meets the bar, and its requirements
  are the plan. Personal tools only; collaboration is excluded. **The order:** Public Beta;
  1.0 (iOS, the web app, a second sync route); Boojy Cloud is weighed once third-party sync's
  limits are known.
- **Sync is provider-neutral.** Dropbox is the first provider built and tested, not a
  permanent requirement: **local use on every supported platform works with no Dropbox and no
  account**. Two kinds of sync are kept apart: the app editing a folder another app syncs
  (Dropbox's or Google Drive's desktop app, iCloud, Syncthing, git), and the app connecting to a
  provider itself (the phone's engine, `src/sync/`). A folder that works on the desktop proves
  nothing about direct sync with that provider on a phone. **One sync mechanism per
  collection**: changing provider keeps the local notes and is an explicit, safe migration,
  never automatic. **Self-hosting means connecting to a server the user already runs** (such as
  Nextcloud), not a self-hostable Boojy Cloud backend.
- **Local-first; the cloud is opt-in.** Nothing leaves the machine unless you turn sync on,
  and a device that never signs in loses nothing. **Hosting must stay cheap to run**: a design
  that could cost $1,000 a month is the wrong design, so quotas, size caps and a budget alarm
  arrive with the first server code, not after.
- **When unsure, match Obsidian.** A syntax or behaviour question Obsidian has answered takes
  its answer, because vaults move between the two apps. The exception is anything that makes
  Boojy Notes another kind of app: it is a Markdown editor, not a drawing, recording or canvas
  app, and it has one way of showing a note.
- **Boojy Notes and every editing feature are free.** Local use never needs an account. The
  suite position on hosted storage lives in the suite root's `VISION.md` §7; nothing in this
  backlog assumes any particular Cloud outcome.
- **Obsidian compatibility and Notion-first import are complementary.** Existing Markdown
  folders, Obsidian vaults included, open as they are (the spec's support dimensions). Notion is
  the first migration priority for a whole collection, after 1.0; a Word document for a single
  file and Apple Notes follow.
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

Product calls for Tyr.

- **A spare empty row is two blank lines in the file.** One blank line between blocks is
  structure (the gap every Markdown reader needs), so Enter twice after a paragraph shows one
  empty row and writes two blank lines, as Obsidian needs it. Tyr is unsure it feels right
  (2026-09-24). The alternative, one blank line per spare row, would make a single blank mean
  either a gap or a row depending on context. Also open: whether the row's height (a line plus
  the paragraph gap) reads as a bigger hole than the Enter that made it.
- **Setext headings (`===` and hyphen underlines). Settle before Public Beta.** Recommended:
  recognise both, keeping their spelling; editing behaviour unresolved. Today `===` stays
  paragraph text, and `hello` / `---` (a heading to every other reader) shows as a paragraph and
  a rule, its first save writing the blank that makes it a divider everywhere (sanctioned in the
  spec). One `it.fails` in `tests/utils/markdownInterop.test.js`. An empty bullet tight under a
  paragraph (`hello` / `- `) is the same underline outside; its spelling is kept.
- **Which sync route besides Dropbox, for 1.0.** A supported route that works between desktop
  and mobile. Investigate Google Drive and WebDAV (Nextcloud) first and recommend one; building
  both is not committed. Judged on: permissions (Google Drive's full access needs
  restricted-scope verification; what narrower access allows is to check), safe writes (an
  atomic replace or a revision check), conflicts (how the provider reports a clash, and
  whether the engine's keep-both rule holds), offline behaviour, and the cost of maintaining
  it. The provider-neutral rules in Direction apply.

## Fix now

Problems Beta users can hit today. Each is small and comes before anything else.

None open.

## Public Beta: requirements

What Public Beta waits for, by area (decided 2026-10-24 unless marked open). Each is proved by
the test its rule names when it is built.

**Files and safety**

- **A moved vault keeps its history.** The note index and version history are keyed by a hash
  of the folder's path (`vaultKey`, `electron/vaultFs.ts:33`), so any move, the one into
  Dropbox that sync setup asks for included, detaches history, Recently Deleted, Recents and
  PDF positions (moving it back restores them).
- **Recovery is demonstrated**: export and a tested restore on every platform; full storage,
  revoked folder access and a disconnected Dropbox stated and tested, local notes usable
  throughout. The crash screen promises a backup whose write can fail silently and that
  nothing reads back (`ErrorBoundary.jsx:18`): fix the path and the wording.
- **An outside edit to the open note**: with no unsaved typing it updates in place, caret kept
  and that note's undo cleared; with unsaved typing both versions are kept and the editor stays
  on the user's. Content-stable block ids are part of it, not all: `applyExternalNote` drops the
  undo entries (`useHistory.js:190`) and the clash path opens the copy (`useFileSystem.js:353`).

**Compatibility**

- **Attachments resolve as Obsidian resolves them**: by name anywhere in the vault, and by a
  path relative to the note. Only the root and `attachments/` are tried today
  (`electron/main.js:314-327`): 18 of 23 file embeds in `~/Documents/Vault` show Not found.
- **Relative `.md` links open the note; link titles leave the address; code spans, `_`/`__`
  emphasis and the other divider forms draw as they mean**, each keeping its spelling (Markdown
  compatibility, below).
- **The Obsidian extensions, explicitly.** Drawn and edited: wikilinks and aliases,
  `[[Note#Heading]]`, embeds with a size (`#page=`: a file card that opens that page), callouts,
  `==highlight==`, `#tags`, frontmatter (collapsed), maths, Mermaid. **Preserved only**, byte for
  byte and shown as text: footnotes, `%%comments%%`, task states beyond `[ ]`/`[x]`, `^block-id`,
  HTML, reference-style links, plugin syntax. The spec takes this list when the work lands.

**Connected notes** (one link index)

- **Links follow an in-app rename or move.** Once the name settles, `[[…]]`, `![[…]]` and
  `[x](Note.md)` links resolving to the note are rewritten in readable notes, with the name the
  write chose, `#subpath` and alias kept, the shortest clear target (`linkTargetFor`). A version
  first, one toast with the count; not undoable, like a move. Renames outside the app, on the
  phone or while closed are reported, never rewritten; offloaded and unreadable notes are
  skipped and counted. The spec's preservation promise gains the carve-out.
- **`[[Note#Heading]]` jumps to the heading**, matched by text as Obsidian does.
- **A quiet backlinks section** at the foot of the note.

**Organisation**

- **Favourites, the same on every device**: from the note's ··· menu; a section that comes
  with the first and goes with the last; a second route, never a move. Kept in one small file
  in the vault (under `.boojy/`, by vault-relative path), written with the first favourite,
  remapped by the app's moves; a missing path is ignored and losing the file damages nothing.
  Sync and the phone's listing skip dot paths (`src/sync/engine.ts:57`, `phoneVault.ts:365`):
  that one file is let through. **Tried first** on a branch with local storage, which never
  merges. Open: ordering, folders.

**Phone (Android)**

- **Works offline with no Dropbox and no account.** The sign-in screen goes
  (`src/phone/install.ts:43`); Connect Dropbox is optional, from Home, choosing the folder
  (fixed to `Personal` today, `syncFolder.ts:8`). A damaged sign-in file never locks anyone
  out (`phoneSync.ts:59-68`). The first connect is tested on a phone that already has notes.
- **A folder the user can see** (Storage Access Framework), as well as app-private storage: a
  native plugin and a new file layer under sync, where other apps may write (the hash cache
  assumes they never do, `phoneVault.ts:186`). Prove one folder's saves and crash recovery on
  the Pixel first.
- **Export and import**, **adding pictures** (off, `platform.js:12`), the Dropbox token in
  Android's Keystore (a plain file today), a deliberate backup setting (settings yes, token
  never), Settings laid out for a phone.
- **Google Play, without the Mac**: a release key, `versionCode` from `package.json`, an AAB
  from CI, the data-safety form.

**Desktop**

- **Windows signed** through the SignPath Foundation (free for open source; names SignPath as
  publisher; a policy page; each release approved by hand). SmartScreen still warns until
  reputation builds, but Smart App Control blocks unsigned apps that have none. Try the first
  signed update over an unsigned install in the VM. Planned, not blocking: a Microsoft Store MSIX
  (a second build target; Microsoft re-signs MSIX, not our EXE; the Store updates it).
- **Export and print to PDF** from the main window with a print layout (no chrome, page breaks
  that never split a table row or a picture, maths and diagrams drawn); no second window.

**Help, quality, web and stores**

- A first-run welcome, a shortcuts sheet, **Help → Report a Problem** (an email to
  tyr@boojy.org with version and OS, shown before sending; no telemetry); help pages on sync
  and history not being a backup, and moving from Notion by hand.
- The Known issues a finished Public Beta cannot live with: New note writing `Untitled.md` at
  once; Replace skipping cells, callouts and code, and Find's double count; the pre-0.5
  migrations; the symlink check.
- A 10,000-note vault on the desktop; a first phone sync with large attachments; VoiceOver and
  TalkBack over the editor.
- **The editor in Safari's engine**, since the demo meets Safari visitors: a Playwright WebKit
  project (a signal, not Safari) and a check on a real iPad.
- **The demo inside boojy.org/notes**: the real editor and a sample note, saving nothing; the
  download keeps notes. `boojy-notes-web.pages.dev` says it is a test build.
- The privacy page names Dropbox; Dropbox production approval (500 users in development; the
  50th starts a two-week deadline).

**Build order**: the boundaries (platforms, storage, recovery); Fix now; the favourites trial;
Android storage and a moved vault's identity; one resolution for attachments and links;
renames, heading jumps, backlinks; favourites; PDF export and onboarding; device, access and
performance acceptance. Signing and stores alongside. **Start early**, since they wait on
others: SignPath; the Microsoft Store account; Play's closed test (12 testers opted in for 14
days in a row before production can be applied for); the Dropbox application.

## 1.0: requirements

Public Beta, plus:

- **The iOS app** on the same editor (Capacitor), through TestFlight and the App Store; its
  folder shown in the Files app. It needs an iPhone or iPad in daily use, and Tyr's iPad is
  not one, so it waits on that.
- **The web app at notes.boojy.org** that keeps notes: real `.md` files in the browser's
  private file system (OPFS) through the phone's `FileOps` shape, persistent storage asked for
  and its state said plainly, export and import, the app loading offline with updates that
  never reload mid-typing, attachments, one writer across tabs, a full quota handled, notes in
  today's `localStorage` carried over. Folder access in Chromium desktop is an extra. Chrome,
  Edge and Safari supported; Firefox best effort.
- **A second supported sync route**, desktop to mobile (Open decisions). Sync on the web is
  separately scoped (Future), not part of 1.0.

## Candidates

Optional. Each is considered on its own, judged by daily-drive friction, and may be declined;
none blocks a stage.

- **Callout contents as real blocks.** Lists, fences and nested callouts inside a callout show
  as text today, and a fold (`-`/`+`) is kept but ignored; whether a click folds one is part of
  the same question. Decided only after a round of mockups.
- **Tables that work better.** Wanted (Tyr, 2026-09-24): 101 of the 213 notes in his vault hold
  one. Grips, alignment, Duplicate and Clear contents shipped (`CHANGELOG.md`). Left, in the
  order daily use asks for them: a paste from a spreadsheet (tab-separated text) into a
  paragraph becoming a table, and dragging several rows at once (the keyboard path shipped
  2026-09-25). No colour, by decision: Markdown cannot hold it.
- **Whole-block deletion for code, callout and file blocks.** The arrows enter code and
  callouts; Backspace and Delete still step over them (Backspace merges text, so it lands only
  where text can go), and a file block is stepped over by both. That half is left to judge.
- **"Edited today at 11:37"** beside the ··· menu's word count, exact time on demand,
  following the sort's recency rule (rename and move count; opening never does).
- **Lecture files in the app, the rest.** PDFs and pictures open in the note's place
  (`CHANGELOG.md`). Left: `![[Slides.pdf#page=12]]` embedding a page in a note, audio and video
  playing inline (`![[clip.mp4]]`) or in the note's place (they get the card for now), the
  Mac's Quick Look for slides, searching PDF text (⌘F in a PDF), dragging a thumbnail into a
  note as a page link, Rename and Move to… for a viewed file (with backlinks, so its links
  follow), and the open file surviving a relaunch. Not planned: annotating PDFs, reading text
  from pictures.
- **The Markdown view's residue.** No Find in it yet (⌘F does nothing while it is on); list
  continuation and auto-pairing only if typing there proves common; a Tidy for the table under
  the caret if hand-aligning pipes becomes a chore. Decided, to revisit after use: no slash
  menu in it (`/` is typed there constantly) and no alignment as you type (it moves text under
  the caret).
- **Version History, later**: a Settings switch for all notes; history through Boojy Cloud.
  Neither sync nor history replaces an independent backup.
- **Searchable `/link`.** Consider an entry point to the existing inline-link controls, not a
  new block type. Discoverability and interaction need live judgement; adding it may be declined.
- **Other files in the tree, the rest**: Rename and Move to… on the row (once links follow
  renames), and a drag into a note that writes a link. A Finder change reaches the tree on
  window focus; watching them only if that proves slow.
- **Quick capture and a `boojy-notes://` link.** Wanted (Tyr, 2026-09-24): a global shortcut
  from anywhere on the Mac makes an ordinary new note, the same creation as Cmd+N (no inbox, no
  quick-note type). A `boojy-notes://new?title=…&text=…` scheme is the one door for it, a
  bookmarklet, the Shortcuts app and Raycast, and later a web clipper (Future). Initial focus,
  location and the moment an empty note becomes a file are undecided for every entry point. Not
  accepted: deriving the title from the first line.
- **Custom shortcuts**, once the defaults are good (2026-09-30).
- **Find in note, as good as a code editor's.** Cmd+F finds and replaces (it opens as it was
  last left; Edit → Find ▸ since the menu bar); Tyr asked for it without knowing it was there
  (2026-09-24). Add match-case and whole-word toggles, and draw it in the app's grammar (Lucide
  glyphs, not the three hand-drawn SVGs and the `▶`/`▼` text). Its double count and Replace's
  reach are under Known issues.
- **The vault in your own sync and version control, verified.** It works by design, since the
  notes are a folder; the work is proving it and writing the help page. Run a real vault in
  iCloud Drive (files evicted to placeholders), Dropbox and Google Drive (their conflicted
  copies), and git (a checkout's burst of watcher events). Cheap, and useful before Boojy Cloud
  exists.
- **The public face, current.** The README's screenshots and feature list, the GitHub repo's
  description, topics and social preview, and boojy.org/notes (in `boojy-web`) describe the app
  as it is. boojy.org/notes may show a short Now / Public Beta / 1.0 table (three plain lists,
  no dates), updated in each release's docs pass. Short, friendly help pages; the aim is that
  nobody needs them.

## Known issues

### From the September 2026 review

Still reproduce on master, in the review's order. Those named in Public Beta's requirements
block it; the rest do not.

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
- [ ] **The empty state is short of ink** (review §5): its line at half muted is 1.95:1; full
  `TEXT.muted` would still be quiet. Not re-verified. (The focus ring is `ACCENT.text` since
  the accessibility pass.)
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

- **Cmd+B at a bare caret** (press, type, press, as Apple Notes and Notion do). Bold and italic
  work through Chromium's own typing style, a space at either edge kept outside (v0.16.0);
  strikethrough, highlight and code do nothing (their toggles return early on a collapsed
  selection, `useInlineFormatting`). Making them real means owning the typing style for those
  three.
- **Nested typed formatting** (`*x*` typed inside existing bold) is left literal until the next
  repaint, by the trigger's own guard; the renderer decides it then. Judge live.

### Markdown compatibility

Re-verified on 2026-10-24 (v0.18.0) with converter probes; the first four are Public Beta
requirements (reference-style links aside, which stay preserved only). Missing support is distinct from a correctness defect; each keeps the file's
bytes on load and save. **Two-way use with Obsidian is not yet a general guarantee**: the
bytes the app understands are safe and the rest is preserved, but a rename leaves dangling
references and attachments are found only in two places (Public Beta).

- **Links.** A link title joins the address (`[a](b "t")` → `href="b "t""`); reference-style
  links show as text; a relative `.md` link does nothing when clicked.
- **Code.** Formatting inside a code span draws as emphasis; a multi-backtick span splits;
  indented code is a paragraph.
- **Imported `_italic_` and `__bold__`** show literally (typing them converts to the star
  form). Drawing them must not make the first edit rewrite their markers.
- **Dividers.** Only exactly `---` is one: `***`, `___` and `-----` are text, and `* * *` reads
  as a bullet holding an empty emphasis.
- **Delimiters interleaved** (`**a==b**c==`, an escaped one beside live ones) pair differently
  than written; `tests/utils/knownRewrites.js` holds them, an entry deleted with each fix.
- **Embeds.** `![[x.png|alt|300]]` and an embed mid-line show as `!` and a link; `![[Note]]`
  embeds the first note of that name, ignoring a folder path (`EmbedBlock.jsx`).
- **`=====`** (a setext underline) draws as a highlight.

### Found by the Windows and macOS CI (2026-10-05)

- **Spelling on Windows, the rest** (Chromium's line since 2026-10-05): it appears only once
  the note has focus, a moment after; a word taken out of the dictionary (Undo) is kept on
  Windows' exclusion list and reads as misspelled again only after its paragraph is edited.
- [ ] **Escape left a code block's right-click menu open on the macOS runner**
  (`editor-menus.spec.ts:48`, `fixme` there). A menu takes focus a frame after it opens
  (`useFocusTrap`), and a window that paints no frames (hidden, or covered on the runner)
  never gets there, so Escape went to the code block. Not seen by a person; reproduced on a
  hidden local window. Fix the runner's window, or focus without waiting for a frame.

- [ ] **The app once failed to quit on the Linux runner** (`app-menu.spec.ts:82`, master
  858f118, 2026-10-06): `app.quit()` after File → Duplicate and the find bar did not close the
  app within 30 s, though the quit handshake caps the flush at 2 s; the retry passed. Once in
  about sixty runs; again on the macOS runner (`first-run.spec.ts:71`, 2026-10-21). If it
  recurs, trace which quit step waits (`BOOJY_TRACE`).

### Data safety / reliability

**First-edit mutations.** The first edit of an affected note can rewrite third-party content.
The preservation suite's `KNOWN_FAILURES` is empty since 2026-10-05; what remains is in Fix
now and `tests/utils/knownRewrites.js`.


**Lost edits and filesystem.**

- [ ] **Concurrent flushes are not serialised** — blur, quit and the write-debounce timer can
  each run `flush` at once (`useFileSystem.js`, `useQuitFlush.js`); a flush cancels the pending
  timer, so the residue is a redundant write when two overlap and a theoretical mid-write kill
  if the quit handshake completes while a blur write is in flight (the atomic rename keeps the
  last complete file).
- [ ] **A crashed renderer burns the quit handshake's 2 s cap** — the flush listener now removes
  itself and a destroyed window is checked, so nothing accumulates on rapid Cmd+W then Cmd+Q;
  what is left is that a renderer that has already died still holds the quit for the cap.
- [ ] **Wikilink rename does not update referrers** — rename `Beta` to `Gamma` and `[[Beta]]`
  elsewhere stays as written and draws dashed. The rename is a new file plus an unlink, so
  Obsidian's own link update never runs either. A folder rename breaks every `[[Folder/…]]`
  link under it. Fixed by Public Beta's "links follow an in-app rename or move".
- [ ] **A symlinked folder inside the vault** (review §2.9): unchecked since the one recursive
  watch (`treeWatcher.ts`) replaced chokidar. Check whether its notes are listed and watched
  (Public Beta).
- [ ] **Pre-0.5 residue that reads or rewrites user files**: a legacy `id:` frontmatter key makes
  the first write strip the whole frontmatter block; `resolve-attachment` still scans the v0.1
  `.attachments/<noteId>/` layout; the `.trash` migration runs at every launch. Retire the three
  migrations (about 210 lines) before Public Beta.

### Accessibility

axe runs over five surfaces in both themes (`e2e/accessibility.spec.ts`) and the palette's contrast
is a unit test (`themeContrast.test.js`); both fixed in the pass of 2026-09-25. Known gaps:

- [ ] **The callout's type button is not a Tab stop** (a `div role="button"` inside the block);
  it is named and announces its list since 2026-09-25. With the Tab pass.
- [ ] **The crash screen loses its theme**: `GlobalStyles` renders inside the boundary.
- **Not every popover is `Menu` yet**: the suggestion menus, the link picker, the path tree
  and the version and deleted lists keep their own dismissal, and the callout picker
  positions itself by hand. They behave the same to the eye, so they wait for a reason.

### Technical debt

- **Untested seams worth a case each**: `remapNoteFolders` (undo across a folder rename), the
  `boojy-att://` traversal guard, and a pending title at quit. No layer covers them today.
- **No Content-Security-Policy on the renderer** (review §6). The escaping is sound (every
  path-taking IPC handler goes through the vault guard, `will-navigate` and the window-open
  handler deny everything, `open-external` is `http(s)`-only), but it is a hand-rolled regex
  pipeline across three files and three `dangerouslySetInnerHTML` sites; one `<meta>` CSP is the
  control that makes a future slip inert. It touches HMR, inline styles and `boojy-att:`, so it
  is a job on its own. `javascript:` hrefs survive into the DOM and only the main process
  filters them: inert on desktop, and the web build's `window.open` fallback is not product.
- **The hook-dependency warnings are most of the lint gate's noise** (207
  `useExhaustiveDependencies` and about 46 small ones, 2026-10-05). Most name a ref's `.current`
  or a function from the frozen `EditorContext` (AGENTS.md gotcha 3), so adding them blindly
  would change behaviour. One audit: teach the rule the stable hooks, suppress each deliberate
  site with its reason, fix the real ones. `noAssignInExpressions` and `noNonNullAssertion` are
  off by decision. Actions are pinned by tag, not SHA. No unit coverage on
  `useTableInteractions`, `useSidebarDrag`, `FindBar`, `SidebarContext`, the watcher's handlers
  or `folderOps`; the Electron suite covers those journeys.
- **Chrome ink, one pass if it is seen** (review §5): fourteen popovers carry hardcoded black
  shadows at 0.4–0.5 where `theme.modalShadow` is 0.12/0.08 in Light; the code block's
  context-menu hover is white at 6% over a white surface, invisible in Light; the find
  highlight colours are hardcoded amber in `main.jsx`; `CalloutBlock` imports eleven icons
  straight from `lucide-react` at 15 and 17px, stroke 1.8, off both tiers; no font token
  (`Inter` is named first and never shipped, so every geometry judgement in the rules was made
  in SF Pro), four mono stacks, no `tabular-nums` where counts change width.
- **Block IDs are minted on every re-parse** — `markdownToBlocks` uses a module-global counter,
  so a re-sync remounts every block and loses the caret; part of Public Beta's outside-edit
  requirement.
- **Updater behaviour** — `autoDownload` is on and every launch checks. A failed check reaches
  Settings → Updates ("Couldn't check for updates", Try again; `settingsManager.js:136`,
  `UpdatesTab.tsx`) and nowhere else; the promise's own `catch(() => {})` is harmless.
- **Editor hook copies, for a quiet window with the Electron suite green**: the "text before and
  after the caret" split helper exists six times and the block-update boilerplate about
  eighteen times across the editor hooks (~150 lines on hot paths). Mechanical, but not during
  Beta bug-fixing.
- **Two dependencies to try removing locally first**: `vite-plugin-electron-renderer`, whose job
  is Node shimming in a `nodeIntegration` renderer this app does not have, and the `accentColor`
  prop threaded through 18 files when it is always `theme.ACCENT.primary` (worth it only if a
  second accent ever appears).
- **Small residue, tidy when touching the file**: `z-index: 999`/`9999` literals in
  `GlobalStyles.jsx` beside the `Z` scale; the `index.html` viewport meta is PWA residue; a bad `%` in a
  `boojy-att://` URL throws in `decodeURIComponent`; the UI rule's known colour leaks (plain
  black alphas, per-theme callout and syntax colours), Dark's first-paint flash, and the
  consume-once `textOnlyEdit` flags in `useHistory`, which have no margin against a second
  reader (a spurious recompute costs a repaint, never a keystroke).

## Future, after 1.0

Recorded so a preference survives; nothing here is scheduled, and nothing here is an
instruction to start. Each line carries the direction taken and what is still open. The dated
research behind these (checked 2026-09-06, with links and cost tables) is the archived
discussion record in `docs/private/archive/` (gitignored; on Tyr's machine only).

### Migration and portability

- **Notion import**, the first migration priority. Notion exports Markdown and CSV in a ZIP.
  Proposed flow: pick the ZIP, preview, choose a destination, review a report counting notes
  and attachments and listing what was skipped or simplified. Must handle page hierarchy,
  duplicate titles, the 32-character ids in names, attachments (percent-encoded, page-relative)
  and internal links; databases need an explicit policy (simple tables, or folders of notes
  with an index, keeping the CSV). Sources stay untouched. No live databases, relations or
  Notion layouts, ever. Builds on Public Beta's attachment and `.md` link resolution. Next
  step: gather real exports now and prove the conversion as a script over them before any UI.
- **Word import**: a `.docx` arrives as a note that looks right. A converter to semantic HTML
  (mammoth is the candidate) feeding the rich paste reader (`utils/richPaste.ts`), pictures
  saved into `attachments/` (the reader drops `IMG`). Entry point unchosen. PowerPoint is not
  imported.
- **Apple Notes.** Wanted (2026-09-30), sized after Word and Notion: with no bulk export, an
  importer reads Apple's own database. The Mac exports Markdown per note (File → Export as → Markdown); dropped
  into the vault, that works today, and bulk export is the gap. A later Mac importer could
  follow the route Obsidian's Importer proves (images, scans, PDFs, note links; locked notes
  unlocked first): evidence of feasibility, not a decision to reuse it. Good formatted paste
  helps with a few notes. Attachments, dates and formatting need tested policies.
- **Word export**, after PDF (2026-09-30): the `docx`
  library handles headings, lists, tables and pictures, but "looks right in Word" is a long
  tail, so it waits for a real document to judge it against.
- **A web clipper**, "save to Boojy Notes" from a page, through the `boojy-notes://` link
  (Candidates). Meanwhile Obsidian's clipper can save into the same vault. What it keeps is undecided: the link and the selected text, or the whole
  article as Markdown with its pictures.
- **Copy as Markdown and as formatted text.** Selection behaviour shipped on 2026-09-16: a
  whole-block copy carries the blocks' Markdown as plain text and their structure as block
  HTML, an ordinary selection its visible text and inline formatting (editor rule, "Paste keeps
  the block you are in"); Copy Note (the whole file) shipped in v0.10.0. Still open: attachments
  (an image or file copies as its `![[…]]` reference, never the file), and whether a "Copy as"
  control earns a place at all.

### Editor and organisation

- **Someday (Tyr, 2026-09-30), each as Obsidian does it:** footnotes drawn; unlinked mentions
  under the backlinks; a linked note previewed on hover; moving a selection into a new note,
  leaving a link; emoji by `:name:`; smart quotes and arrows (never in code); a plain editor for
  the frontmatter block (Obsidian's Properties); the Mac Share menu, through the
  `boojy-notes://` link.
- **Folder colours and icons** (2026-09-30: about 25 icons and 8 colours). Colour the folder
  glyph, keep the label and row neutral; Light and Dark variants; selection never colour-only;
  a reset to the default. Catalogue undecided (a first set from Lucide is one option). Kept in
  the vault file favourites use; never renames a directory or adds emoji to its name. Not
  approved: per-note icons, and text or background colour inside notes (no portable Markdown).
- **Open a note in a new window**: only if the in-place viewer with Back and Forward is not
  enough (2026-09-30). Still one note per window, never tabs.
- **Block targets in links** (`[[Note#^block]]`): opening works; the jump follows the heading
  jump (Public Beta). A folder-path link to a missing note creates nothing.
- **Richer nested quotes and list contents.** Consider nested quote depth and Markdown elements
  inside quotes or list items. Basic list indentation is separate. Source preservation and
  editing across those structures need a design before broader support is selected.
- **Subscript and superscript**: not needed (2026-09-30). If ever, as Obsidian: `<sub>` and
  `<sup>` drawn, no syntax of our own.
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
- **Text colour and fonts**: not now; maybe later (2026-09-30), fonts at most three.
- **Private notes**: maybe near 1.0, maybe never (2026-09-30).

### Platforms, sync and accounts

- **Sync: Dropbox, the first provider** (decided 2026-10-15). Desktop never talks to Dropbox:
  the vault sits in `Dropbox/Apps/Boojy Notes/<vault>/` and Dropbox's own app syncs it
  (app-folder permission only). The phone connects directly with Boojy's sync engine
  (`src/sync`: local, Dropbox and the last-synced record compared; a clash keeps both, an edit
  beats a delete, the phone never deletes a folder). In Tyr's daily use since 2026-10-17. A
  second provider is a 1.0 decision (Open decisions). Found live: Dropbox's Mac app can stop
  syncing while saying it is up to date, so Boojy may need to notice a synced vault gone quiet.
- **Sync on the web** (Dropbox or the second route through an https sign-in): separately
  scoped, not part of 1.0. The engine is browser-capable as written (plain `fetch`,
  `crypto.subtle`); only `src/phone/phoneSync.ts` is Capacitor-bound. Until the web app, the
  dev build's one `localStorage` blob (`useAppPersistence.js`) stays: it lets `pnpm dev:web`
  survive a reload.
- **The phone, the rest.** Mobile shell: Capacitor (#353), because the editor keeps the
  browser DOM. The layout is two screens, Home and the note, with a bar above the keyboard
  (`ui-chrome-and-theme.md`). Next, only once missed: a select mode (long-press → Select, then
  Move to… or Delete); `attachments` as a folder on Home; a long-press on a row selecting its
  text; Search's Recent (reported empty, unverified); Gboard's floating keyboard hiding the bar
  (the bar reads the window shrinking, `PhoneKeyBar.tsx`); PDFs and files in the note's place;
  version history. Test layout in a phone-sized Chromium and the keyboard on the real phone; an
  emulator's typed input skips the keyboard's composition. Tablets: no ink or sketching;
  handwriting comes from iPadOS Scribble (verify in the shell). The earlier mobile specs are
  archived in `docs/private/archive/` as reference, not plan.
- **Accounts: email-only** when accounts are needed (codes or links; session length open).
  Local desktop use never requires one.
- **Encryption: none in Dropbox, end-to-end in Boojy Cloud** (2026-10-15). In Dropbox, notes
  stay readable Markdown with no toggle, and the app says plainly that Dropbox can read them.
  Boojy Cloud encrypts contents and file names from its first version (suite `VISION.md` §7);
  local-first softens its worst cost, since a lost key loses the cloud copy, not the notes on
  the desktop. **Private or encrypted notes in a local
  vault: not now** (2026-09-24). An encrypted file is no longer an ordinary file anyone can open,
  search cannot read it, and Obsidian cannot either; FileVault already covers a lost laptop.
  Revisit with Boojy Cloud.
- **Free hosting.** When a quota is reached: local writing continues, nothing is deleted, the
  app distinguishes saved locally from synced. Still needed: account management, abuse
  controls, history accounting, a sustainable hosting budget. The September 2026 research
  (archived) found object storage cheap enough that a small free tier is plausible on stated
  assumptions; measure a prototype before setting any limit. Running cost well under $1,000 a
  month is a hard requirement (Direction); attachments and history are what grow, so they are
  what the quota counts.
- **Share a read-only link** (Someday, 2026-09-30; publishing a note as a web page is the same
  feature). A friend opens one note in a browser, without editing. Needs Boojy Cloud, and the
  page lives only as long as the service.
- **Deletion in the cloud.** A recoverable deleted state that needs no desktop Trash, plus a
  record of deletions so offline devices cannot resurrect notes.

## Not doing

No AI features or agents; no calendar, Inbox, daily notes or templates (reconsidered only if
duplicating notes by hand becomes a daily chore); no tabs or split view; no separate
quick-note workflow; no command palette (the menu bar and shortcuts are the keyboard path); no
fuzzy matching in Search. The spec excludes layouts and blocks that cannot round-trip to
readable Markdown.

Also declined: **graph view, permanently**; Canvas, slides, reading mode, focus mode;
**collaboration** (it would make the cloud the default and multiply running costs; a read-only
link is the part that survives); databases, properties views, bases, saved searches and smart
folders (folders, tags and search are the whole model); an outline or heading picker (until
notes run long); a vim mode; a git interface (a vault kept in git keeps git); more block types
for now; folding headings, toggle blocks and columns (no Markdown form); sketching, audio
recording, transcription and scanning (a Markdown editor, not a drawing or recording app); date
groups in the list; merging notes; replacing across every note (one wrong pattern damages them
all); link preview cards (a YouTube card may return); inserting today's date; text search in
pictures; custom CSS and plugins; per-note icons; Collapse all folders.
