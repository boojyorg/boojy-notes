# Changelog

## v0.6.1 — 2026-09-05

### Improvements
- **New application icon** — The macOS app icon is now the Notes mark on a light rounded square, replacing the placeholder gold circle on a dark tile. It is sized to Apple's icon grid (the rounded square at 824px on the 1024px canvas, corners transparent), so it sits in the Dock at the same size as every other app. The build input is `assets/boojy-notes-app-icon.png`, generated from the full-bleed source export beside it.
- **Dependency and security maintenance** — Electron 42.4.0 to 42.11.2 (the Chromium fixes of seven patch releases), Vite 6.4.3, and the patched in-range versions of every transitive dependency with an open advisory, including the YAML parser the auto-updater ships. The full open Dependabot set was cleared and `pnpm audit` reports nothing in either mode. No product or code changes.

### Bug Fixes
- **Dividers can be selected and deleted, and mean "divider" on disk** — A divider was a block nothing owned: you could type `---` to make one but not click it, land on it with the arrow keys or delete it, and Backspace from the paragraph below stepped over it and merged your text into the paragraph above. Now a click selects it (a soft accent band appears around the rule), Backspace or Delete removes it, Enter opens a paragraph under it, and the arrow keys stop on it on the way past. Backspace at the start of the paragraph below selects the divider first and a second Backspace removes it, so nothing merges across a line you can still see. Images follow the same grammar. The gutter grip can now lift a divider too. Underneath, a divider typed straight after a paragraph was written with no blank line before it, which every other Markdown reader takes for a heading underline: Obsidian showed a heading and no divider at all. The blank line is now written, and read back as structure rather than as an empty row, so an Obsidian-authored divider no longer opens with a stray empty row above it.
- **Desktop: the caret no longer jumps to the top of the note mid-typing, and no keystrokes are lost when it did** — After every save, macOS reported the file changed a second time one and a half to nearly three seconds later, once its metadata settled, which was outside the window in which Boojy Notes ignores the echo of its own writes. The app took that for an outside edit and rebuilt the note from disk: the caret went to the first block for a moment and whatever was typed since the save vanished. A save now also remembers the exact bytes it wrote, so a change event whose file still holds those bytes is recognised as ours however late it arrives. Traced live on the daily driver; a run of the same typing after the fix showed every late event recognised and ignored.
- **Diagnostic trace** — Start the app with `BOOJY_TRACE=/path/to/log` and both processes append one timestamped line per watcher event, save, external reload, keystroke target, caret move between blocks and block repaint, on one clock. It is a no-op otherwise. This is how the caret jump was finally caught.
- **Desktop: the traffic lights no longer sit on the wordmark, and Cmd+Plus/Minus/0 scale the app** — The View menu's built-in Zoom In / Zoom Out / Actual Size took those shortcuts before Boojy Notes saw them, so its own UI scale never changed and Chromium zoomed the page instead, remembered per site and never moving the native window controls. That page zoom is what made a development window look larger than the installed app, and the traffic-light and wordmark spacing had been judged in one, so at true size on macOS 26 the third light overlapped the wordmark and the lights rode low. The menu zoom is gone, any remembered page zoom is reset on launch, and the lights and wordmark are re-aligned at 100%.

### Removed
- **Theme picker reads Light / Dark / System** — The third option was "Auto", which opened a second row to choose between following the system and a time-of-day schedule with two hour pickers. The schedule is gone; System follows the OS appearance and the picker is one row of three. A saved schedule preference silently becomes System.
- **The star field** — Dark mode drew a seeded field of stars behind an empty note and faded it out as you typed. It, its per-theme flag and the "does this note have content yet" plumbing in the editor are gone; the editor ground is now the theme colour alone in both modes.
- **Onboarding hints** — The three one-line tips that appeared above a new note ("Type / for commands", "Try [[ to link notes", "Use #tags to organise") are gone. The empty paragraph's own placeholder already says to type `/`, and the rest is the kind of thing a first note teaches by itself.
- **The font-size preference** — Settings had a Font size row (10 to 24) that resized body text only, beside the keyboard UI scale (Cmd+Plus / Cmd+Minus / Cmd+0) that resizes everything. One size control is enough, so the row is gone and body text is 15px before scaling. A saved font size is no longer read.
- **Two items from the vault ··· menu** — "Collapse all folders" is gone: folders toggle on click and stay as you left them across launches, so a bulk close was rarely worth a menu row. "Change vault folder…" is gone from the menu too; it lives in Settings → Storage only, next to the path it changes, so there is one place to look for it. The menu is now New folder, Sort by, and Reveal in Finder.
- **Import** — The File menu's Import submenu (Markdown Files, HTML Files, Folder) and the folder menu's "Import files here" are gone, along with the HTML-to-Markdown converter and its `turndown` dependency. Since a folder in the sidebar is a directory on disk, copying files into the vault in Finder or Explorer does the same job and the app picks them up as they land. HTML conversion was the one thing that had no other route; a Markdown editor is not the place for it.
- **The backlinks panel** — The "Linked from" list under a note, and the index behind it, are gone for now. Wikilinks themselves are unchanged: `[[` still autocompletes, clicking still opens or creates the note, and search finds every mention. The panel can return if daily use shows it earns its place; its one known bug (same-title notes were invisible to it) leaves with it.
- **Web app residue** — The service worker, the web-app manifest and the home-screen icon tags are gone from the web build. The web build is a development and test surface for the desktop app, not an installable app; the manifest pointed at an icon that no longer existed and the theme colour was an old dark value.

## v0.6.0 — 2026-09-05

### Bug Fixes
- **Changing the notes folder no longer keeps the old vault's folders** — Switching to another vault in Settings merged its folders into the previous vault's list, so phantom folders lingered until a restart. The new vault's directories now replace them.
- **Paragraphs are paragraphs: blocks now follow Markdown structure, not source lines** — A block used to be one line of the file. Two paragraphs typed with Enter were written as two adjacent lines, which every other Markdown reader (Obsidian in reading view, GitHub, Pandoc) joins into one paragraph; and a paragraph written over two lines in another app opened as two blocks. Now adjacent lines of one paragraph are one block with a soft break between them, Enter starts a new paragraph and writes the conventional blank line, Shift+Enter keeps you in the same paragraph, and a plain line directly under a list item belongs to the item, as it does everywhere else. One blank line between paragraphs is spacing rather than a row; every further blank line is still an empty row you can see and delete. Nothing is stored that the file does not say, no file is rewritten by opening it, and editing one block leaves the rest of the file byte for byte as it was, including blank-line runs, list markers, quote lines, hard breaks and the final newline; proven by the byte-sensitive preservation corpus and a read-only pass over two real vaults with no unexpected change. Pasting plain lines now keeps them together as one paragraph; a blank line in the clipboard still starts a new block. One narrow gap stays on record: a paragraph typed directly after a quote is written on the next line, which other readers fold into the quote, because a quote's lazy lines cannot be stored inside the block without changing their bytes on save.
- **Shift+Enter is a line break inside the paragraph, and it stays one** — A line break inside a paragraph reached the file correctly as a plain newline, but the editor never drew it again after a repaint: switch notes and come back, or undo, and "one⏎two" read "one two" on screen while the file still said two lines. Newlines inside a block now render as visible line breaks (a trailing one keeps its empty line reachable), Shift+Enter inserts one on purpose in paragraphs, list items and quotes, and the caret counts a break as one character so typing after it lands where it shows. In a heading Shift+Enter acts as Enter, because a heading has no second line. This is the foundation for the paragraph model that follows; the file format is unchanged.
- **Deleting a folder or several notes asks first, and says what will happen** — On desktop, "Delete folder" and "Delete N notes" acted at once with no confirmation. Both now ask, in words that describe the real action: `Move 12 notes to the Trash?`, with a note that the folder on disk and any file in it that is not a note stay exactly as they are. Nothing else changes: a single note still goes to the system Trash immediately, now with a quiet "moved to the Trash" toast; a folder with no notes is removed from the sidebar without a prompt because nothing on disk changes; the web build still confirms every deletion because there it is permanent. Proven in the real-Electron suite with a folder holding a note and an unrelated `budget.txt`: after confirming, the note is gone from the vault and the text file and the folder remain.
- **Typing after a completed `[[wikilink]]` is prose again, and link tooltips behave** — Picking a note from the link suggestions put the caret inside the rendered link, so the next keystrokes became part of it and the file read `[[Beta|Beta after]]`. The caret is now parked just outside a link (at the end of a block or before following text) on an invisible anchor that never reaches Markdown; bold and italic still extend as before. Separately, every hover over a link raised an error and left its half-second timer untracked, so the tooltip could appear after the pointer had already gone. Hovering is quiet now, moving off before the delay shows nothing, and resting on a link still shows its target. Both are proven in the real-Electron suite, the first by the Markdown on disk.
- **A note's title is its filename, and you see the real one straight away** — Moving a note into a folder that already held a namesake gave the file a `-2` suffix on disk while both rows still read the same name, and every later save of that note bounced its file between `-2` and `-3` because the uniqueness check counted the note's own file as a collision. Renaming to a name a filename cannot hold (`Notes: a/b?`) showed that name until a restart revealed `Notes_ a_b_`. Now the save reports the name the file actually got — suffix, replaced characters, trimmed edges, `Untitled` for a blank name — and the sidebar row and the editor's title adopt it at once, keeping the caret if you are still in the field; a restart never reveals a title you had not already seen. Three more naming faults fixed on the same path: clearing the title used to name the file `_.md`; renaming a note to the same name in a different letter case deleted its file on macOS; and a file that appeared on disk without the app noticing could be written over. Proven by a new real-Electron journey covering move, repeated saves, rename, restart and leftover temp files.
- **"Most recent" now means most recently modified, and opening a note never moves it** — Clicking a note used to promote it to the top of the list at once, so the rows reshuffled under the pointer; a double-click rename then renamed the row that had moved into the clicked position, and the wrong file was renamed on disk. Order now comes from the file's modification time, with edits made in Boojy Notes counted the moment they happen and edits made in other apps picked up live. Opening, selecting and reading are side-effect-free, and the order is the same after a restart. The last-opened timestamps kept in `localStorage` are no longer read or written.
- **Quitting or switching apps no longer rewrites notes you had already saved** — Every note touched during a session was written again on quit and on every window blur, whether or not it had changed since its last save. Each got a fresh modification time in write order, so "Most recent" came back in a different order after a restart and anything watching the folder saw phantom edits. A note now leaves the quit-flush set as soon as its newest content is safely on disk; a failed write keeps it there and is retried, and a flush cancels the pending debounced write so it cannot fire behind it. Text typed in the last third of a second before Cmd+Q is still saved.
- **Undo now changes what you see** — Cmd+Z after plain typing reverted the file on disk but left the old text on screen, so undo looked broken and, until the next keystroke wrote the stale screen back over the file, the page and the file disagreed. An undo within a third of a second of typing was also cancelled out when the pending text commit fired. Undo and redo now repaint immediately and cancel that commit. This is the first fix proven by a new real-Electron core-journey suite (`pnpm test:electron`) that runs the built desktop app against a throwaway vault and checks that the editor and the Markdown on disk describe the same note.
- **Desktop: caret no longer jumps to the top of the note, and keystrokes are no longer lost, mid-typing** — Every save Boojy made was echoed back by the file watcher, and the "ignore my own write" window was a separate timer per save on one shared list, so two saves landing 1.15–1.5s apart (a normal pause-type-pause rhythm) let the second echo through. Boojy then treated its own file as an external edit, rebuilt the note from disk, dropped the caret at the start of the first block and discarded anything typed since that save. The window is now one timer per file, reset by each write.
- **Pasting into a checkbox no longer turns it into a paragraph** — Pasting text that carried a line break into an empty checkbox, or at the start of one, replaced the checkbox (and any bullet, numbered item or heading) with plain paragraphs. Copying a whole line from most apps brings its line break along, so this looked random. A block now keeps its type, checked state and indent when plain text is pasted into it; only pasting Markdown with structure of its own, such as `## Heading` or `- [ ] task`, into an *empty* block adopts that structure, and pasting structure into a block that already has text puts the new blocks beside it rather than changing it. One trailing line break on the clipboard is treated as incidental and pastes inline; a deliberately copied blank line still comes through. Two related fixes ride along: a paste that only changed a block's text could reach the file but never the page (the next keystroke then wrote the empty line back over it), and copying the text inside a single list item no longer carries the list with it, so pasting it onto a blank line gives just the text. Structure still travels when the copy spans two or more blocks.
- **Hold-and-drag block reorder works on every note, not just the one open at launch** — The pointer handler that starts a drag reaches the editor through a context whose value is fixed when the app mounts, and it looked the pressed block up in whichever note was active at that moment. On any note opened later the lookup found nothing and the hold silently did nothing (the "Hold and drag to reorder" tip never appeared either). It now resolves the current note at press time. Keyboard reordering (`Cmd/Ctrl+Shift+↑/↓`) was unaffected.
- **Cancelling a block drag can no longer write the dragged blocks into a different note** — Escape and window-blur cancel a hold-and-drag through listeners registered once at startup, and the cancel routine restored the original block order into whichever note was active when that listener was captured — potentially not the note being dragged, if Settings had been opened in between. The drag now records the note it started in and every write it makes (live reorder, cancel-restore) targets that note; a note deleted mid-drag is left alone rather than recreated. The same stale capture made Cmd+P un-collapse the sidebar instead of revealing it once the window had narrowed into overlay mode; the shortcut handler now reads its actions fresh on every keystroke.
- **Clicking a `#tag` in the editor filters the sidebar again** — The click handler existed but stopped being passed to the editor when the pane layer was removed on 2026-08-18, so tags rendered as clickable and did nothing. Clicking one now opens sidebar search on that tag, as it did before.
- **Desktop: picking an attachment over 100 MB shows the size warning instead of failing silently** — The guard used a CommonJS `require` inside the ES-module main process, so hitting the limit threw a `ReferenceError` in the background and the picker just returned nothing. It now uses the already-imported dialog.
- **Web no longer shows an "Import files here" folder action that did nothing** — Import is a desktop file-picker flow; the menu item now appears only in the desktop app.
- **The crash screen's "your notes have been backed up" is true again** — The error boundary writes the in-memory note store to `boojy-error-backup` in local storage on a crash, but it was mounted without the reference it needed, so the backup never ran while the message still claimed it had. It is wired up now.
- **Onboarding no longer promises "Swipe right for notes"** — There is no swipe gesture in the responsive layout (only the bottom sheet dismisses by swipe), so the mobile hint described something the app cannot do. The sequence is now the three hints that are true everywhere: slash commands, wikilinks, tags.
- **Editor font size is remembered** — The Settings → Appearance size control worked, but the value lived only in memory and came back as 15 on every launch. It now persists alongside the other appearance preferences.
- **Onboarding no longer advertises the removed split view** — The progressive hint sequence no
  longer tells established desktop users to press the retired split-view shortcut.
- **Crash fallbacks use the active theme correctly** — Error boundaries now receive valid
  background and error-colour tokens instead of references to theme roles that do not exist.
- **Auto-update can be toggled from the keyboard** — The desktop Settings control is now a real
  accessible switch with a stable hit box and announced checked state.
- **Settings close button has a meaningful accessible name** — The existing `×` control is
  unchanged visually, but screen readers and voice control can now identify it as “Close settings.”
- **Sort-menu focus no longer gets lost** — Escape now closes the note-order menu and returns
  focus to its trigger. Tab closes it without cancelling the browser's normal focus movement,
  instead of leaving keyboard focus stranded on the document body.
- **Failed disk saves keep retrying** — If Electron cannot write a note, Boojy now keeps that note
  in its dirty set and retries every five seconds until the write succeeds. The first failure is
  reported without repeating the same notification on every retry; closing the app still uses the
  existing final flush path.
- **Slash commands reliably start at Heading 1** — Opening `/` no longer lets a stationary pointer accidentally select whichever lower menu row appears beneath it. Keyboard selection starts at the first command and changes only after an arrow key or real pointer movement.
- **Checkboxes update immediately** — Checking or unchecking a task now repaints its tick and strikethrough at once instead of waiting for Enter or another structural editor change.
- **Menus can no longer run off-screen** — The note-actions ··· menu used to open past the right edge of the window, and a slash menu near the bottom ran below it. All context/slash menus now share one placement rule: follow the anchor, keep an 8px margin from every edge, flip to the other side of the anchor when needed, and clamp as a last resort.
- **Equally relevant search results now fall back to the most recent** — Search has always intended to break ties by which note changed most recently, but the modified time it compared was never actually recorded, so every note looked equally old and ties fell back to whatever order the notes happened to load in. Boojy now reads each file's modified time, so tied results come out newest first.

### Improvements
- **Search is a palette** — Press Cmd+K (or Cmd+P, or the Search glyph beside the sidebar toggle, or click a #tag) and a search field opens over the window, results beneath it. Title hits show the match highlighted; a hit inside a note shows one line of context under its title; every result names its folder on the right. Arrows move, Enter opens the note and jumps to the match, Escape closes. Nothing shows before you type, and a `#` offers your tags. The sidebar no longer holds a search field or inline results on desktop, so its top reads wordmark, then vault, then notes.
- **One vault, one tree** — The sidebar's `Folders` and `Notes` sections are gone. A quiet header carries the name of your vault folder, and under it is one list: folders first, alphabetical, then your loose notes in the sort order you chose, exactly as inside a folder. A hairline drops from each open folder through its contents, so a deep tree reads at a glance and loose notes no longer look like they belong to the folder above them. New note now sits above the editor beside the note's ··· (Apple Notes style, and still there with the sidebar hidden; Cmd+N is unchanged); Search is a glyph beside the panel toggle and drops the search field in only while you use it. Hovering the vault's name reveals New folder and a ··· menu holding New folder, Sort by with the current mode marked, Collapse all folders, Reveal in Finder and Change vault folder. Dragging a note or folder onto the vault's name, or into the empty space under the tree, moves it to the root. Rows are a touch tighter and the whole window's top row sits three pixels higher.
- **Folders are directories** — A folder in the sidebar used to be "wherever a note is": a folder with no notes existed only in memory and vanished on restart, a folder that held only PDFs or images never showed, there was no way to make a folder inside a folder or to move one, and renaming a folder moved its notes one file at a time and left everything else behind in the old directory. Now a folder is the directory on disk, the way Finder and Obsidian treat it. Every subfolder shows, empty or not (hidden `.obsidian`-style folders and `attachments` stay out of the way); New folder makes the directory at once and it is still there after a restart; a folder's menu has New folder inside and Reveal in Finder; renaming or dragging a folder is one directory rename that carries notes, subfolders and other files together, keeps the open note open, and rewrites nothing (no note's modified time changes); a folder can be dragged into another folder or back out to the root, never into itself. A name a directory cannot hold is corrected the moment you confirm it, the same rule a note's title follows. Deleting a folder still sends only its notes to the Trash; the directory then goes only if nothing else is left in it, and a folder that keeps other files stays with a quiet note saying so. A folder made or removed in Finder appears or disappears on its own. Proven in the real-Electron suite: create and restart, rename with a PDF alongside, drag to nest and back, external folder changes, and deletion with and without leftover files. One known edge: an undo of an earlier edit follows the new path, but the folder rename itself is not undoable.
- **Paragraph spacing that shows what you did** — With Enter making a paragraph and Shift+Enter a line break, the two used to look almost the same: a paragraph break added only a sliver over a line break. A paragraph break now adds a modest, even gap; a line break inside a paragraph is visibly tighter; and an empty row (Enter twice) adds a whole line on top, so the three read as three without notes turning airy. A paragraph after a list or a quote gets the same gap, where it used to sit on the list's last row. Headings, lists, checklists, code and callouts keep their rhythm. Same in Light and Dark.

- **Move a block by its handle, not by holding the text** — Hover any block and a small grip
  appears in the left margin; drag it to move the block. Text is now only ever for writing and
  selecting, so pausing before you drag to select a sentence can no longer pick the whole block
  up instead. Nothing shows until you hover, nothing is added beside the grip, and
  `Cmd/Ctrl+Shift+↑/↓` still moves blocks from the keyboard.
- **Dragging a block no longer shuffles the note under your pointer** — While you drag, the note
  stays exactly as it is: a faint copy of the block follows your hand and a thin teal line shows
  where it will land. Let go and it moves there, in one step; let go where it started, press
  Escape, or release over the sidebar and nothing changes. The line always sits between blocks —
  when the drop would put the block back where it is, the line rests just above it rather than
  cutting through the text. The grip's six dots are now solid and the grip no longer gains a
  grey box when hovered, so the margin keeps reading as part of the page.
- **Calmer note dragging in the sidebar** — The lifted note is a plain pill with just its title,
  it rises in rather than popping, and letting go anywhere that isn't a folder (or the Notes area)
  flies it back to where it came from. Dropping a note over the editor no longer opens it; a
  click does that.
- **Quieter, easier-to-grab editor chrome** — Scrollbars now keep a generous pointer target while
  drawing a slim neutral thumb with reliable hover and held states in Chromium and Firefox. The
  sidebar resize edge uses the same neutral interaction language instead of a permanent divider,
  and its first-run width is slightly more comfortable without reducing the editor's responsive
  floor.
- **Tables start as a blank canvas** — The `/table` command now inserts the smallest useful blank
  2×2 table instead of a labelled 3×2 template, and header cells use weight rather than a permanent
  background fill. Rows and columns remain easy to add from the table edges.
- **Desktop deletion uses the system Trash** — Deleting a Boojy-managed Markdown note now sends that file to the macOS Trash or Windows Recycle Bin. Folder deletion still acts only on Boojy-managed Markdown files and never trashes the containing folder or unsupported sibling files. Existing private `.trash` notes are copied to readable, collision-safe names in the OS Trash before their legacy source is removed; ambiguous or failed items remain untouched and are reported.
- **Light is the first-run theme** — Light is now the default only when no theme preference exists. Saved Light, Dark and Auto choices continue unchanged.
- **Settings is one small pane** — The navigation sidebar, the Profile/sign-in section, the Editor section (spell check and language) and the UI Scale row are gone, along with the large in-settings logo. What remains: Appearance (theme, font size), plus Storage and Updates on desktop, closed by a quiet version line. Spell check stays on by default (the stored desktop preference still applies); UI scale lives on as the Cmd+Plus / Cmd+Minus / Cmd+0 shortcuts. The web sign-in nudges are gone with the rest of the cloud pitch — no cloud UI ships until the local-first app is stable.
- **Calmer folder rows** — The permanent `>` disclosure chevrons are gone from the sidebar; the whole folder row toggles open/closed and the folder icon carries the state. Screen readers still hear expanded/collapsed.
- **New "Notes" logo** — The wordmark is a single new "Notes" mark. The small status dot that used to sit between the letters — which doubled as the live sync indicator and the settings button — has been removed; with desktop now local-only by default it was near-permanently idle.
- **Sort your notes by recency or name** — A small control on the sidebar's `Notes` heading switches every note list — loose notes and folder contents alike — between **Most recent** and **Alphabetical**. Most recent means the last time you touched a note, whether you opened it here or its file changed on disk, so a vault Boojy has never seen before is in a useful order the moment you point it at one, and an edit you made in another app counts. Alphabetical is natural order, so `Week 2` comes before `Week 10`. The rule across the sidebar is now simply: dragging changes where a note lives, sorting changes how the list is shown. Folders are always alphabetical.

### Removed
- **Hold-to-drag block reorder** — Pressing and holding a block's text for 400ms no longer starts
  a drag, and the one-time "Hold and drag to reorder" tip is gone with it. The gutter handle
  above replaces both.
- **Cloud sync and sign-in** — Boojy is fully local for now. The dormant Supabase auth/client,
  R2-backed Edge Functions, realtime and cross-tab sync engine, conflict/first-sync UI, backend
  migrations, tests, environment template and `@supabase/supabase-js` dependency have been
  deleted rather than carried as inactive product weight. Git retains the implementation if the
  product direction changes later; desktop Markdown files and web browser storage are unchanged.
- **Tabs and split view — one note at a time** — Opening a note now replaces the current one; there is no tab strip and no `Cmd+Shift+\` split. The whole pane/tab layer was deleted, not hidden: navigation state is a single active note, which is what makes the calmer chrome elsewhere in this release possible. Your last-open note is remembered across restarts, and old saved layouts migrate cleanly (if you had a split open, you land on the note from its active pane). Cmd-clicking a wikilink now simply opens that note. Quick Open and back/forward history are the planned follow-ups for fast switching.
- **PDF and DOCX export** — Boojy Notes is a Markdown editor, so the dedicated document exporters, Electron menu commands, broken web menu entries and the `docx` dependency have been removed. Git retains the implementation if this non-core feature is reconsidered later; Markdown and folder import are unchanged.
- **Recently Deleted and the app-level wordmark menu** — The private in-vault `.trash`, restore/purge UI and `Recently Deleted` surfaces are gone. Clicking the Notes wordmark now opens Settings directly; the separate About destination is gone because version and credit already live quietly inside Settings.
- **Manual ordering, and folder dragging** — Notes and folders can no longer be dragged into a hand-arranged order. There were two competing ideas of "order" — a manual one saved to disk, and the new sort preference — and one had to go. Dragging a note still moves its file into a folder, because that is a real change to where the note lives. Folder rows are no longer draggable at all: dropping a folder onto another folder used to highlight the target, expand it, and then silently do nothing, so the affordance was promising something the app could not do. Genuine folder nesting can be built later as its own feature. Your existing `.boojy-meta.json` files are left untouched on disk — nothing reads or writes the ordering keys any more, so an old arrangement stays recoverable.

### Internal
- **Settled design experiments are now ordinary product styling** — The development-only visual
  control panel, its keyboard shortcut, colour helpers and mutable layout-style context have been
  removed. Theme colours now come directly from the active theme, while the approved sidebar
  scrim, mobile selection and mobile top-bar treatments are fixed at their chosen values.
- **Retired-feature residue has been pruned** — The unused secure credential IPC left by sign-in,
  cloud-era metadata/frontmatter helpers, sync and tab animation CSS, split/Finder theme roles,
  obsolete z-index layers and an unreferenced input-style module are gone. The legacy split-state
  read migration remains intentionally intact for existing installs.

## v0.5.0 — 2026-06-12

### Bug Fixes
- **Note titles show immediately after launch** — Reopening the app restored your last note with a blank title until you switched away and back. The restored session rendered before the notes finished loading from disk, and the title field never re-synced when they arrived; the disk load now signals the editor to re-sync, in both single-pane and split view.
- **Opening a folder of notes no longer leaves any trace in it** — The note ID index (`.boojy-index.json`) used to be written into the notes folder itself on every scan, so pointing the app at an Obsidian vault or any git-tracked folder dirtied it on first launch. The index now lives in the app's own data directory (one file per vault); an existing in-vault index is migrated over once and removed, and the index is only rewritten when it actually changes.
- **Split-pane editing can no longer lose keystrokes on quit** — Typing in one pane and then the other within the same fraction of a second, then quitting, used to flush only the second note's edits to disk. The quit/blur flush now tracks every note edited since the last flush and writes them all.
- **Saves now survive power loss, not just crashes** — The atomic write fsyncs the temp file before renaming it over the note (and best-effort fsyncs the directory), closing the window where a power cut just after a save could leave the note as zeroed bytes even though the rename had committed.
- **Turning sync off stops a sync that's already running** — A sync in flight when you flipped the toggle off used to run to completion, pushing and pulling notes after you'd asked it to stop. It now checks at every step and bails as soon as sync is disabled, without applying pulled notes to local state.
- **Opening notes never rewrites them on disk** — Files with YAML frontmatter (e.g. an Obsidian vault's `tags`/`aliases`/`created` properties) used to be silently rewritten the moment the app read them, stripping all frontmatter and re-serializing the body. Reading is now strictly read-only: third-party frontmatter survives untouched and shows as the collapsible frontmatter block; only true legacy Boojy files (Boojy-shaped `id:` in frontmatter) still migrate, and only when you next edit them. Guarded by new regression tests asserting files stay byte-identical after a read.
- **Saves are now crash-safe** — Notes (and the ID index / folder metadata) are written to a temp file and atomically renamed into place, so a crash or power loss mid-save can no longer truncate a note; you keep the previous version instead. Renaming a note now writes the new file *before* deleting the old one — a crash in between leaves a recoverable duplicate, never a missing note.
- **Imported markdown survives saving unchanged** — Three round-trip fixes for files written by other tools: code blocks containing a lone ```` line are no longer corrupted on save (the fence now grows past the longest backtick run in the content); numbered lists keep their actual numbers instead of all collapsing to `1.`; and standard `![alt](url)` images keep their syntax and alt text instead of being rewritten to `![[url]]` wikilinks (a custom width uses the Obsidian-style `![alt|350](url)` suffix). All three are locked in by new round-trip guardrail fixtures.
- **Quitting no longer loses your last keystrokes** — Typed text sits in two short debounces before reaching disk, and the app used to quit without waiting, silently dropping anything typed in the last ~1 second. The window close (Cmd+W or quit) now waits for a flush of pending edits to disk — capped at 2 seconds so a hung renderer can never trap you in the app — and edits also flush whenever the window loses focus.
- **Desktop is local-only unless you opt in to sync** — Cloud sync on desktop is now off by default and controlled by a per-device "Sync on this device" toggle in Settings → Profile. Previously, a Supabase session silently restored from an earlier run would start a full sync 500ms after launch — and a stale cloud copy could overwrite newer local notes. Signing out now also clears leftover sync metadata (last-sync marker, version map, dirty queue), which used to skip the first-sync confirmation and re-push notes unprompted on the next sign-in.

### Features
- **Stars fade out as you write** — On the night theme, a blank note shows the starfield behind the editor; the moment you start typing it gently fades out (~1.75s), and fades back in if you empty the note again. It's tied to whether the note has *content*, not whether it's focused — so just clicking into an empty note keeps the stars, and a written note opened from the list shows none.
- **Move blocks with the keyboard** — `Cmd/Ctrl+Shift+↑` / `↓` now moves the current block up or down. This is the keyboard-accessible counterpart to the existing hold-and-drag reorder, and maps cleanly to reordering lines in the underlying markdown.

### Improvements
- **Indent is now list-only** — Tab/Shift-Tab indents bullets, numbered items, and checkboxes (markdown nested-list syntax). It no longer indents paragraphs or headings — that used to render an indent that was silently dropped on save, since markdown can't represent it. (See the new round-trip guarantee below.)

### Internal
- **Docs: corrected `FEATURE_TRACKER` export + mobile status** — Export was listed as a flat
  `✅ PDF, DOCX, Markdown`; it's actually **desktop-only** (web menu items no-op) with **no
  Markdown export**, now marked `🚧`. "Native mobile" was listed as both `⬜ planned` and Removed
  in the same file — resolved to Removed/stopped (Capacitor dropped v0.3.0; mobile = responsive
  web only). Dated the obsolete private `mobile-spec.md` / `app-review.md`.
- **Markdown is the source of truth (constraint + guardrail)** — Adopted a binding architectural rule (`docs/SPEC-markdown-source-of-truth.md`): a note *is* its markdown; blocks are only an in-memory rendering, and every block must round-trip block→markdown→block losslessly. Enforced by a new test (`tests/utils/markdown.test.js`) that fails CI if any block type can't round-trip — and documents the intrinsic markdown limitations (file byte-size, custom image alt) explicitly. No nesting / columns / JSON-blob blocks.
- **Refactor: BoojyNotes decomposition (cycle 1)** — Pulled three self-contained logic clusters out of the 1,675-line root component into dedicated, unit-tested hooks: `useSearchNavigation` (clear multi-select on search; scroll + highlight a matched block when a search result opens), `useTagHandlers` (sidebar tag-filter on click; token-replace + caret restore on autocomplete), and `useExportImport` (PDF/DOCX export, folder import, and the Electron File-menu listener). No behaviour change; `BoojyNotes.jsx` drops ~100 lines and each hook gains a test.
- **Refactor: BoojyNotes decomposition (cycle 2)** — Extracted the two higher-coupling editor clusters into `useWikilinkHandlers` (note-title set for broken-link detection, backlink index + current backlinks, and `[[link]]` click / Cmd-click / autocomplete-insert — preserving the native-listener DOM-write that keeps inserted links visible) and `useEditorFocusUX` (floating-toolbar positioning on selection change + the focus/caret placement and scroll-into-view layout effect). No behaviour change; `BoojyNotes.jsx` is now ~1,400 lines (down from 1,675), and both hooks gain tests.

## v0.4.0 — 2026-05-29

### Removed
- **Terminal panel** — Removed the desktop terminal (the right-hand panel, its toggle, and the `node-pty` + xterm dependencies). It was Electron-only — on the web app the toggle opened an empty panel — and it's the most tangential feature to note-taking, so it's been pulled while the core gets polished. The pre-removal state is tagged `terminal-snapshot` for an easy future re-add. The top bar is simpler as a result: no right-panel toggle, no reserved right column, tabs now extend the full width, and the word count sits just left of the help button — bracketed by a thin divider on each side, matching the sidebar handle (identical layout on web and desktop). `Cmd+\` (which toggled the panel) is now unbound; `Cmd+Shift+\` split view is unchanged.

### Bug Fixes
- **Placeholder no longer overlaps typed text** — On a new note, the "Type / for commands…" hint used to linger behind the first line you typed until you reached a second line. It now hides the moment you start typing, because visibility is driven by the block's actual emptiness (`:empty` / a lone `<br>`) instead of the debounced saved text.
- **Open note now updates on sync** — When a note open in the editor was changed on another device or browser tab, the change updated internally but the visible text stayed stale until you switched notes. Remote pulls, realtime updates, and cross-tab broadcasts now refresh the editor immediately (only for the open note, so in-progress edits elsewhere aren't disturbed).
- **Wikilink autocomplete no longer jumps away** — Picking a note from the `[[ ]]` menu now just inserts the link and keeps your place, instead of navigating to the linked note and losing your cursor mid-sentence.
- **Nested folder rename fixed** — Renaming a folder inside another folder (e.g. `Work/Projects` → `Clients`) no longer orphans an empty entry at the sidebar root; the renamed folder stays nested correctly.
- **Mobile image insert fixed** — The image button in the mobile toolbar now actually inserts the picked image (it was passing the wrong arguments and silently failing on every attempt).
- **Sidebar accessibility** — The "New Folder" and "New Note" action buttons inside the notes tree are now exposed as `treeitem`s, fixing a critical `aria-required-children` violation (a `tree` may only own `treeitem`/`group` children). Restores a clean axe pass in E2E — the first green CI since ~March 2026.
- **Link URLs are now safely escaped** — A quote character inside a link's URL could break out of the link tag and inject HTML attributes. URLs in both `[text](url)` links and auto-detected bare URLs are now escaped, closing the injection gap.
- **Declining the first cloud sync now sticks** — When you log in with local notes, the "sync these to the cloud?" prompt could be silently bypassed: switching tabs or regaining a connection would upload everything anyway, and "Cancel" only hid the dialog. The first upload is now blocked until you explicitly confirm, and Cancel keeps it blocked.
- **Removing strikethrough/highlight keeps inner formatting** — Toggling off `~~strikethrough~~` or `==highlight==` over text that also contained bold or italic used to flatten it to plain text. The formatting tag is now unwrapped, so the bold/italic inside survives.

### Features
- **Delete confirmation on web** — Deleting a note or folder on the web app is permanent (there's no Trash to recover from), so it now asks for confirmation first via a themed dialog. Desktop still moves deletions to the OS Trash silently, since those are recoverable. The mobile delete prompt also now tells the truth on web ("permanently deleted" rather than "moved to Trash").

### Improvements
- **Tap the title bar to rename (mobile)** — On mobile, tapping the note title in the top bar now jumps to and focuses the title for editing, instead of doing nothing.
- **Backlinks are keyboard-accessible** — Entries in the Backlinks panel can now be focused and opened with the keyboard (Tab to them, Enter/Space to open), and show a focus highlight — previously they were mouse-only.
- **Find shows when it's unsupported** — In browsers without the CSS Highlight API (Firefox, older Safari), the in-note Find counter showed a misleading "0 of 0". It now shows "n/a" with a tooltip explaining the browser requirement.
- **Auth button signals loading to screen readers** — The sign-in / create-account button now sets `aria-busy` while submitting, so assistive tech announces the in-progress state.

## v0.3.0 — 2026-05-28

### Removed
- **Native mobile (iOS/Android)** — Removed the Capacitor wrapper, all `@capacitor/*` packages, the native file API (`nativeAPI.js`), and the `ios/`/`android/` projects. The app now targets **web (responsive PWA) + desktop (Electron)** only. Mobile-browser users still get the touch-optimised layout via responsive web.
- **AI chat** — Removed the in-app AI chat panel, multi-provider support (OpenAI/Gemini/Anthropic), API key storage, and the AI settings tab. Scope reduction to focus on core note-taking.

### Internal
- **Refactor: BoojyNotes hook extraction** — Pulled `useNoteStats`, `useWebNags`, and `useDocumentTitle` out of the 1733-line root component into dedicated, unit-tested hooks. No behaviour change.
- **Tooling: pnpm replaces npm** — Switched the package manager to pnpm (`node-linker=hoisted` so `electron-builder` + `node-pty` resolve as before). CI workflows and docs updated. Verified the full desktop release build (DMG packaging with native node-pty rebuild) works under pnpm. _Note: the Cloudflare Pages build command must be switched to pnpm in the CF dashboard — it is not read from the repo._
- **Tooling: Biome replaces ESLint + Prettier** — Unified lint + format into a single fast tool (`biome.json`). Rules mirror the previous ESLint setup (a11y kept off for parity — a future opt-in); `dangerouslySetInnerHTML` allowed for the custom contentEditable editor. Pre-commit hook, CI, and the post-edit validation hook rewired accordingly.

### Features
- **Share format picker** — Mobile share menu now offers Plain Text, Markdown, and Copy to Clipboard options instead of sharing raw block text
- **Onboarding hints** — 5 contextual tooltip hints for new users (slash commands, wikilinks, tags, swipe navigation, split view) that auto-dismiss after 8 seconds and never repeat
- **Backlinks context** — Backlinks panel now shows the block text containing the wikilink with the link highlighted in accent color, instead of the first 100 characters of the source note

### Improvements
- **Themed syntax highlighting** — Prism.js code syntax colors now adapt to Night/Day themes instead of being hardcoded for dark mode only
- **Themed callout colours** — Callout icon and title colors now follow the active theme, with proper light-mode variants for all 11 callout types
- **Themed toast colours** — Error, warning, and info toasts now use theme semantic colors instead of hardcoded values
- **Empty search state** — Search with no results now shows "No results for [query]" with a hint to try #tags, replacing the generic "No notes found"
- **Desktop empty editor** — When no note is selected, shows guidance text over the star field: "Select a note from the sidebar / or press Cmd+N to create one"
- **Sync status label** — "Syncing..." text appears next to the sync dot during active sync on both desktop and mobile
- **First sync spinner** — FirstSyncModal shows a spinner animation while sync is in progress
- **Disabled button consistency** — Disabled toolbar buttons now use `cursor: not-allowed` and `pointer-events: none`
- **Hardcoded colors cleanup** — Replaced ~15 hardcoded hex colors across EditorMoreMenu, ConflictToast, TerminalTabBar, TableBlock, TopBarMobile, and GlobalStyles with theme tokens

### Bug Fixes
- **Silent error swallowing** — Added `console.error` logging to 15+ catch blocks across main.jsx, BoojyNotes, useTerminal, and nativeAPI that previously swallowed errors silently
- **Perf instrumentation in production** — 6 `[perf]` console.warn calls now gated behind `import.meta.env.DEV` so they don't appear in production builds
- **Share error feedback** — Mobile share failures now show toast messages instead of silently failing

## v0.2.0 (2026-04-05)

### Improvements
- **Mobile UI overhaul** — Larger N●tes logo (30px), settings gear icon in top bar, full-width search bar (40px tall), 48px row heights with 16px font for comfortable tap targets, accent-colored "+" on create buttons, safe area padding for trash section, and equal left/right editor margins (20px) replacing the asymmetric desktop layout

### Bug Fixes
- **Mobile back button bounces forward** — Pressing the back arrow in the mobile editor briefly showed the notes list then immediately re-opened the editor. Caused by the desktop draft-note auto-creation effect firing on mobile when `activeNote` became null. Fixed by skipping draft creation on mobile.

## v0.1.9 (2026-03-25)

### Bug Fixes
- **Paste focus race condition** — Multi-block paste now retries caret placement until the target block is mounted, instead of using unreliable nested rAF+setTimeout
- **saveVersionMap called per deletion** — Version map is now persisted once after processing all deletions, not on every iteration
- **localStorage cache fragility** — Removed fragile setTimeout-based cache in `loadFromStorage()`; each call now reads fresh from localStorage, fixing potential multi-tab inconsistency
- **Sync race condition** — `isSyncing` flag is now set immediately on entry to prevent duplicate syncs from rapid visibility/online events
- **ErrorBoundary ignores theme** — Error screen now uses CSS custom properties from the active theme with dark fallbacks, instead of hardcoded colors
- **Image/file insertion broken on web** — `getAPI()` returned null on web, silently breaking slash command images, file attachments, and image paste/drag. Added a web API with browser-native file picker and data URI storage.
- **Images stuck in loading state** — `loading="lazy"` + `display: none` on `<img>` created a deadlock where the browser refused to load hidden lazy images. Fixed by using `opacity: 0` instead and skipping lazy loading for data URIs.

### Features
- **Markdown image shortcut** — Typing `![alt](url)` in a block now auto-converts to an image block, matching how `- ` converts to a bullet list
- **Clickable tags** — `#tags` in notes are now clickable; clicking opens sidebar search filtered to notes with that tag
- **Tag autocomplete** — Typing `#` followed by letters shows a dropdown of existing tags with note counts, like wikilink autocomplete
- **Tag search** — Typing `#` in the sidebar search shows all tags as browsable pills with counts; clicking a tag filters to matching notes

### Improvements
- **Left-aligned images** — Images now align to the left like text, with resize handles on the right side only
- **Aspect-ratio-aware image sizing** — New images auto-size based on shape: landscape → 100%, square → 70%, portrait → 50%. Existing images are unaffected.
- **Hover-to-resize images** — Resize handles now appear on hover instead of requiring a click to select first. Single click opens lightbox directly. Resizing no longer accidentally triggers the full-size view.
- **Block-level error boundary** — If a single block crashes during render, only that block shows an error fallback with a delete button. The rest of the editor stays usable.

### Accessibility
- **Sidebar search clear button** — Added `aria-label="Clear search"` to the icon-only close button
- **Tab close button** — Added `role="button"` and `aria-label="Close tab"` to tab close controls in PaneTabBar

## v0.1.8 (2026-03-24)

### Bug Fixes
- **Export HTML title escaping** — PDF export now escapes `&` in note titles before `<`/`>`, preventing double-encoding of entities
- **Block/note ID collision resistance** — `genBlockId`/`genNoteId` now use random suffixes instead of a sequential counter that reset on restart
- **Wikilink attribute escaping** — `data-target` attribute now escapes quotes, preventing attribute breakout for note titles containing `"`
- **URL auto-link trailing punctuation** — Bare URL regex no longer captures trailing `)`, `.`, `,`, etc. as part of the URL
- **URL auto-link inside existing links** — Bare URL regex no longer matches URLs already inside `href="..."` attributes
- **Italic formatting inside bold** — `*italic*` regex now uses lookbehind/lookahead to avoid consuming `**bold**` markers

### Improvements
- **Sync timeout** — Pull and push operations now have a 30-second timeout; stalled network calls no longer block sync indefinitely
- **Sync offline detection** — Sync now distinguishes between network failures (shows "offline") and server errors (retries then shows "error"), instead of treating all failures as retryable errors
- **Broadcast payload validation** — Realtime note updates from other devices now validate `content.blocks` is an array, preventing malformed payloads from corrupting local state

### Security
- **Terminal opts validation** — Preload now whitelists terminal creation options (cols, rows, cwd only), preventing arbitrary opts from reaching node-pty
- **File size limit on pick-file** — Electron file picker now rejects files larger than 100 MB with a user-facing dialog, preventing memory exhaustion
- **AI key storage warning** — Web/mobile AI settings now show a warning that API keys are stored in unencrypted browser local storage

### Improvements
- **Extract useAppKeyboard hook** — Global keyboard shortcuts (undo/redo, zoom, new note, split view, etc.) moved from BoojyNotes.jsx to `src/hooks/useAppKeyboard.js`
- **Extract useAppPersistence hook** — localStorage save effects and beforeunload flush moved from BoojyNotes.jsx to `src/hooks/useAppPersistence.js`
- **Split TopBar** — 701-line TopBar.jsx split into TopBarMobile (166 lines), TopBarDesktop (545 lines), and a thin 8-line router
- **Memo heavy components** — Added React.memo to TopBar, CalloutBlock, CodeBlock, and TableBlock to reduce unnecessary re-renders
- **Focus-visible CSS** — Replaced blanket `outline: none` with `:focus-visible` styles; all interactive elements now show focus rings when using keyboard navigation
- **Focus traps on menus** — Added useFocusTrap to SlashMenu, WikilinkMenu, and ContextMenu so keyboard focus stays within open menus
- **ARIA on editor blocks** — Added `role="textbox"`, `aria-multiline`, `aria-label` to paragraph, heading, bullet, and numbered blocks; added `role="region"` and `aria-label` to editor container and title field
- **Sync status announcements** — Added visually-hidden `aria-live` region in TopBar that announces sync state changes to screen readers
- **DOCX export: all block types** — Added blockquote, image (alt text fallback), file (filename), and embed handling to DOCX export
- **Import file size limit** — Markdown, HTML, and folder imports now reject files larger than 50 MB
- **Platform feature warnings** — Capacitor no-op stubs for export/import now log warnings instead of silently returning
- **Backslash escapes in formatting** — `\*`, `\~`, `` \` ``, `\=` now render literally instead of triggering formatting
- **Lazy load SettingsModal + TerminalPanel** — Both heavy components are now code-split and loaded on demand

### Security
- **Terminal cwd validation** — Terminal working directory is now validated to be within the user's home directory, preventing path traversal
- **Typed electronAPI interface** — Removed `[key: string]: any` catch-all from global.d.ts; all IPC methods now have explicit types
- **Cross-tab sync** — Added BroadcastChannel for instant note sync between browser tabs (no more waiting for 60s poll)
- **Schema versioning** — Added schema version tracking and migration framework to localStorage storage layer
- **IndexedDB fallback** — When localStorage quota is exceeded, note data automatically falls back to IndexedDB
- **TypeScript strict mode** — Enabled `strict: true` in tsconfig with `strictNullChecks`, `strictFunctionTypes`, etc. Fixed all TSX type errors.
- **Discriminated Block union** — Block type in `src/types/notes.ts` is now a discriminated union with per-variant required fields (CodeBlock requires `lang`, ImageBlock requires `src`, etc.)
- **EditorContext** — Created `src/context/EditorContext.jsx` to hold stable editor values (refs, handlers, block operations). EditorArea props reduced from 51 to 18. Custom memo comparator preserved — only reactive values stay as props.
- **Context provider tests** — Added tests for ThemeContext (theme toggle, persistence, auto mode) and NoteDataContext (initialization, validation, data/actions split)
- **Settings + Terminal tests** — Added tests for SettingsModal (ARIA, tab switching, close) and TerminalPanel (visibility, tab create/close, active instance)
- **Callout body parsing** — Callout body no longer breaks on `[!word]` appearing mid-text; only breaks on a proper nested callout syntax at start of line
- **Table alignment normalization** — Table parser now normalizes alignment array to match header column count, preventing undefined access on mismatched tables
- **Note data validation on load** — Notes loaded from localStorage are now validated to have `content.blocks` array; malformed entries are silently dropped instead of crashing
- **Unified top bar height** — Desktop top bar and pane tab bar increased from 44px to 48px, matching mobile and the Boojy Design System spec

## v0.1.7 (2026-03-20)

### Features
- **UI Scale setting** — New dropdown in Settings → Appearance to adjust UI zoom (50%–200%), persists across restarts
- **Zoom keyboard shortcuts** — Cmd+Plus / Cmd+Minus to step through UI scale values, Cmd+0 to reset to 100%
- **Multi-line indent/dedent in code blocks** — Tab/Shift+Tab with multi-line selection now indents/dedents each selected line instead of replacing the selection
- **Firefox scrollbar styling** — Add `scrollbar-width: thin` and `scrollbar-color` for Firefox compatibility alongside existing WebKit scrollbar styles

### Improvements
- **Centralized z-index constants** — Replace all hardcoded z-index values across 30 components with `Z.*` constants from `src/constants/zIndex.js`; fixes ImageLightbox/TerminalTabBar collision (lightbox now stacks above terminal)
- **AI icon in Settings sidebar** — AI tab now has a sparkles icon matching other sidebar tab icons
- **Monochrome slash menu icons** — Image and File icons replaced with monochrome Unicode chars that respect theme colors; Table now shows `| | |` shortcut hint
- **Adaptive editor max-width** — Editor content area expands from 720px to 840px when sidebar is collapsed, with smooth transition
- **Theme-aware sync status colors** — TopBar sync indicator now uses `SEMANTIC.warning`/`SEMANTIC.error`/`TEXT.muted` from theme instead of hardcoded hex colors
- **Theme-aware highlight button** — FloatingToolbar highlight active state now uses `theme.mark.bg` instead of hardcoded yellow
- **useCallback for panel resize** — Wrap `startDrag`/`startRightDrag` in `useCallback` to prevent unnecessary child re-renders
- **ARIA accessibility** — Add `aria-selected` to SlashMenu items, `role="listbox"` + `aria-label` to CalloutBlock picker, `aria-label` to sidebar search input, `role="menu"` + `aria-label` to ImageBlock context menu

### Security
- **Gemini API key moved to header** — API key no longer exposed in URL query string (which leaks to browser history/logs/Referer); now sent via `x-goog-api-key` header
- **Path traversal fix in attachment protocol** — `boojy-att://` handler now validates resolved path stays inside notes directory, preventing `../../` traversal to arbitrary files
- **Path traversal fix in note file manager** — `sanitizeFilename` now rejects `..` and `.` components to prevent folder names escaping the notes directory
- **CI audit no longer silently ignored** — Changed `npm audit --audit-level=high || true` to `npm audit --audit-level=critical` so critical vulnerabilities fail the build

### Bug Fixes
- **Fix copy across non-editable blocks** — Copying a selection spanning code blocks, tables, callouts, images, or file blocks no longer silently drops them; non-editable blocks are now preserved in full during internal copy/paste
- **Fix first pasted block losing indent** — When pasting indented blocks into the middle of a paragraph, the first pasted block now correctly preserves its indentation level
- **Fix UI Scale viewport issues** — Setting UI Scale to any non-100% value no longer causes white gaps (< 100%) or content cutoff (> 100%); root div height now uses zoom-compensated `vh` formula alongside `minHeight` on `<html>` for full Firefox compatibility
- **Fix browser tab title** — Browser tab now dynamically updates to show the active note name (e.g. "COMP208 - Week 8 - Boojy Notes") instead of always showing "Boojy Notes"
- **Fix external paste** — Pasting multi-line content from external apps (Obsidian, etc.) now creates proper blocks (headings, lists, paragraphs) via `markdownToBlocks()` instead of flattening everything into a single line
- **Fix sync race on remote delete** — When a note is deleted on another device but has local edits, a conflict toast is now shown instead of silently deleting the note
- **Fix orphaned persisted dirty notes** — On load, persisted dirty note IDs are filtered to exclude notes that were already deleted locally (prevents ghost entries after crash)
- **Fix textOnlyEdit flags stuck forever** — `textOnlyEdit`, `textOnlyEditForSidebar`, and `textOnlyEditForEditor` flags are now cleared in the text flush callback, preventing sidebar/editor memo comparators from skipping renders indefinitely
- **Fix offline edits lost on crash** — Dirty notes are now persisted synchronously via `beforeunload` handler, not just via the 1-second debounced timer

## v0.1.6 (2026-03-19)

### Bug Fixes
- **Fix editor top gap** — Change StarField from `position: sticky` to `position: absolute` and reduce editor top padding from 28px to 12px to eliminate the blank gap above the first block
- **Fix split-pane crash** — Add missing `Fragment` import removed during lint cleanup; `Cmd+Shift+\` no longer crashes
- **Fix stale closure in global keydown handler** — `Cmd+N`, `Cmd+Shift+\`, and undo/redo now read current `activeNote`, `noteData`, and `splitState` via refs instead of stale closure values
- **Fix undo crash on deleted note** — Guard `undo()`/`redo()` against deleted notes so `Cmd+Z` after deleting a note no longer throws
- **Fix stale AI chat context** — Add `noteData` to `activeNoteContext` useMemo deps so block edits propagate to AI panel
- **Fix cross-tab stale cache** — Auto-clear `loadFromStorage()` cache after initial read so multi-tab usage reads fresh data from localStorage
- **Fix deleted-note ghost writes** — Skip notes missing from `noteDataRef` during flush to prevent deleted notes from being re-written to disk
- **Fix split-pane data loss** — Flush pending debounced text changes before applying new `commitTextChange` to prevent one pane from overwriting the other
- **Fix code blocks with triple backticks** — Use 4-backtick fences when code content contains triple backticks; parser now handles variable-length fences
- **Fix folder rename with path separators** — Strip `/` and `\` from folder names to prevent phantom nested folders

### Architecture
- **Break god component (Phase 1)** — Extracted `BoojyNotes.jsx` from 2,060 to ~1,500 lines via three new contexts (`SidebarContext`, `OverlayContext`) and five extracted components (`TitleBar`, `OnboardingToast`, `PersistenceWarning`, `FirstSyncModal`, `ConflictToast`). Sidebar props reduced from 35+ to 13.
- **SidebarContext** — Manages search state, sidebar tree data, folder expansion, custom folders, trash, and all derived data computations. Sidebar.jsx now consumes via `useSidebar()` hook instead of props.
- **OverlayContext** — Centralizes overlay state (context menu, slash menu, wikilink menu, drag tooltip, lightbox) shared across multiple components.

### Lint Cleanup (Phase 2)
- **Fix ESLint JSX detection** — Added `react/jsx-uses-vars` and `react/jsx-uses-react` rules to properly detect JSX component usage
- **Remove ~150 unused variable warnings** — Cleaned up destructured context values not used directly in BoojyNotes.jsx, dead imports across codebase
- **Fix exhaustive-deps warnings** — Added missing stable ref dependencies, added eslint-disable comments with reasons for intentional patterns

### Design Tokens (Phase 6)
- **Add `radius.default` token** — Added `default: 6` to radius tokens matching the most common borderRadius in the codebase
- **Migrate settings components to design tokens** — Replaced hardcoded pixel values with token imports (`spacing`, `radius`, `fontSize`, `fontWeight`) across `SettingsModal`, `AppearanceTab`, `EditorTab`, `AITab`, `ExportTab`, `ProfileTab`, `AboutTab`, `TerminalPanel`, and `TerminalTabBar`. Adopted `buttonBase` spread in ProfileTab and EditorTab for primary action buttons

### TypeScript (Phase 7)
- **Convert 13 files to TypeScript** — Tier 1: `random.ts`, `colorUtils.ts`, `storage.ts`, `useTheme.ts` (already .ts), `useIsMobile.ts`, `useToast.ts`, `Toast.tsx`, `SpacerBlock.tsx`. Tier 2: `FrontmatterBlock.tsx`, `LinkTooltip.tsx`, `DropZoneOverlay.tsx`, `usePaneRefs.ts`
- **Full type annotations** — All converted files use explicit interfaces for props and return types, importing from existing `src/types/` definitions

### Improvements
- **Accessibility hardening (Phase 3)** — Added ARIA roles and keyboard navigation across 8 components: `ContextMenu` (`role="menu"`, `role="menuitem"`, arrow/enter/escape keyboard nav with `activeIndex` tracking), `WikilinkMenu` (`role="listbox"`, `role="option"`, `aria-selected`), `PaneTabBar` (`role="tablist"`, `role="tab"`, `aria-selected`), `EditableBlock` checkbox (`role="checkbox"`, `aria-checked`), `TableBlock` (`scope="col"` on `<th>`), `ImageLightbox` (`role="dialog"`, `aria-modal`, `aria-label`, `useFocusTrap`), `FloatingToolbar` (`role="toolbar"`, `aria-label`, `aria-pressed` on buttons), `Toast` (`role="alert"`, `aria-live="assertive"`)
- **Add `useFocusTrap` hook for modal focus management** — Traps Tab/Shift+Tab within a container, focuses first element on open, restores focus on close. Applied to SettingsModal with `role="dialog"` and `aria-modal`
- **Add ARIA roles to Sidebar** — `role="tree"` on note list, `role="treeitem"` on folders/notes, `aria-expanded` on folders, `aria-selected` on active note
- **Add ARIA roles to SlashMenu** — `role="menu"` on container, `role="menuitem"` on each command item
- **Add skip-to-content link** — Hidden link at top of app that becomes visible on focus, jumps to `#main-content`
- **Split `useEditorHandlers` into focused sub-hooks** — Extracted 1,370-line monolith into 6 files under `src/hooks/editor/`: `useKeyboardHandlers.js` (keydown handling), `useInputHandler.js` (contenteditable input + markdown shortcuts), `usePasteHandler.js` (paste + copy), `useDragDropHandlers.js` (drag/drop), `useSlashCommands.js` (slash command execution), `useMouseHandlers.js` (mouse events + focus). `useEditorHandlers.js` is now a ~65-line compositor that wires up sub-hooks and returns the same public API
- **Split `electron/main.js` into focused modules** — Extracted 1,079-line monolith into 6 files: `noteFileManager.js` (note CRUD, index, attachments, import/export), `trashManager.js` (trash IPC handlers), `fileWatcher.js` (chokidar setup), `settingsManager.js` (config, spellcheck, auto-update), `secureStorage.js` (safeStorage IPC). `main.js` is now a 243-line orchestrator that creates the window and wires up modules

### TypeScript
- **Define core data types** — Added `src/types/notes.ts` (Block, BlockType, NoteContent, NoteData, NoteStore), `src/types/editor.ts` (SlashMenuState, WikilinkMenuState, ToolbarState, LinkPopoverState, LightboxState), `src/types/settings.ts` (AISettings, SyncState, User, Profile)
- **Add global type declarations** — Created `src/types/global.d.ts` with `Window.electronAPI` interface and Vite client types
- **Fix markdown.js TS errors** — Added JSDoc type annotations to fix 3 TypeScript errors in the shared markdown module

### Testing
- **Add Playwright E2E tests** — Installed `@playwright/test` and `@axe-core/playwright`. Initial test suite: app loads, note creation, settings modal, keyboard shortcuts, and accessibility audit (zero critical violations)
- **Add E2E to CI** — GitHub Actions now runs Playwright tests after build step

### CI & Security
- **Fix vitest environment** — Changed test environment from `node` to `jsdom` so DOM-dependent tests run correctly
- **Add coverage thresholds** — Set minimum coverage: 60% lines/statements, 50% branches, 55% functions
- **Add npm audit to CI** — CI now runs `npm audit --audit-level=high` and fixed all 4 high-severity vulnerabilities (tar, undici)
- **Add pre-commit hooks** — Installed `husky` + `lint-staged` to auto-run Prettier and ESLint on staged files
- **Add Dependabot** — Weekly npm dependency update PRs via `.github/dependabot.yml`
- **Add engines field** — `package.json` now requires Node >= 18.0.0
- **CI runs coverage** — Changed CI test step from `npm test` to `npm run test:coverage`

### Performance
- **Fix StarField animation bottleneck causing INP lag** — Cap canvas to viewport height (sticky positioning) instead of full scrollHeight (~64MB → ~5MB pixel buffer), replace expensive `ctx.shadowBlur` glow with cheap two-circle technique, cache layout dimensions to eliminate forced reflows from animation loop, replace continuous rAF with 5-second interval (near-zero CPU during typing), debounce ResizeObserver (200ms), wrap in `React.memo`. *(INP lag persists — additional bottlenecks remain elsewhere)*
- **Throttle localStorage persistence (web)** — Increased full noteData localStorage debounce from 300ms to 2000ms, reducing `JSON.stringify` calls ~7x during typing. Added `beforeunload` flush as safety net
- **Short-circuit EditorArea memo comparator** — Text-only edits now skip the O(n) block-structure comparison loop entirely via `textOnlyEdit` ref fast-path
- **Replace `structuredClone` with shallow block copy** — History snapshots use shallow spread + array copy instead of `structuredClone`, reducing snapshot time from ~2-5ms to ~0.5ms
- **Fix dead `textOnlyEdit` fast-path** — The EditorArea memo comparator fast-path was dead code because `noteTitlesKey` useMemo consumed and reset the flag before the comparator ran. Added separate `textOnlyEditForEditor` ref that EditorArea consumes independently
- **Optimize beforeunload effect** — Replaced `noteData`-dependent beforeunload effect with a ref-based approach, eliminating effect churn (listener teardown/re-register) on every noteData change
- **Add `[perf]` console diagnostics** — Temporary `console.warn` instrumentation on hot paths (cloneNote, localStorage writes, memo comparators, pointerDown) to identify INP bottlenecks in DevTools

### Bug Fixes (continued)
- **Fix service worker `Failed to fetch` error** — Added `.catch()` to background fetch in stale-while-revalidate strategy; added offline fallback response for API calls when both network and cache miss

### Improvements
- **Split `SettingsModal` into tab components** — Extracted 2,212-line monolith into 7 files under `src/components/settings/`: `SettingsModal.jsx` (shell + tab nav, 401 lines), `ProfileTab.jsx`, `AppearanceTab.jsx`, `EditorTab.jsx`, `AITab.jsx`, `ExportTab.jsx`, `AboutTab.jsx`. Each tab consumes contexts directly
- **Create design token system** — Added `src/tokens/` (spacing, radius, typography, shadows) and `src/styles/` (buttons, inputs) for consistent styling across components
- **Deduplicate markdown converters** — Consolidated `blocksToMarkdown`/`markdownToBlocks` into `src/utils/markdown.js` as single source of truth. `electron/markdown.js` and `src/services/sync.js` now re-export from the shared module. Sync now uses the full parser (supports code blocks, tables, callouts, embeds, blockquotes)
- **Extract block type renderers from EditableBlock** — Moved `ImageBlock`, `FileBlock`, `EmbedBlock`, and `SpacerBlock` into standalone files under `src/components/blocks/`. EditableBlock now acts as a dispatcher, delegating to the appropriate block component based on type. Pure refactor with no behavior changes
- **Extract GlobalStyles component** — Moved the ~450-line global `<style>` block (keyframes, scrollbar styles, code block styles, link/wikilink styles, table styles, callout styles, Prism token colors) from `BoojyNotes.jsx` into a standalone `GlobalStyles` component
- **Extract DevOverlay component** — Moved the ~400-line dev tools overlay (color sliders, theme/style selectors, dev toast, gear button) into a lazy-loaded `DevOverlay` component that is tree-shaken from production builds via `React.lazy` + `import.meta.env.DEV` guard
- **EditorArea context migration** — `EditorArea` now reads `accentColor`, `editorBg` from `useLayout()` and `settingsFontSize` from `useSettings()` directly, removing 3 props from EditorArea and PaneContainer call sites and memo comparators
- **BoojyNotes reduced from 2,930 → 2,033 lines** (-897 lines, 31% reduction)

### Bug Fixes
- **Surface silent errors as toasts** — Added user-visible toast notifications for 5 previously silent error paths: trash loading failure, localStorage save failure (storage full), image save failure (`useBlockOperations`), image slash command failure, and file slash command failure (`useEditorHandlers`)

### Tests
- **53 new tests across 5 files** — `useNoteNavigation` (8 tests), `useSplitView` (24 tests), `useSearch` (13 tests), `TopBar` component (5 tests), `Sidebar` component (3 tests). Total: 348 → 412 tests, 20 → 25 test files

### Features
- **React ErrorBoundary** — New `ErrorBoundary` component catches unhandled React errors and shows a recovery UI with error details, stack trace, "Reload App" and "Copy Error" buttons. Automatically flushes `noteDataRef` to localStorage as emergency backup on crash
- **Toast notification system** — New `useToast` hook and `Toast` component for surfacing file operation errors (disk write failures, trash errors, directory changes) via dismissible bottom-left toast notifications with error/warning/info variants
- **Sync retry with exponential backoff** — Failed syncs now retry up to 3 times with exponential backoff (2s, 4s, 8s) before showing error state. New "retrying" sync state shows animated dot during retry attempts
- **Unhandled promise rejection logging** — Added global `unhandledrejection` listener in `main.jsx` for better error visibility

### Improvements
- **React Context extraction** — Extracted three contexts from the 3,077-line `BoojyNotes.jsx` god component:
  - `NoteDataContext` (split into data + actions sub-contexts for performance) — owns `noteData`, `setNoteData`, `useHistory`, `syncGeneration`, `activeNoteRef`
  - `SettingsContext` — owns font size, spell check, auto-update, AI settings, auth state, and related effects
  - `LayoutContext` — owns sidebar/panel dimensions, colors, tab styles, and panel resize logic
- **Prop drilling reduction** — `SettingsModal` dropped ~25 props, `TopBar` dropped ~15 props, `Sidebar` dropped 3 props, `TerminalPanel` dropped 4 props by consuming contexts directly
- **Test infrastructure** — Added supabase mock and `structuredClone` polyfill to test setup; added `makeNote` factory to test helpers; created `providers.jsx` with `mockContexts()` and `renderWithProviders()` for component tests

### Bug Fixes
- **Fix markdown shortcut reversion** — `commitNoteData` now cancels any pending debounced text flush before applying structural changes, preventing the 300ms timer from overwriting markdown shortcut conversions (`# ` → h1, `- ` → bullet, `[] ` → checkbox, etc.) with stale ref data
- **Fix blank screen on launch** — `useSync` referenced `editedNoteHint` before it was declared by `useHistory`; moved `useHistory` call before `useSync` to fix the ReferenceError
- **Fix missing favicon** — Added `<link rel="icon">` to `index.html` pointing to `favicon-32.png` in the public directory
- **Fix Geist font MIME type error** — Removed broken jsdelivr CDN link for Geist font that was returning `text/plain` instead of `text/css`; the font wasn't loading anyway, so this just eliminates a failed network request and console error

### Improvements
- **Sidebar caching: O(1) ref check** — Replaced O(n log n) folder-key string computation with a `textOnlyEditForSidebar` ref that skips `derivedRootNotes`/`folderNoteMap` rebuild entirely on text-only edits; cached `filteredTree` by input reference equality to avoid redundant `filterTree` calls when search/folder structure hasn't changed
- **Editor performance: 6 keystroke-path optimizations** — Pre-compile regex patterns at module scope instead of per-keystroke; use live DOM walking (`domNodeToMarkdown`) instead of double DOMParser round-trips; batch `setNoteData` calls with `requestAnimationFrame` to coalesce rapid keystrokes into one React update; debounce `savePersistedDirty` localStorage writes (1s) to avoid blocking main thread; skip `noteTitlesKey` recomputation on text-only edits; short-circuit sync dirty-detection loop with edited-note hint instead of iterating all notes
- **Pointer INP optimization** — Added CSS `contain: content` to all text block types (p, h1–h3, bullet, numbered, checkbox, blockquote) so layout changes in one block don't trigger reflow of sibling blocks; debounced `selectionchange` listeners via `requestAnimationFrame` to avoid forced synchronous layout from `getBoundingClientRect()` on every click
- **INP phase 2: sub-100ms keyboard interactions** — Removed 6 `[perf]` console.log calls from hot paths (2–5ms savings per keystroke in Chrome); wrapped debounced `setNoteData` flush in `startTransition` so React can interrupt reconciliation during user interactions; deferred `structuredClone` in `pushHistory` via `queueMicrotask` to move 5–30ms off the first-keystroke synchronous path; used `useDeferredValue` for word count so `stripMarkdownFormatting` runs in a subsequent frame; added folder-assignment key caching to skip sidebar `derivedRootNotes`/`folderNoteMap` rebuild on text-only edits

### Features
- **Tab / Shift+Tab block indentation** — Obsidian/Notion-style indent/outdent for bullet lists, numbered lists, checkboxes, blockquotes, paragraphs, and headings. Tab indents a block (up to 6 levels), Shift+Tab outdents. Visual rendering adds 24px padding per indent level. Bullet characters cycle through ● / ○ / ▪ by indent depth. Numbered lists maintain independent counters per indent level. Enter on an indented list item preserves indent; Enter on an empty indented list item outdents by 1. Backspace at position 0 or on empty indented block outdents before deleting/merging. Copy/paste preserves indent. Markdown serialization uses 2-space indentation for lists. Code blocks and tables are unaffected (they handle Tab internally).
- **Multi-provider AI chat panel** — Added AI chat as a tab type in the right panel, coexisting with terminal tabs. Users can create AI chat tabs via the new `[✦]` button in the tab bar. Supports Anthropic, OpenAI, Google Gemini, and local/custom models (Ollama, LM Studio). Each AI tab maintains an independent conversation with streaming responses, markdown rendering, and a copy button on AI messages.
- **AI Settings** — New "AI" section in Settings with provider selection, model dropdown, API key input (masked with show/test buttons), base URL override for proxies/local models, context toggle, and max tokens configuration. API keys are stored securely via Electron's `safeStorage` on desktop, `@capacitor/preferences` on mobile, and `localStorage` on web.
- **Note context for AI** — Toggle "ctx: on/off" in the AI chat header to include the current note's content as context in AI conversations.
- **Unified tab bar** — Terminal and AI tabs coexist in the same tab bar with type-specific icons (`>_` for terminal, `✦` for AI). On web/mobile where terminal isn't available, only the AI tab button appears. Default tab auto-created based on platform (terminal on desktop, AI on web).

## v0.1.5 — 2026-03-16

### Bug Fixes
- **Fix copy/paste losing paragraph breaks and block types in web browser** — Pasting HTML with block-level elements (`<p>`, `<div>`, `<li>`, headings) no longer merges all text together; `sanitizeNode` now inserts `<br>` separators when unwrapping block elements. Copy handler now encodes block structure (type, text, metadata) via custom clipboard data so pasting within the editor preserves H1/H2/H3, bullets, checkboxes, blockquotes, and numbered list types. External paste and plain-text fallback still work as before
- **Fix editor lag on long documents** — Eliminated two redundant DOMParser calls per keystroke by introducing `domNodeToMarkdown()` that walks live DOM elements directly; hoisted 10 regex pattern compilations from per-keystroke to module scope; added length guard to skip pattern matching on blocks with real content

### Features
- **Android support** — Added Android platform via Capacitor; all existing iOS Capacitor code (filesystem, attachments, settings, camera) works identically on Android with zero code changes; added Android back button handling
- **Capacitor iOS support** — Added Capacitor integration for iOS, reusing the existing React codebase; implemented unified API provider pattern (`src/services/apiProvider.js`) so all 14+ files that reference the native API use a single abstraction instead of direct `window.electronAPI` calls; created `src/services/nativeAPI.js` implementing the full electronAPI interface (~46 methods) backed by Capacitor plugins with .md file storage format matching Electron for future iCloud sync; added cross-platform attachment URL resolution, platform detection utilities, and Capacitor project skeleton with iOS platform

### Improvements
- **Component test coverage** — Added first component/integration tests (EditableBlock, SlashMenu, useBlockOperations) using @testing-library/react; set up test infrastructure with vitest jsdom environment, global mocks, and block data factories; total tests: 200 (up from 158)

## v0.1.4 — 2026-03-16

### Bug Fixes
- **Fix multi-block copy/paste collapsing into one block** — Copying text across multiple blocks and pasting now preserves all blocks and their types (headings, bullets, checkboxes, etc.) instead of merging everything into a single paragraph; also adds custom copy/cut handlers for cross-block selections and splits external multi-line pastes into separate blocks

### Features
- **Mobile responsive layout** — Full mobile-friendly layout for viewports ≤768px: hamburger menu opens sidebar as slide-in overlay with backdrop, compact top bar with note title and new-note button, full-screen settings with stacked sections, auto-close sidebar on note select, auto-open sidebar when no note selected

### Improvements
- **Larger mobile top bar buttons** — Increased top bar height to 48px, icon sizes to 19px, and button padding to 12px for better touch targets on mobile
- **Opaque mobile settings background** — Settings modal uses solid `BG.darkest` on mobile instead of semi-transparent `modalBg` to prevent editor content bleeding through
- **Full-screen mobile sidebar** — Sidebar now covers the entire screen (top: 0) instead of starting below the top bar, eliminating the ghostly blur effect; backdrop opacity increased to 0.55

### Known Bugs
- **"Type / for commands..." placeholder too dim in dark mode** — The empty-block placeholder text is barely visible in dark mode; should be brighter
- **Placeholder doesn't reappear after idle** — After typing and then pausing for a few seconds, the "Type / for commands..." placeholder should fade back in over ~1s to remind users of the slash command feature

## v0.1.3 — 2026-03-12

### Features
- **Cross-platform CI release workflow** — GitHub Actions workflow builds macOS and Windows installers on tag push (`v*`), with macOS code signing and notarization
- **Auto-updater** — App checks for updates on startup via `electron-updater` and GitHub Releases; new "Updates" section in Settings with auto-update toggle, version display, download progress bar, and "Restart & Update" button

### Bug Fixes
- **Service worker caching stale versions** — Switched from cache-first to stale-while-revalidate strategy and bumped cache version; existing users will get fresh assets on next visit instead of being stuck on old versions

## v0.1.2 — 2026-03-11

### Improvements
- **Pull-before-push sync** — Sync now pulls remote changes before pushing local edits, ensuring the client has up-to-date version numbers; eliminates ~90% of false conflict copies when switching between devices

### Features
- **Onboarding toast** — Anonymous web users see a toast after creating their 3rd note: "Your notes are saved locally…Sign in to sync." Dismisses via X button or auto-dismisses after 15s; persists dismissal in localStorage
- **First-sync confirmation modal** — When signing in for the first time with existing local notes, a modal asks "Sync your notes — X notes will be uploaded to your account" with Sync Now / Not Now buttons; prevents accidental bulk upload
- **PWA support** — Added `manifest.json` and service worker for offline capability and installability; cache-first for app shell, network-first for API calls; service worker registered on web only (not Electron)
- **Anonymous persistence warning** — After 5+ notes (and onboarding dismissed), a subtle toast warns: "You have X notes stored only in this browser. Sign in to back them up." Shows once per session

### Features
- **VS Code-style drag & drop** — Tab reordering within the same tab bar via drag insertion line; drag tabs across panes at exact positions; sidebar drag uses compact pill ghost (max 200px) with count badge for multi-drag; 20% edge zones (up from 10%) for split creation; vertical accent-colored insertion line shows exact drop position in any tab bar; Option+drag duplicates a tab to another pane; Escape cancels any drag in progress; sidebar ghost now moves in 2D (follows cursor into editor area)
- **Split view** — Open two notes side by side with `Cmd+Shift+\`; each pane has its own tab bar, editor, floating toolbar, and find bar; draggable divider with double-click-to-reset and snap-to-close; `Cmd+1`/`Cmd+2` to switch active pane (indicated by accent border); `Cmd+Click` on wikilinks opens the linked note in the other pane (creates split if needed); drag tabs between panes or to edge zones to create splits; drag notes from sidebar into editor edge zones to create splits; same note can be open in both panes with shared content but independent scroll/cursor; split state persists across app restarts; closing the last tab in a pane auto-collapses back to single view; supports both vertical and horizontal splits; works in Day and Night themes

### Improvements
- **Unify pane tab bar styling with top bar** — Pane tab bar height now matches top bar (44px instead of 36px); pane variant uses `chromeBg` background instead of transparent (which bled through to editor); removed accent-colored border-bottom from active pane tab bars

### Bug Fixes
- **Fix R2 content fetching returning `[object Response]`** — `getObject` in `_shared/r2.ts` wrapped a `Response` object inside `new Response()`, causing `.text()` to return the literal string `"[object Response]"` instead of note content; all pulled notes silently failed to parse; now checks `instanceof Response` before wrapping
- **Fix storage display resetting to 0** — Storage indicator showed 0 after re-opening settings because incremental sync pulls only return changed notes; sync-pull now always returns `totalStorageBytes` from a full DB query; value is persisted in localStorage across sessions
- **Fix storage formatting** — Storage now shows human-readable units: KB for small values, MB, GB for limits (e.g., "312 KB / 10 GB" instead of "0.3 / 10240.0 MB")
- **Speed up first sync** — Initial sync now pushes notes in parallel batches of 5 instead of sequentially; ~5x faster for large note collections
- **Enforce single-pane note exclusivity** — A note can now only exist in one tab bar at a time; opening/dragging a note into a pane automatically removes it from all other panes; if removing a note leaves a pane empty, the split auto-collapses; `Cmd+Shift+\` split now moves the active note to the new pane instead of duplicating it (requires 2+ tabs); Option+drag now behaves as a move since duplicates are not allowed
- **Fix horizontal split crash** — Horizontal split caused blank screen because `panes.left` was hardcoded in accessors; now dynamically resolves the first pane ID based on split mode (`top`/`bottom` for horizontal, `left`/`right` for vertical)
- **Fix drop-zone overlay covering sidebar** — Tab drag overlay used `.editor-scroll`'s parentElement (the main layout row including sidebar) instead of `.editor-scroll` itself; overlay now correctly bounds to the editor area only
- **Fix performance issues and memory leaks in split view** — Main-level `selectionchange` listener, `useLayoutEffect` for focus/caret, and editor fade-in effects now skip when split mode is active (PaneContainers have their own); `onMenuExport` IPC handler no longer re-registers on every keystroke (uses refs); `setWindowTitle` effect no longer re-runs on every text change (depends on title only); stale-note cleanup in split panes only runs when notes are actually deleted rather than on every `noteData` change; EditorArea tooltip timer now cleans up on unmount to prevent state updates on unmounted components

### Performance
- **Throttle StarField animation** — Canvas star twinkle animation now draws at ~10fps instead of 60fps; pauses entirely when tab is hidden; eliminates constant GPU/CPU drain especially in split view (2 canvases)
- **Fix SplitDivider listener leak** — Window `mousemove`/`mouseup` listeners now clean up on component unmount, preventing leaked listeners and closures when split is closed mid-drag
- **Memoize PaneContainer** — Wrapped in `React.memo` with custom comparator; prevents re-rendering both panes on every keystroke (only the active pane's structural changes trigger re-render); also eliminates unnecessary `useLayoutEffect` runs
- **Replace structuredClone in block drag** — Block drag undo snapshot now uses shallow array copy instead of deep clone; drag only reorders blocks without mutating them

### Known Issues
- **Split view is buggy** — There are visual and state issues with the split view feature; fixes are planned

## v0.1.1 — 2026-03-09

### Features
- **Sync conflict resolution** — When simultaneous edits are made on different devices, a conflict copy is created (e.g. "Note Title (conflict 2026-03-09 12:00:04)") so no data is ever lost; clickable toast notification appears for 8s; conflict copies listed in Settings > Sync with quick-open buttons
- **Offline sync recovery** — Dirty notes and their content are persisted to localStorage so edits survive app crashes and tab closes while offline; sync resumes automatically on reconnect with online/offline detection
- **Sync status indicators** — Sync dot in TopBar and Settings reflects conflict (yellow), offline (gray), and error (red) states in addition to syncing/synced/idle
- **Hide title bar on web** — The draggable title bar with note name is now only shown in the Electron desktop app

### Bug Fixes
- **Fix sync function routing** — Client was calling a non-existent unified `sync` function; now correctly calls separate `sync-push`, `sync-pull`, `sync-delete` edge functions
- **Fix isRemoteUpdate race condition** — Replaced single boolean flag with a Map of noteId-to-timestamp entries; stale entries auto-cleaned after 5s to prevent blocking dirty detection
- **Remove dead storage_usage subscription** — Removed realtime subscription to non-existent `storage_usage` table; 60s polling fallback already covers missed broadcasts
- **Fix logo images missing in production build** — TopBar and Settings modal images used absolute paths (`/assets/...`) that don't resolve under Electron's `file://` protocol; now imported as ES modules so Vite bundles them correctly
- **Fix memory leaks from drag event listeners** — Block drag, sidebar drag, and table drag-to-create handlers added `pointermove`/`pointerup` listeners to `window` that weren't removed if the component unmounted mid-drag; now stored in refs and cleaned up on unmount

### Features (continued)

- **Table edge-zone interactions** — Replaced the hover toolbar with edge-based interaction zones: click the left edge to select a row, click the top edge to select a column, hold and drag to reorder rows/columns (400ms hold-to-drag with floating clone and insertion line), hover the bottom/right edge for a `+` button to add rows/columns (click for one, drag to create multiple with live preview and counter badge), right-click context menus for insert/delete operations with column alignment controls, keyboard shortcuts (Arrow keys to move selection, Backspace/Delete to remove, Escape to deselect); header row is locked and cannot be dragged or deleted
- **Help button & cheat sheet** — Added a (?) help icon in the top-right corner of the toolbar; clicking it opens a floating quick-reference dropdown with categorized editing syntax, keyboard shortcuts, and feature tips; closes on click-outside or Escape; works in both Day and Night themes

### Bug Fixes
- **Fix DAY theme search input & settings modal** — Search input had hardcoded dark background (`#18191E`), now uses `theme.searchInputBg` (white in DAY mode); settings modal had hardcoded dark background and white-overlay borders that only worked in NIGHT mode, now uses `theme.modalBg`, `theme.modalShadow`, and `theme.overlay()` for all borders/backgrounds so both themes render correctly

### Improvements
- **Smooth theme transition** — Switching between Night and Day themes now crossfades all colors over 400ms instead of switching instantly; implemented via a temporary global CSS transition injected on theme change and removed after completion

### Features
- **Day/Night theme system** — Full light/dark theme support with smooth 400ms crossfade transitions; Day mode uses flat sky-blue backgrounds with warm gold accent; Night mode preserves the existing dark palette with teal accent and star field; toggle between Night, Day, and Auto modes in Settings > Appearance; Auto mode supports both system preference detection and time-of-day scheduling with configurable hours; theme state persisted in localStorage

### Improvements
- **Theme infrastructure** — Created `ThemeProvider` React context with `useTheme()` hook; two complete palettes in `src/constants/themes.js` (NIGHT and DAY) covering all color tokens; migrated all 22 component files from direct `colors.js` imports to `useTheme()` hook; terminal theme, scrollbar styles, inline code/link/wikilink colors, callout backgrounds, and code block styles all respond to theme changes; dev tools overlay includes theme quick-toggle

### Features
- **Blockquote support** — Lines starting with `>` now render as blockquotes with a thin accent-colored left border and italic muted text (Obsidian-style); consecutive `>` lines group into one block; type `> ` to auto-convert, use `/blockquote` slash command, or write `>` lines in markdown; Enter continues the blockquote, Backspace on empty reverts to paragraph; `> [!type]` callouts are unaffected

### Bug Fixes
- **Make code block and callout backgrounds opaque** — Pre-blended semi-transparent backgrounds (`rgba(0,0,0,0.3)` for code blocks, `rgba(...,0.20)` for callouts) against the `#040412` editor background to produce solid hex colors; prevents star field canvas from bleeding through these elements
- **Fix code block keyboard input and language selector** — Code block text and language changes were silently swallowed by `EditorArea`'s `React.memo` comparator, which only checked block `id` and `type` — intentionally skipping `text` for contentEditable blocks but unintentionally blocking textarea-based code blocks too; now the memo also compares `text` and `lang` for code-type blocks so state updates flow through to `CodeBlock`
- **Fix ghost note naming after promotion** — When typing in the body first, `promoteDraft` forced the title to the literal string "Untitled", replacing the faded placeholder with solid text that required manual clearing; now keeps the title empty so the CSS placeholder remains active and the user can type a title naturally; added `|| "Untitled"` fallback to tab labels for display consistency
- **Fix ghost note not appearing in empty vault** — On app start, `activeNote` could point to a deleted note via stale localStorage, preventing the draft-creation effect from firing; now resets `activeNote` to null when it references a non-existent note. Also fixed `onFileDeleted` disk sync wiping in-memory draft notes by preserving `_draft` entries during `setNoteData` overwrites
- **Fix deleted folders/notes retaining stale ordering position** — When a folder or note was deleted, its custom drag-order entry persisted in `sidebarOrder`; re-creating it would cause it to reappear at its old position instead of sorting alphabetically; now `deleteFolder` cleans the folder (and all subfolders) from both `customFolders` and `sidebarOrder`, and `deleteNote` removes the note ID from its folder's `noteOrder`; external deletions via Finder also clean `sidebarOrder` during folder sync
- **Fix orphaned folders remaining in sidebar after vault files deleted** — The `onFileDeleted` handler only merged folders into `customFolders` and never removed stale ones; when all files in a folder were deleted externally, the empty folder persisted in the sidebar; now syncs `customFolders` against actual disk state, removing folders that no longer contain notes
- **Fix progressive slowdown on note switch** — `useHistory` was cloning the entire `noteData` object (all notes) on every edit, accumulating massive memory pressure across 50 undo stack entries; now stores per-note `{ noteId, snapshot }` tuples, reducing memory ~100×. Wrapped all `useEditorHandlers` return values in `useCallback` so `React.memo` on `EditorArea` is no longer bypassed on every parent render. Fixed `visibilitychange` listener leak (anonymous function couldn't be removed in cleanup).

### Improvements
- **Ghost note empty state** — Replaced the static "Notes" logo splash screen with a live editor draft; when no note is open, a phantom note appears with "Untitled" and "Type / for commands..." placeholders; the note materializes into a real note (sidebar, tabs, disk) only when you start typing; navigating away from an empty draft silently discards it
- **Performance: reduce unnecessary re-renders** — Memoized sidebar tree computation (folder hierarchy, filtering, sorting) with `useMemo` chains so it only recomputes when `noteData`, `customFolders`, `sidebarOrder`, or `search` change; wrapped `Sidebar`, `ContextMenu`, and `EditorArea` in `React.memo`; removed unstable `isSelected` callback in favor of `selectedNotes.has()` inline; extracted inline `onNavigateToNote` closure to `useCallback`; memoized `activeFormats` default object to prevent spurious `FloatingToolbar` re-renders

### Features
- **Multi-select notes in sidebar** — Cmd+Click to toggle individual notes, Shift+Click to select a range; right-click shows bulk context menu with "Delete N notes", "Move to..." folder submenu, and "Move to root"; multi-drag moves all selected notes as a group with a count badge; selection clears on plain click, editor click, or search activation

### Bug Fixes
- **Fix nested folders flattened to root level** — Nested folder paths like `University/25-26 Semester 2/COMP208` were saved as flat directories with underscores (`University_25-26 Semester 2_COMP208`) because `sanitizeFilename()` was applied to the entire path; now each path segment is sanitized individually, preserving the nested directory structure; same fix applied to restore-from-trash
- **Fix folder drag-and-drop reordering** — Folder reordering now works correctly at all nesting levels; fixed root-level reorder using full paths instead of folder names, fixed nested folder reorder producing empty sibling lists, and fixed name-vs-path mismatch causing folders to jump to top
- **Fix default sidebar folder ordering** — Folders at every nesting level now sort naturally by default (e.g. Week 1, Week 2, … Week 10) instead of appearing in arbitrary insertion order; custom drag-to-reorder still takes priority when set
- **Fix sidebar folder nesting** — Deeply nested folders (e.g. `University/25-26 Semester 2/COMP208/Week 3`) now display as a proper nested tree instead of flat top-level entries; added `pathsToTree()` utility that splits slash-delimited paths into hierarchical nodes
- **Fix stars disappearing when scrolling past ~50 lines** — Replaced `inset: 0` with `top: 0; left: 0; width: 100%` so the canvas isn't clipped to viewport height; stars now generate dynamically in bands as content grows, so scrolling down always shows stars
- **Fix blank screen after native title bar switch** — Removed duplicate `noteData` destructuring in EditorArea that caused `undefined` prop when the redundant BoojyNotes prop was cleaned up
- **Fix useEffect dependency array** — Replace dynamic property access `noteData[activeNote]?.title` with `noteData` in window title effect dependency array

### Features
- **Separate title bar** — Added a thin 28px draggable title bar above the TopBar with centered window title; traffic lights sit in the title bar row instead of overlapping TopBar content; TopBar left padding reduced since traffic lights no longer occupy that space

### Improvements
- **Compact slash menu** — Single-line rows with smaller icon boxes (24px), reduced padding, and right-aligned monospace shortcut hints instead of verbose descriptions; removed redundant "Text" command; menu is shorter and easier to scan

### Features
- **Spell check** — Native Electron spell check with right-click suggestions, "Add to Dictionary", and language selection (8 languages); toggle on/off in Settings → Appearance; persists across sessions via app settings file
- **Word count tooltip** — Hover over "N words" in the top bar to see character count, character count without spaces, and estimated reading time
- **Find in note (Cmd+F)** — Floating search bar with CSS Custom Highlight API for non-destructive match highlighting; "n of N" counter, previous/next navigation (Enter/Shift+Enter), collapsible Replace section with Replace and Replace All; Escape to close
- **Table alignment** — Column alignment (left/center/right) via toolbar buttons when hovering a table; alignment round-trips through markdown separator row (`:---:`, `---:`, `---`); header row styled with bold + accent tint
- **Table cell formatting** — Bold, italic, code, strikethrough, highlight, and wikilinks now render inside table cells; formatting preserved on blur via `htmlToInlineMarkdown`
- **Table CSV/TSV paste** — Paste tab-separated or comma-separated data into a table cell to auto-fill cells; grid expands if pasted data exceeds current dimensions
- **PDF export** — Export any note as a styled PDF via right-click context menu or File → Export → PDF; renders in a hidden BrowserWindow with print-friendly CSS
- **DOCX export** — Export any note as a Word document via right-click or File → Export → DOCX; supports headings, lists, checkboxes, code, tables (with alignment), callouts, and inline formatting (bold, italic, code, strikethrough, highlight)
- **Import markdown files** — File → Import → Markdown Files to copy `.md`/`.txt` files into the vault; chokidar watcher auto-detects new files
- **Import HTML files** — File → Import → HTML Files converts HTML to markdown via Turndown and saves as `.md` in the vault
- **Import folder** — File → Import → Folder recursively imports all `.md`/`.txt` files preserving directory structure; "Import files here" in folder right-click menu
- **Embed / Transclusion (`![[Note Title]]`)** — Embed another note's content inline as a read-only preview with accent-colored left border; `![[Note#Heading]]` shows only the heading's section; "not found" placeholder with "Create note" button for broken embeds; nested embeds supported up to depth 3; `/embed` slash command; round-trips through markdown
- **Vitest test suite** — 158 tests across 6 test files covering markdown conversion (round-trip for all 14 block types), search (fuzzy matching, indexing, grouping), sidebar tree (sorting, nesting, filtering), backlink index (wikilinks, aliases, dedup), inline formatting (markdown↔HTML, sanitization), and slash command data validation
- **ESLint + Prettier** — Flat ESLint 9 config with React and React Hooks plugins; Prettier auto-formatting for consistent code style; `npm run lint` and `npm run format:check` scripts
- **TypeScript (incremental)** — `tsconfig.json` with `allowJs`, `@ts-check` + JSDoc on 5 pure utility files (`sidebarTree.js`, `backlinkIndex.js`, `search.js`, `data.js`, `markdown.js`); shared type definitions in `src/types.d.ts`; `npm run typecheck` script
- **GitHub Actions CI** — Runs lint, format check, type check, tests, and build on push/PR to master and feature branches

### Bug Fixes
- **Lightbox missing ArrowUp/ArrowDown close** — Pressing ArrowUp or ArrowDown now closes the image lightbox, matching Escape and ArrowLeft/ArrowRight behavior
- **Image deselection on typing** — Pressing a printable character while an image block is selected now deselects the image and lets the keystroke pass through to the editor
- **Timestamp filenames for clipboard pastes** — Pasted screenshots now get descriptive filenames like `paste-2026-03-05-143022.png` instead of generic `image.png`
- **Filename deduplication uses dash** — Duplicate filenames now get a `-2` suffix instead of ` 2` (space), avoiding issues with spaces in filenames
- **Friendly filename dots** — Dots in filenames are now converted to spaces in display labels (e.g., `song.final.mix.mp3` → "Song Final Mix")

- **Markdown shortcuts not triggering** — Typing `## `, `- `, `1. `, etc. did not convert to headings, bullets, or numbered lists; the browser inserts trailing spaces as `&nbsp;` entities, and the `htmlToInlineMarkdown` fast path returned the raw entity string without decoding it, so the shortcut regexes never matched; also fixes a latent data corruption bug where `&nbsp;` was stored literally and later displayed as `&amp;nbsp;` after undo/redo or note switching
- **Title text reversal when typing** — Fixed typing "Hello" appearing as "olleH" in the title; the `useLayoutEffect` that syncs external file renames depended on `currentTitle`, causing it to overwrite the contentEditable DOM on every keystroke and reset the cursor to position 0; changed dependency to `syncGeneration.current` (matching the `EditableBlock` pattern) so the DOM is only rewritten on note switch or external file sync
- **Critical: wikilink selection destroying all notes** — Selecting a note from the `[[` autocomplete menu called `commitTextChange(noteId, blockIndex, newText)` with three positional args, but the function expects a single updater function; this set the entire notes state to a string, wiping all data from React state and disk; now uses the correct updater-function pattern matching `updateBlockText`

### Features
- **Wikilink autocomplete menu** — Type `[[` in any block to open an autocomplete menu listing all note titles; fuzzy-filters as you type; Enter or click inserts `[[Title]]` and navigates to the note; "Create note" fallback for non-existent titles; Escape or click-outside to dismiss
- **Callout block rewrite** — Replaced emoji icons with Lucide line icons and native `<select>` with custom type picker dropdown (11 types with icons, colours, checkmark for active); switched from click-to-edit input/textarea to always-live `contentEditable` title and body; keyboard navigation: Enter in title focuses body, ArrowUp/Escape exits, Backspace on empty deletes block, ArrowUp/Down at body edges navigates between blocks
- **Callout alias resolution** — Obsidian aliases (`caution`, `hint`, `error`, `todo`, `faq`, `cite`, `tldr`, etc.) resolve to canonical types on parse while preserving the original alias in `calloutTypeRaw` for round-trip fidelity
- **Callout collapsible syntax** — `+`/`-` fold suffixes (`> [!note]+`) parsed and preserved in round-trip

### Bug Fixes
- **Cursor reversal when typing** — Fixed typing "hello" appearing as "olleh"; the `noteTitleSet` was getting a new object reference on every keystroke (because it depended on `noteData`), causing `EditableBlock` to re-render and rewrite `innerHTML`, destroying cursor position; stabilised the Set reference so it only changes when actual note titles change
- **Callout type picker scroll jump** — Fixed page scrolling to top when opening the type picker; render picker via React portal to `document.body` instead of inside the scroll container; added scroll-save/restore guard via `useLayoutEffect` to prevent residual scroll resets caused by blur→commit→re-render and type-select→re-render paths
- **Consecutive callouts** — Fixed parser consuming the second callout's `> [!type]` line as body text of the first callout
- **Callout search indexing** — Callout title text now included in full-text search index

### Improvements
- **Callout visual tweaks** — Removed colored left border strip, increased background opacity from 6% to 20% for better visibility, aligned body text with icon (removed 31px left padding)
- **Code block — seamless card** — Removed inner box/border from `<pre>` overlay so the code block renders as one clean card
- **Code block — 4-space tabs** — Tab key now inserts 4 spaces (was 2); Shift+Tab removes 4 spaces
- **Code block — trimmed language list** — Removed Rust and Dart from dropdown; kept Plain, JavaScript, TypeScript, Python, HTML, CSS, JSON, Bash, SQL
- **Code block — removed indent guides** — Removed thin vertical indent guide lines for a cleaner look
- **Code block — language label dropdown** — Click the language label (bottom-right) to open a dropdown and change language; hover brightens the label; always shows "Plain" when no language is set
- **Code block — full language names** — Language label now shows "JavaScript", "Python", etc. instead of short codes like "js", "py"
- **Code block — stronger border** — Default border opacity increased from 6% to 10%, focus border from 10% to 18%

### Bug Fixes
- **Code block — blank first line & bracket artifact** — Stripped leading/trailing newlines from code display to fix empty first line and textarea/overlay misalignment; added `display: block` to `<code>` element to prevent anonymous block box rendering issues
- **Code block — overlay double-spacing** — Fixed double line breaks and blank top line in code overlay caused by `\n` between `display:block` spans inside `<pre>`; also removed trailing newline that added extra blank line at bottom
- **Code block — selection artifacts** — Fixed browser default highlight bleeding through textarea by adding `-webkit-text-fill-color: transparent` and custom `::selection` style

### Features
- **Code block rewrite** — Replaced header-bar + double-click UX with always-editable textarea + syntax-highlighted overlay; hover-only copy icon (SVG) with green checkmark feedback; bottom-right language label; right-click context menu with "Change Language" submenu (now includes Rust & Dart); Tab/Shift+Tab indent/dedent; Enter with auto-indent; Escape exits to next block; ArrowUp/Down at edges navigates between blocks; Backspace on empty deletes block
- **Link system** — External links render with ↗ icon in soft blue (#6ea8d8), wikilinks in teal (#A4CACE)
- **Single-click to open links** — External links open in browser, wikilinks open note (no modifier key needed)
- **URL hover tooltip** — Shows full URL after 500ms hover delay
- **Right-click context menu on links** — Open, Copy, Edit, Remove actions; broken wikilinks show Create Note option
- **Ctrl/Cmd+K link shortcut** — Insert or edit links via keyboard shortcut with inline popover; also available from floating toolbar
- **Smart paste** — Paste URL over selected text to create `[text](url)` link; paste standalone URL to create clickable link
- **Bare URL auto-detection** — Typed or pasted URLs auto-convert to clickable links with ↗ icon
- **Broken wikilink detection** — Links to non-existent notes rendered with dashed underline in muted color

### Features
- **Obsidian compatibility — code blocks** — Fenced code blocks (` ``` `) now parse, render with Prism.js syntax highlighting, and round-trip perfectly; supports 8 languages (JS, TS, Python, HTML, CSS, JSON, Bash, SQL); double-click or Enter to edit in monospace textarea; language selector dropdown; copy button; `/code` slash command; typing ` ``` ` auto-converts to code block
- **Obsidian compatibility — frontmatter** — YAML frontmatter (`---` at file start) now preserved as a collapsible block showing property count; click to expand and view key-value pairs; round-trips without data loss
- **Obsidian compatibility — callouts/admonitions** — `> [!type]` syntax renders as styled callout blocks with left border, icon, and title; 11 types supported (note, info, tip, warning, danger, success, question, quote, example, bug, abstract); editable title and body; type selector dropdown; `/callout` slash command
- **Obsidian compatibility — tables** — Markdown tables (`| ... |`) render as HTML tables with individually editable cells; Tab/Shift+Tab cell navigation; Enter in last row adds new row; hover toolbar with +Row, +Column, -Row, -Column buttons; `/table` slash command creates default 3x2 table
- **Obsidian compatibility — wikilinks** — `[[Note Title]]` and `[[Target|Display]]` syntax renders as dotted-underline links; Ctrl/Cmd+Click opens the target note or creates it if it doesn't exist; round-trips to markdown without data loss
- **Backlinks panel** — Below each note's content, a "Backlinks" section lists all notes that reference the current note via `[[wikilinks]]`; click to navigate directly to the source note
- **Strikethrough formatting** — `~~text~~` renders as strikethrough; `Cmd+Shift+S` keyboard shortcut; button in floating toolbar
- **Highlight formatting** — `==text==` renders as highlighted text with a subtle yellow background; `Cmd+Shift+H` keyboard shortcut; button in floating toolbar
- **Inline tags** — `#tag` renders in accent color (not confused with `#` headings at line start)
- **Multi-line markdown parser** — Rewritten parser from line-by-line `for` loop to stateful `while` scanner; correctly handles code fences, tables, callouts, and frontmatter spanning multiple lines

### Bug Fixes
- **Live file sync — editor blocks** — External file changes (terminal, Finder, other editors) now update the editor's contentEditable DOM by bumping a shared `syncGeneration` counter, ensuring `EditableBlock` re-syncs its innerHTML
- **Live file sync — title** — Renaming a note's `.md` file externally now updates the title bar; `useLayoutEffect` dependency includes the actual title text instead of only the active note ID
- **Live file sync — new folders** — Creating files in new folders externally now makes both the folder and note appear in the sidebar; `onFileChanged` adds unknown folders to `customFolders`, and `onFileDeleted` re-merges folders after re-read

### Features
- **Full-text fuzzy search** — Sidebar search now searches note titles AND body content with typo tolerance; results grouped by folder with highlighted snippets; keyboard navigation (arrows + Enter) scrolls to and briefly highlights the matching block in the editor; clear button and Escape to dismiss; 150ms debounced for snappy typing; custom fuzzy matching with score-based ranking (no external dependencies)
- **Integrated terminal** — Fully functional multi-instance terminal in the right panel powered by `node-pty` + `xterm.js`; tabbed interface matching the note tab design; spawn real PTY sessions (zsh/bash) with 256-color support; `Cmd+\` toggles panel, `Cmd+Shift+T` creates new terminal, `Cmd+Shift+W` closes active terminal, `Cmd+K` clears, `Cmd+F` searches output; tab context menu with Rename, Clear, Restart, Kill; clickable URLs open in browser; auto-resizes with panel; press Enter to restart exited processes; PTYs cleaned up on app quit
- **Draggable title bar** — Hold non-interactive areas of the top bar to move the window; buttons, tabs, and resize handles remain fully clickable
- **Trash / Recycling Bin** — Deleted notes move to a `.trash/` folder instead of being permanently destroyed; 30-day auto-purge on startup; collapsible Trash section in sidebar with age labels; right-click to Restore or Delete permanently; Empty Trash button; folder deletion moves all contained notes to trash individually; trash persists across restarts via `.boojy-trash-meta.json`
- **Block drag reordering** — Hold any block 400ms to drag and reorder; multi-block drag with text selection; Escape to cancel; auto-scroll near edges; Ctrl+Z reverts the entire drag
- **Sidebar drag reordering** — Hold notes/folders 400ms to reorder or move between folders; drop-into-folder with auto-expand; visual drop indicator line; order persists in `.boojy-meta.json`
- **Image blocks** — Insert images into notes via drag & drop from file explorer, clipboard paste (screenshots via Win+Shift+S / Cmd+Shift+4), or `/image` slash command with native file picker; images render inline with hover controls (accent border + delete button); stored as `![alt](.attachments/noteId/file.png)` in markdown for Obsidian/VS Code portability
- **Image storage** — Images saved to `.attachments/{noteId}/` directory inside the vault; `boojy-att:` custom protocol resolves paths efficiently without base64 overhead; attachment directories cleaned up automatically on note deletion
- **Inline formatting** — Bold (`Ctrl+B`), Italic (`Ctrl+I`), and Inline Code (`` Ctrl+` ``) via keyboard shortcuts or floating toolbar; stored as markdown tokens (`**bold**`, `*italic*`, `` `code` ``) in block text for full .md file compatibility
- **Floating toolbar** — Notion-style bubble toolbar appears above selected text with Bold, Italic, Code, and Link buttons; shows active format state; disappears on selection collapse
- **Links** — Markdown links `[text](url)` and bare `https://` URLs auto-render as clickable links; Ctrl+Click opens in browser; Link button in toolbar prompts for URL
- **Numbered lists** — Type `1. ` to create a numbered list; auto-numbering across consecutive numbered blocks; Enter continues the list; empty item + Enter converts to paragraph; `/numbered` slash command; persists as `1. text` in .md files
- **Rich paste** — Pasting HTML from web pages preserves bold, italic, and code formatting while stripping all other tags
- **Arrow key navigation between blocks** — ArrowUp/Down now moves the cursor between blocks when at the first/last line of a block (Obsidian-like behavior); ArrowUp from the first block still moves to the title; spacer blocks are skipped
- **Cmd/Ctrl+N** shortcut to create a new note from anywhere
- **Cmd/Ctrl+P** shortcut to open sidebar and focus search input

### Performance
- **Instant terminal startup** — Pre-spawns a warm PTY in the background 2 seconds after app launch; when the user opens a terminal, the already-running shell is claimed instantly instead of waiting 1-3s for `pty.spawn()` + shell init; pool auto-refills after each claim; falls back to normal spawn if no warm PTY is available; warm PTYs cleaned up on app quit

### Improvements
- **Codebase refactor** — Split monolithic `BoojyNotes.jsx` (~3,500 lines) into 17 focused files: 9 custom hooks (`useHistory`, `useNoteNavigation`, `useNoteCrud`, `useBlockOperations`, `useInlineFormatting`, `usePanelResize`, `useBlockDrag`, `useSidebarDrag`, `useEditorHandlers`), 2 utility modules (`domHelpers`, `sidebarTree`), and 5 components (`TopBar`, `Sidebar`, `EditorArea`, `ContextMenu`, `SlashMenu`); main file reduced to ~810 lines as a thin orchestrator
- Word count now strips markdown formatting tokens for accurate counts
- Inline code renders with monospace font, subtle background, and border
- Links render with accent color and subtle underline

### Bug Fixes
- Fix Enter on empty blocks appearing to do nothing — when `beforeText` is empty, `el.innerText = ""` stripped the `<br>` that gives empty blocks visible height, collapsing the old block to 0px; now sets `el.innerHTML = "<br>"` instead, keeping the block visible so the new line appears below
- Add missing app icon (`assets/icon.png`) and fix icon path in `electron/main.js` — the previous `build/icon.png` path was gitignored, so a fresh clone couldn't display the window icon
- Fix `setTabStyleB` crash on Ctrl+, — reference was stale after state rename to `tabFlip`
- Fix Settings crash when `storageLimitMB` is null/undefined — guard `storagePct` calculation and display
- Fix frontmatter parser not stripping surrounding quotes from YAML values
- Fix placeholder text ("Type / for commands...") never showing — `:empty` CSS pseudo-class doesn't match elements containing `<br>`; switched to `.empty-block` class driven by React state
- Fix font size setting not applying to editor — pass `settingsFontSize` through to `EditableBlock`
- Add delete confirmation dialog to prevent accidental note deletion

### Improvements
- Placeholder text ("Type / for commands...") now only appears on the first block of a note, reducing visual clutter on subsequent empty blocks
- Placeholder cursor now appears at the left edge instead of after the text — the hint renders as a faded overlay behind the blinking cursor
- Move brand assets (`boojy-logo.png`, `boojy-notes-text-N.png`, `boojy-notes.text-tes.png`) from repo root into `assets/`; delete unused `boojy-notes-full-name-text-logo.png` and `boojy-notes-settings-circle.png`; update all `<img src>` references
- Archive Flutter platform scaffolding to `flutter-templates` branch and remove local Flutter directories (`android/`, `macos/`, `windows/`, `ui/`, `.dart_tool/`, `build/`) from working tree
- Split `boojy-notes-mockup.jsx` monolith (3,344 lines) into focused modules under `src/`: constants (`colors.js`, `data.js`), utils (`colorUtils.js`, `storage.js`, `random.js`), components (`Icons.jsx`, `StarField.jsx`, `EditableBlock.jsx`, `SettingsModal.jsx`), and main component (`BoojyNotes.jsx`); no logic changes
- Gate dev tools (overlay, gear button, toast, Ctrl+. / Ctrl+,) behind `import.meta.env.DEV` — stripped from production builds
- Gate `console.warn` debug logging behind `import.meta.env.DEV`
- Remove unused icon imports (`NewNoteIcon`, `NewFolderIcon`, `TrashIcon`)
- Remove non-functional Trash button from sidebar (no trash feature exists)
- Remove non-functional help `?` button from top bar (no help content exists)
- Add click-outside dismiss for slash command menu
- Custom Electron menu — strips "Toggle Developer Tools" from production builds
- Set `app.setName("Boojy Notes")` for proper OS display
- Bump version to `0.1.0`; add `electron-builder` config for Windows/macOS/Linux packaging

### Bug Fixes
- Fix editor focus on new blank notes — cursor now appears reliably on first interaction; root cause was `placeCaret` mutating DOM (`<br>` → text node) during focus transitions, which destabilised browser selection state; `placeCaret` is now a pure selection operation (uses element-level `range.setStart(el, 0)` for `<br>` elements), `handleEditorKeyDown` recovers cursor when `rangeCount === 0` instead of silently swallowing keystrokes, removed `suppressEditorFocus` complexity in favour of a `mouseIsDown` ref that lets `handleEditorFocus` defer to `handleEditorMouseUp` during clicks, and added `console.warn` debug logging at all recovery points
- Fix block ID churn in Electron — `useFileSystem` now compares incoming blocks structurally (type, text, checked) and skips state updates when chokidar echoes back files we just wrote, preventing unmount/remount cycles that wiped focus
- Fix double-newline block separation in saved `.md` files — blocks now join with single `\n` (Obsidian-style), and parsing splits on single newlines so each line becomes its own block

### Improvements
- Remove YAML frontmatter from local `.md` files — notes are now clean markdown (Obsidian-style), with title derived from filename and folder from directory structure; note IDs persisted in `.boojy-index.json`

### Features
- **Notes folder chooser in Settings** — desktop (Electron) users can view and change their vault directory from Settings → Sync; default path changed to `~/Documents/Boojy/Notes/`
- **Electron desktop app** — notes stored as real `.md` files on disk (`~/Documents/Boojy/Notes/`), browseable and editable with Obsidian, VS Code, etc.
- Chokidar file watcher detects external edits and syncs them into the app in real-time
- `useFileSystem` hook for filesystem persistence with 500ms debounced writes
- Title/folder renames automatically move files on disk; deletes remove files
- One-time migration: existing localStorage notes written to disk on first Electron launch
- `dev:web` script preserves pure browser development without Electron
- Vault directory configurable via native folder picker

### Bug Fixes
- Fix cursor not appearing after Enter on title or clicking below editor — `mousedown` on the click-below area was defocusing the contentEditable editor before `onClick` could restore it; switched to `onMouseDown` with `preventDefault`; title Enter now explicitly focuses the editor div before placing the caret
- Fix editor body not accepting text input — empty blocks now use `<br>` for caret anchoring so Chromium places the cursor inside the block element
- Fix title→editor caret not appearing on Enter — replaced manual `focus()`/`placeCaret()` with the standard `focusBlockId`/`focusCursorPos` ref pattern to avoid race conditions with React's render cycle
- Fix click-below-editor focus using same ref-based pattern instead of `setTimeout`/`placeCaret`

### Features
- Store notes as portable markdown (`.md`) in R2 instead of JSON — YAML frontmatter for metadata, markdown body for content
- Backward-compatible pull: auto-detects legacy JSON vs new markdown format on sync
- `blocksToMarkdown()` / `markdownToBlocks()` converters for all block types (p, h1–h3, bullet, checkbox, spacer)

### Previous Bug Fixes
- Fix "New Folder" button hidden when no folders exist — button was gated behind `filteredTree.length > 0`
- Fix caret not appearing in Chromium/Electron browsers (Cursor) — ensure empty blocks have a text node for caret anchoring, use `requestAnimationFrame` for title→editor focus transition, and focus existing empty block on click-below
- Fix slash command menu not triggering in Chromium/Electron — strip leading/trailing newlines and trim whitespace before checking for `/`
- Fix Edge Function 401 "invalid JWT" — disable gateway JWT verification (functions verify auth internally)
- Keep settings panel open after OAuth login (Google/Apple redirect no longer closes it)
- Fix Enter key intermittently not creating new blocks in the editor
- Fix slash commands (`/`) not opening the command menu
- **Fix React/contentEditable race conditions** — `cleanOrphanNodes` was running on every render, destroying browser selection state; now only runs after structural ops (Enter/Backspace)
- **Fix focus placement timing** — ref registration and cursor placement now use `useLayoutEffect` (synchronous after DOM update), ensuring refs are ready before focus is placed
- **Fix blockRefs race condition** — parent `useEffect` was clearing all refs AFTER child components registered them
- **Fix duplicate block IDs** — `genBlockId()` now includes timestamp to avoid collisions with existing blocks from localStorage
- Strip trailing newline from `innerText` reads (browser `<br>` artifact)
- Prevent cursor from escaping block structure — guard keydown, input, and click events
- Improved `placeCaret` with `isConnected` check, return value, and fallback recovery
- Snap cursor to nearest block on clicks between or below blocks
- Suppress React `contentEditable` warnings on bullet/checkbox wrapper elements
- Fix sync parse errors for non-JSON remote notes (moved parsing outside React state updater)
- Fix title-to-editor focus transition — `placeCaret` now focuses the contentEditable ancestor before setting selection
- Fix click-below-editor not placing cursor in new block when editor wasn't previously focused

### Improvements
- Auto-select "Untitled" text when creating a new note — typing immediately replaces placeholder title
- Memoize `EditableBlock` with `React.memo` — prevents all blocks from re-rendering on every keystroke
- Stabilize `flipCheck` and `registerBlockRef` with `useCallback` for proper memoization

### Features
- Cloud sync via Supabase Edge Functions + Cloudflare R2 storage
- `sync-push`, `sync-pull`, `sync-delete` Edge Functions for note CRUD
- Client-side sync service with automatic change detection and debounced push (5s)
- `useSync` hook — watches noteData for changes, auto-syncs dirty notes
- First sync pushes all local notes to server; subsequent syncs are incremental
- Live sync status in Settings (Synced/Syncing/Error indicator, last synced time, storage bar)
- "Sync now" button for manual sync trigger
- Supabase Auth integration — real email/password sign-in and sign-up
- Google and Apple OAuth sign-in via Supabase
- Separate Sign In and Create Account flows (signin default, create via link)
- Display name field on account creation (stored in Supabase user metadata)
- Show/hide password toggle (eye icon) on both sign-in and create forms
- Post-signup "Check your inbox" screen with Resend button (Supabase Confirm email ON — blocks login until verified)
- Email auth form with inline validation and error display
- Auth state persists across page refreshes (Supabase session)
- `useAuth` hook for centralized auth state management
- Environment-based Supabase config (`.env.local`)
- Convert Settings from in-editor tab to glassmorphism modal overlay
- Settings modal with sidebar navigation and centered header
- Backdrop blur (8px) with click-outside and Escape key to close
- Accent-coloured section headers matching Boojy Suite design pattern
- Split Cloud section into Profile (account/auth) and Sync (status/storage)
- Sync section only visible when logged in (4 sidebar items vs 3)
- Sidebar active state changed from left border strip to pill highlight
- Fixed sidebar icon alignment with 20px icon area
- Mock sign-in/sign-out flow for prototyping
- Remove About section; branding moved to sidebar footer (logo + N●tes + version) and content footer (Made by Tyr @ boojy.org)
- Replace emoji sidebar icons with SVG line icons (profile, cloud, sun)
- Remove gear icon from settings header
- Reorder sign-in buttons: Email first, then Google, Apple
- Increase modal opacity to 0.95 to match app chrome
- Replace settings overlay modal with full Settings tab in editor area
- Settings opens via ● sync dot as a singleton tab (no duplicates)
- Settings page with three sections: Boojy Cloud, Appearance, About
- Boojy Cloud section with sign-in buttons (Google, Apple, Email) — visual only for now
- Appearance section with font size +/- controls and disabled spell check toggle ("coming soon")
- About section with N●tes wordmark, version + check for updates, Made by Tyr @ boojy.org
- Move New Note and New Folder creation into sidebar as inline "+ New Folder" and "+ New Note" buttons
- Add `createFolder` function with auto-rename mode and duplicate name handling
- Custom folders persist to localStorage and survive page refreshes

- Settings v2: card wrappers, smaller centered sign-in buttons, branded About section
- Per-note seeded star fields — each note has its own unique sky
- Star field no longer flashes on sidebar drag or window resize

### Improvements
- Shrink sidebar footer branding to watermark size (~12px) so it doesn't compete with nav items
- Add 7px breathing room above version text and content footer
- Bolder sidebar icons (strokeWidth 1.5 → 2)
- Simplify top bar right section — remove create buttons, keep only panel toggle, word count, and help
- Folder/note sections separated by spacing instead of divider line
- Create buttons hidden during search to avoid clutter
