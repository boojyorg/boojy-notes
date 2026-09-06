# UI chrome, theme and icons

Design intent and the non-obvious constraints of the visual layer. The code owns the exact
implementation; this file owns the rules a change must not break, and, where a rule looks like
a mistake, the one reason it is deliberate. History is in git and `CHANGELOG.md`.

## Theme and colour

`src/constants/themes.js` is the only colour authority. Never hardcode a hex in a component.

- **Product terminology is Light / Dark / System.** The stored preference keys stay
  `day` / `night` / `auto`, and the theme objects stay `DAY` / `NIGHT`; renaming either would
  orphan saved preferences for no user benefit. Copy changes, keys don't. System (`auto`)
  follows the OS appearance and nothing else; the time-of-day schedule that used to sit under
  it was removed on 2026-09-05, and a saved `autoMethod` is ignored.
- Light is the first-run default when nothing is saved; a saved choice always wins.
- Electron's first-paint `backgroundColor` is Light's ground, so a Dark user sees one brief
  light flash at launch. Wiring the saved theme back to the main process is the fix if it ever
  grates.
- The palettes are neutral, with sibling app Picito's neutral ramp as the family reference and
  Boojy Notes' cyan as its own identity. Don't introduce gold; it is Picito's brand accent.
- There is no decorative background. The Dark star field was removed on 2026-09-05 (git has
  it, tag-free); the editor ground is the theme's `BG.editor` and nothing else.

**Surface roles, Light, in order light → dark.** Use them by role, not by which grey looks
right; naming greys by darkness is what makes every region read as a separate boxed panel.

| Token | Role |
| --- | --- |
| `BG.editor` | the writing sheet |
| `BG.elevated` | raised: menus, popovers, modals |
| `BG.darkest` | app ground |
| `BG.dark` | chrome: mobile toolbar, slash-menu chips |
| `BG.standard` | sidebar |
| `BG.surface` | **content** hover |
| `BG.hover` | **row/menu** hover AND selected |
| `BG.divider` | border, ink at 8% |

Text is three steps (`TEXT.primary` / `secondary` / `muted`), all clearing AA on the ground;
`ACCENT.onAccent` is for anything sitting on an accent fill.

- **Interaction grammar is two-tier.** Content hovers to `BG.surface`; rows and menu items
  hover *and* select to `BG.hover`, so hover previews selection. Every new hover state is one
  or the other.
- **Accent is theme-scoped.** Dark's accent is illegible on a light ground. Never share one
  accent constant across themes.
- **Accent is never a desktop surface.** It is identity, focus rings, 2-3px markers, wikilinks
  and the caret. Desktop selected rows are neutral. The one sanctioned tint is the selected
  divider's band, a transient selection state and closer to a focus ring than a surface: accent
  at 10% in Light, 18% in Dark, judged 2026-09-05 against a recoloured rule (which read as "a
  styled line", not "a selected object") and a neutral `BG.hover` band (which swallowed the
  rule, two greys three steps apart). Mobile note rows keep a compact
  accent-tinted pill because the denser layout needs it; that is fixed styling, not an option.

Known leaks, not yet fixed: `theme.overlay()` and about forty leaf tokens use plain black
alphas rather than ink-tinted ones; callout and syntax colours are hand-picked per theme;
`Toast` and the danger `ConfirmDialog` keep `#fff` on semantic status colours, deliberately
outside the accent scope.

## Scrollbars

- **Never set `scrollbar-width` or `scrollbar-color` on a bare selector.** Chromium ignores
  every `::-webkit-scrollbar-*` rule on an element that sets either, silently. The standard
  properties live only inside `@supports not selector(::-webkit-scrollbar)`, which Chromium
  skips and Firefox takes.
- The thumb is a slim pill inside a wider transparent-bordered track (`background-clip:
  padding-box`), so the grab target is generous without thickening the ink. State rules set
  `background-color`, never the `background` shorthand, which resets the clip and makes the
  thumb jump to full width.
- Sidebar and editor share one grammar, visible at rest with a three-step rest → hover →
  drag ramp per theme. The sidebar thumb hugs the divider (asymmetric border split), pairing
  with tree pills that stop 2px short of the gutter. No overflow means no gutter; accepted,
  `scrollbar-gutter: stable` is the fix if it grates.
- `.editor-scroll` stays as a class: `CalloutBlock`, `TableContextMenu` and `useSidebarDrag`
  query it as a DOM hook.
- Styled webkit bars are non-overlay on macOS and take layout width. Check that before widening
  the track.

## Icons: Lucide only

`src/components/Icons.jsx` wraps `lucide-react` behind the historic export names. Always
`currentColor`. Don't hand-roll an SVG unless Lucide genuinely lacks it; a hand-drawn set at
mixed sizes and strokes is what made the UI read as assembled.

- **Two size tiers:** 16px for repeated list glyphs (folder rows, search results, menu items),
  18px for navigation (the New note / Search glyphs and standalone controls). Mobile top-bar
  controls are 20px.
- **Two stroke tiers:** 1.5 for content (Lucide's default 2 reads busy at 16px among prose),
  2 for navigation chrome (`ICON_STROKE_NAV`), which balances against 14px labels.
- Control hit boxes are 32px (`CHROME_BTN`). Don't flatten the tiers in either direction:
  rendered weight is `stroke × size / 24`, so equal strokes at equal sizes keeps the ink even.
- Icons inherit `color`; a wrapper that sets none needs one.

## Window chrome and navigation

- **No desktop top bar, no title bar.** The window is `hiddenInset`; on macOS Electron the
  traffic lights sit inline in the sidebar header, and the wordmark shifts by
  `MAC_TRAFFIC_INSET` to clear them (move one, re-judge the other, **at 100% page zoom only**:
  the lights are native and never scale with the page, and macOS 26 draws them 14px on a 23px
  pitch, so they end at 75px). The header is the window
  drag region; the wordmark and chrome buttons opt out. Collapsed, a thin invisible strip along
  the viewport top keeps the window draggable and deliberately stops above the note label's
  line box so it never steals label clicks. Web and non-mac Electron render none of this.
- **One active note.** Opening a note replaces it; no tabs, no split view. Restoring tabs means
  reverting the refactor, not remounting a component. Old persisted `boojy-ui-state` blobs
  with pane state still migrate in `resolveInitialActiveNote()`; leave that read path alone.
- Cmd-click on a wikilink is a plain click. Deleting the open note lands on an empty draft
  (desktop) or the sidebar (mobile).
- **The wordmark opens Settings directly** (testid `wordmark-settings-button`). There is no app
  dropdown, About page, Help entry or Recently Deleted surface.
- **Settings is a single pane:** Appearance, Storage (desktop), Updates, a one-line version
  footer. `settingsTab` does not exist; don't reintroduce it in mocks. Spell check has no UI
  but applies from the stored Electron setting; UI scale is keyboard-only (`Cmd+Plus/Minus/0`).
  Appearance is the theme picker alone: the font-size row (`settingsFontSize`, 10–24) was
  removed on 2026-09-05 because the scale shortcuts already size everything, and body text is
  the fixed `EDITOR_FONT_SIZE` in `EditableBlock`. Don't reintroduce `settingsFontSize` in mocks.
- **One zoom system: the app's own UI scale.** The View menu carries no `zoomIn` / `zoomOut` /
  `resetZoom` roles, because a menu role takes the shortcut before the renderer sees it, so the
  app's scale never fired and Chromium's page zoom ran instead, persisted per origin in the
  profile and leaving the native traffic lights behind. `main.js` resets Chromium's zoom level
  to 0 on every `dom-ready` so a stale profile can't reintroduce it. If a dev window ever looks
  bigger than the installed app, that is page zoom; judge chrome geometry only after Cmd+0.
- **Delete follows the platform.** Electron sends the `.md` files Boojy Notes manages to the OS Trash;
  web deletion is permanent behind confirmation. Folder deletion never touches a file that is not
  a note; the directory itself goes only once nothing is left in it (OS cruft such as `.DS_Store`
  does not count), and a folder that keeps other files stays, with a toast saying so. **Desktop
  asks only when the action is more than one recoverable file:** a single note goes at once with
  a quiet toast; a folder with notes and a bulk selection confirm first, worded as `Move N notes
  to the Trash?` with the promise that non-note files stay and the folder goes only if emptied; a
  folder with no notes asks nothing. The wording lives
  in one place, `utils/deletionPrompt.ts`; don't add a second phrasing. No undo or recovery UI, by
  decision: the OS Trash is the recovery surface. The retired private `.trash` gets one
  conservative startup migration into the OS Trash: recognised notes are copied under
  collision-safe names before the source is removed, ambiguous items are left untouched and
  reported once per distinct problem set, OS cruft is ignored. Deleting a note that never
  reached disk is a benign no-op, and the watcher's unlink suppression is event-consumed rather
  than timed so a slow trash move can't fire a spurious `file-deleted`.
- **An own write is recognised by its bytes, not by the clock.** `write-note` hands
  `suppressWatcher(path, body)` the text it is writing; the watcher hashes it, and any later
  `change`/`add` whose file still holds exactly those bytes is dropped as an echo
  (`isOwnEcho`), however late. The 1.5s timer stays as the cheap first filter. macOS sends a
  second `change` for one write 1.5–2.7s later (same mtime and size, only ctime moved: metadata
  settling), which no fixed window can cover; before the hash check every one of them rebuilt
  the note from disk mid-typing, caret to the first block, keystrokes since the save lost. Don't
  replace the hash with a longer timer.
- **An outside edit is never silently overwritten** (2026-09-06). The watcher asks the bytes
  before the clock: a recorded hash that differs is a real change however soon after the
  app's own save it lands, one that matches is an echo however late, and the timer decides
  only for a path with no recorded bytes (the old path of a rename, a renamed directory).
  In the renderer every note that arrives from disk goes through one path,
  `applyExternalNote` (useHistory), which updates the history ref and state together; the
  raw setter is not used for it, because a text commit pending for another note republished
  the stale ref and wrote the old bytes back over the edit. "Same" is judged by the writer
  itself (`persistedEquals`: `blocksToMarkdown` plus title, folder and line-ending style),
  never by a field list. A change to a note that is not open, or to the open note with
  nothing pending, is taken at once, and the editor repaints only when it is the open note (a
  repaint while typing elsewhere would paint lagging state over the live DOM). A change to the
  open note while edits are pending keeps both: the outside bytes stay under the note's name,
  the local version, pending text included, is written first as `Title (conflicted copy
  YYYY-MM-DD)` through the ordinary write path, and only once that write has succeeded is
  the disk version adopted, the copy adopted (dirty, so the ordinary flush rewrites it with
  any keystrokes typed during the write), and the editor moved to the copy with the caret's
  block and offset carried through the focus refs. A failed copy replaces nothing and says so;
  the debounce will not write the local version over the disk one, but the quit/blur net still
  holds it, so quitting tries to save it under the note's own name rather than lose it.
  No merging, by decision. Undo entries for a note replaced from disk are dropped. Not
  covered: the app's own debounced write landing over an outside write before the watcher
  reports it (the last-writer race), which needs instrumenting under a sync provider first.
- **To see what the editor is doing, trace it, don't theorise.** `BOOJY_TRACE=/path/to/log
  node_modules/.bin/electron .` (after `pnpm build`; it uses the real profile and vault) appends
  one line per watcher event, save, external reload, keystroke target, caret move between blocks
  and block repaint from both processes on one clock (`electron/trace.js`, `src/utils/trace.js`).
  Everything is a no-op unless the variable is set. Quit the installed app first; two instances
  share the profile.
- **`syncGeneration` is editor plumbing, not cloud sync.** It tells uncontrolled blocks when to
  repaint from state. Don't remove it on the strength of its name.
- Word count is mobile-only. Undo/redo are keyboard-only.
- The sidebar drag handle is gated on `!collapsed`; unconditional, it leaves a hairline down
  the left edge.

**The panel toggle moves between states on purpose.** Expanded, it sits in the sidebar header
opposite the wordmark, so the header reads `wordmark … toggle`. Collapsed, `EditorChrome`
renders it fixed at the viewport's top-left. Both use the exported `ChromeButton`.

## Sidebar

### Alignment and rows

- **The chrome row is `wordmark … Search, toggle`** (2026-09-05). Search is a `ChromeButton`
  beside the panel toggle that opens the search palette; the desktop panel never shows a
  field or results, so the vault header is always the first line of the panel. **New
  note lives above the editor** (`EditorChrome`, beside the note's ···), Apple Notes style:
  the sidebar's row is for finding and hiding, the editor's for making and managing, and the
  button is still there with the sidebar collapsed. Cmd+N is unchanged. The `New Note` and
  `New Folder` tree rows are mobile-only.
- **Wordmark at 18px, drawn at 0.92 opacity** so its pure black lands near `TEXT.primary`; at
  20px full black it out-shouted the note's H1. A re-drawn asset in the ink colour is the
  proper fix. The chrome row's controls sit 6px from the divider (`HEADER_RIGHT_INSET`); the
  vault header's share that right edge (`SECTION_HEADER_RIGHT` = 6 + 7 − 8) and the 2px step.
- **Indent guides**: a 1px `BG.divider` line drops from each open folder's glyph centre through
  its children (`SPINE + SPINE_ICON / 2 + depth × 20`). In one mixed tree, root notes have no
  glyph and sit on the folder-label column, so without the line they read as children of the
  last open folder; the line ending is what says "this folder ends here". No breath before the
  root notes: the row rhythm stays even. Tree rows are 28px with a 2px gap.
- **The action group is a sticky block inside the sidebar's single scroll container.** Every
  sidebar state shares that one scroller so the search field never remounts (and drops focus)
  mid-typing; don't split states back into separate scrollers. Rows slide under the sticky
  block with no separator; a scrolled-only hairline is the fix if that reads smudgy.
- **Two-column alignment:** `SPINE` carries the wordmark, action icons, section labels and
  folder icons; `TEXT_COL` carries every label. Root note rows are text-only, so an empty
  gutter sits left of their titles. **That gutter is alignment, not a missing icon. Don't fix
  it.**
- Tree rows are pills with neutral `BG.hover` for hover, selection and multi-select alike. The
  active note is primary ink at normal weight; the pill alone carries "active", never bold,
  never accent. Mobile keeps its accent pill and bold title.
- **Only structure and actions get a glyph.** Note rows carry no file icon. Folders carry only
  the folder icon: no chevron, the whole row toggles, the open-folder glyph plus indented
  children carry the state, `aria-expanded` is the programmatic signal. Note-row padding still
  reserves the removed icon's width so titles keep their column under folder names; don't
  simplify it away. `FileIcon` still ships in search results, which are not tree rows.

### Note rows: trailing ··· and inline rename

- Desktop note rows carry a trailing ··· that opens the same menu as right-click, growing
  rightward into the editor. Right-click keeps cursor placement.
- **The ··· slot is zero-width at rest** so a long title truncates against the full row width;
  it re-truncates only while the dots are revealed (row hover/focus, or its menu open). The
  width change is instant and only the ink fades; a sliding re-truncation reads worse than a
  snap. Muted on row hover, primary when the dots themselves are hovered. All CSS
  (`.sidebar-note-more`); the row that opened the menu holds its state until it closes.
- The dots are a `span role="button"` with `tabIndex={-1}`: a real button nested in the treeitem
  button fails axe `nested-interactive`. The row stays the keyboard path.
- A pointer-opened menu shows no focus ring on its first item (initial focus parks on the menu
  container) because Chromium treats script focus as `:focus-visible`. Keyboard navigation
  still indicates normally. Single-note menu items carry glyphs; folder and bulk menus are
  text-only.
- **Double-click renames inline**, notes and folders alike, with the same in-place input and
  the name selected Finder-style. The ··· Rename falls back to the editor title only when the
  sidebar is hidden. A folder's first click still toggles it; the double-click just skips the
  second toggle rather than delaying single-click to disambiguate.

### The vault header and its one tree

- **One header, named after the vault folder** (`vaultName`, the basename of the notes
  directory; `Notes` on web), replaces the `Folders` and `Notes` sections (2026-09-05). Row
  height, row size (14px), weight 500, `TEXT.muted`: a label for the list, not a heading over
  it (judged live against 15px/600/primary, which fought the wordmark). 10px below the chrome
  row, 2px to the first row. It does not collapse, so no chevron. It scrolls with the tree; a
  pinned header lies about the rows under it once the list scrolls. It is hidden with the tree
  while a search shows results or none.
- **The header carries New folder and the ··· menu, hover-revealed at the 16px row tier**
  (`SectionAction`, `.sidebar-section-action`, reveal on header hover or focus-within, all
  CSS). 16px so they read with the folder glyphs below, not with the 18px chrome row above;
  two rows of 18px glyphs stacked read as two toolbars, which is why New note left the header.
  **Never a third glyph here.** New folder is also the first item of the ··· menu, the
  standing hint for a hover-revealed control and the keyboard path. Sort and Reveal in Finder
  follow (`VaultMenu.tsx`, keyboard grammar as `ContextMenu`); anything rarer goes there too,
  never onto the header. Not in the menu, by decision (2026-09-05): Collapse all folders
  (folders toggle on click and persist as left) and Change vault folder, which is Settings →
  Storage only, beside the path it changes. The
  `--visible` variant of `SectionAction` exists for a control that must show at rest; nothing
  uses it today.
- **One `role="tree"`, the header a sibling above it, never inside it.** A header inside a tree
  fails axe `aria-required-children` at critical impact, which the E2E gate catches. The tree
  element exists only when it has rows, because an empty tree fails axe too; the header stays
  regardless, since it is the root drop target and the home of New note. Folders come first,
  alphabetical; root notes follow in the sort preference, exactly as inside a folder. **The
  root is a folder.** Mobile has no header and keeps its own inline rows.

## Search is a palette, not a panel

- **On desktop, search is `SearchPalette.tsx`**: Cmd+K (the convention) or Cmd+P (the habit
  this app taught before), the chrome row's Search glyph, or a click on an inline `#tag`. A
  560px dialog in the top third of the window over a dimmed scrim, results growing downward.
  Search only: no commands, no recent list, nothing before you type. Escape, Enter or a click
  outside closes it; closing clears the query.
- **Version B of the three judged on 2026-09-05**: title hits show the match in the accent and
  nothing else, even when the body also matched; a body hit shows one muted line of context
  under the title with the word in the accent; every row carries its folder path, muted, on
  the right, with ` / ` between segments. No grouping by folder (the path carries that at a
  quarter of the ink), no "title match" note. A `#` with no results shows the tag chips.
- **One search, two faces.** The palette reads and writes the sidebar's search state
  (`SidebarContext`: `search`, `searchResults`, `activeResultIndex`, `navigateResults`), so
  Enter opens the highlighted result and jumps to its matched block exactly as the sidebar
  did. The sidebar tree filters behind the scrim while you type; closing clears it. The mobile
  layout keeps its field and inline results (`isMobile`-gated in `Sidebar.jsx`); the chips and
  highlighters they share live in `SearchParts.tsx`. Cmd+F in-note find is separate (`FindBar`).

## Note order is a preference, not a stored arrangement

- One global control orders every list, root and folders alike: Most recent / Alphabetical,
  persisted in `boojy-note-sort`, default recency. It lives in the vault header's ··· menu as
  a pair of radio items with the current mode marked; a preference flipped a few times a month
  does not earn a standing glyph, and the menu has room for a third mode if one ever earns it.
- **"Most recent" means most recently modified, never opened: `max(edited here this session,
  file mtime)`** (`recencyOf()` in `utils/noteSort.js`). The file's mtime is the durable truth
  and orders the vault at launch; it is also the only signal that sees an edit made in another
  app, which the watcher delivers live. Because the app's own writes don't refresh
  `lastModified` in state, `useFileSystem` stamps a note in an in-memory "edited at" map the
  moment it becomes dirty (typing after its commit, a checkbox, a rename, a move, a new or
  duplicated note). Nothing is persisted by the app and nothing is written to the user's files;
  the old `boojy-note-opened` key is no longer read.
- **Opening, selecting or reading a note has no effect on order.** The list never reshuffles
  under the pointer, which is what makes double-click rename safe in recency mode. Don't
  reintroduce an open-stamp for any reason.
- Rename and move count as modification because they rewrite the file; accepted for Beta rather
  than adding filesystem work to preserve the old mtime.
- A pure `touch` with no content change does not refresh the order (`onFileChanged` bails when
  nothing differs; deliberate anti-churn). Notes with no timestamp at all sort alphabetically at
  the back.
- `sortNoteIds` returns the same array reference when already ordered, because the sidebar's
  memo chain compares identities. Alphabetical mode doesn't subscribe to timestamps.

### Drag means location, not order

- Dragging a note moves the real `.md` file: onto a folder files it there, onto the vault header
  or the empty space under the tree moves it back out. Drag never sets a position; sort decides
  display order. Folders are always alphabetical.
- The ghost is a title-only pill that lifts in; releasing anywhere that isn't a folder or the
  root area flies it back and nothing changes. **Dropping over the editor does not open the
  note**; drag never navigates. Every drag ends by suppressing the trailing click so it can't
  open the lifted row.
- **Dragging a folder moves its directory**: onto another folder nests it, onto the vault
  header or the space under the tree moves it back to the root. Never into itself or its own subtree (those rows are not
  targets; the pointer falls through to the root). Same lift, ghost and cancel grammar as notes.
- Existing `.boojy-meta.json` files are left untouched; nothing reads their ordering keys.
  Don't tidy them and don't reintroduce a reader.

### Folders are directories

- **A folder in the sidebar is a directory in the vault**, the way Finder and Obsidian treat it,
  not "where a note happens to be". Every subdirectory shows, empty or not (your `Resources` of
  PDFs is a folder); dot-directories and `attachments` are skipped at any depth, matching the
  note walk. The list comes from `read-folders` at load, after any external delete, on
  `folders-changed` (chokidar `addDir`/`unlinkDir`, coalesced) and when the vault changes; the
  new vault's directories replace the old vault's. Web keeps folders in memory (`useNoteCrud`'s
  fallback); nothing on web makes a directory.
- **The main process is the only place that knows a folder's final name**, `electron/folders.ts`,
  the same rule as `write-note` for a note's basename: the last segment is sanitised and
  de-duplicated (`-2`), a case-only rename is a rename, a path can never escape the vault, and
  every operation answers with the vault-relative `/` path the disk holds. The renderer adopts
  the answer; no input sanitises a folder name.
- **New folder makes the directory at once** (root from the header, `New folder inside` from a
  folder's menu), opens the parent, and opens the inline rename. The rename input commits once:
  Enter unmounts it and the blur that can follow must not rename the moved directory again.
- **Rename and move are one `renameSync` of the directory**, so notes, subfolders and non-note
  files travel together. Pending edits under the folder are flushed first, or a late write would
  land at the old path. The note index is rewritten under the old prefix so IDs (and the open
  note) survive; the notes' `folder` fields then follow through `remapNoteFolders` (useHistory),
  which also rewrites every undo snapshot, so a later undo of a text edit cannot restore a stale
  path and move one file back into a recreated old directory. Not an edit: nothing becomes dirty,
  no file is rewritten, no mtime moves, and the rename itself is not undoable. The watcher is
  suppressed under both directories for the write window (`suppressWatcherTree`); an event that
  escapes re-reads what is already true.
- **Delete waits for the Trash.** The notes are removed from state, the debounced flush trashes
  them, and `afterNextFlush` then asks the main process to remove the directory, which it does
  only if nothing but OS cruft is left. A folder with no notes skips the flush and goes at once.

## A note's title is its filename

- **For every persisted desktop note, the title shown equals the Markdown basename.** Drafts are
  excluded until they become files. The rule is enforced from the persistence side: `write-note`
  in `electron/noteFileManager.js` is the only place that knows the final name (collision suffix,
  invalid characters to `_`, trimmed edges, `Untitled` for a blank name, the volume's own casing)
  and answers every write with it. `useFileSystem` hands a differing answer to `useResolvedTitle`,
  which adopts it into state (`adoptNoteData`: no history entry, so Cmd+Z undoes the rename
  itself) and repaints the editor's title field, caret preserved when the user is still in it.
  Nothing in the UI second-guesses filename rules; don't add a sanitiser to an input.
- **A note's own file is never a collision.** `ensureUniqueFilePath(target, ownPath)` returns the
  own path when it is the first free candidate, so a note already at `-2` stays at `-2`. Every
  other file on disk is a collision, indexed or not.
- **A blank title under the caret is left alone.** The placeholder already reads `Untitled`, and
  filling it in would land in front of whatever is typed next; it resolves on the next write, or
  when the note is next opened. The emptied field's own `<br>` reads as "\n"; `titleFieldText()`
  is the one reading of the field, shared by the input handler and the adoption hook.
- The editor title repaints from state when the field is not focused (a sidebar rename of the
  open note); while focused the field is ahead of state and is never repainted from it.
- No inline "a note with this name already exists" validation, by decision; correctness first.

## Block drag: the gutter handle, never the text

- **Text never starts a block drag.** Text is for writing and selecting; a hover-revealed grip
  in the left gutter moves blocks. That separation is what removes the race where a pause
  before a drag-to-select reordered the block instead. Keyboard reorder
  (`Cmd/Ctrl+Shift+↑/↓`) remains the non-pointer path.
- There is **one floating handle** for the whole editor, not one per block, because every block
  root is a contentEditable and a control inside it would be inside the text. It sits in the
  column's existing left padding, so it **never overlaps prose and never shifts layout**, and it
  centres on the block's first line so it lands where the eye reads first for headings, list
  rows and multi-line paragraphs alike. Desktop only.
- **The editor stays clean at rest.** The grip is invisible until its block is hovered, hides
  on keydown and during a drag, and doesn't exist at all with fewer than two blocks. Hovering
  the grip lifts its ink and nothing else: **no hover surface**, so the gutter stays part of
  the page rather than a control strip. Reveal is CSS; don't add JS opacity handlers. The
  handle is `aria-hidden`, a pointer-only affordance with the keyboard shortcut as the
  accessible path.
- **The drag commits on drop.** While the pointer is down the note does not change: the grabbed
  block stays put at full opacity, a quiet translucent copy (no card, shadow or lift) follows
  the pointer, and a 3px accent insertion marker shows where release would put it. Release
  reorders once, as one history entry, and only if the order changed. Escape, window blur, or
  release over the sidebar cancel with nothing to undo.
- The marker sits centred in the gap between blocks, never touching prose. **The no-op position
  is drawn above the grabbed block**, never through it and never just below it, since "just
  below" reads as moving down one. The marker holds there until the pointer passes the middle
  of the next block.
- A multi-block selection containing the grabbed block drags as one run. The sidebar note pill
  is the thing that lifts with `theme.dragShadow`; the block ghost deliberately does not.
- **Deliberately absent, don't add:** a "+" beside the grip (the slash menu creates blocks), a
  click menu on the grip, a handle on mobile, an always-visible handle. The editor must keep
  reading as a document, not a block-management surface.

## Links: the caret stays outside, the tooltip waits for a rest

- **A caret at the end of a link's text is placed just after the link, on a zero-width space**
  (`CARET_ANCHOR` in `utils/domHelpers.js`, applied inside `placeCaret`). Chromium canonicalises a
  caret at a link's edge, or at the boundary before following text, to *inside* the link, and the
  next keystroke then rewrote a `[[wikilink]]`'s alias; the zero-width space is the one anchor it
  honours (probed in the real app; an empty text node is not). The anchor is scaffolding: both
  DOM→Markdown walkers drop it, `getCaretOffset` and `placeCaret` don't count it, and a repaint
  from state wipes it. Don't add a second caret placement path that bypasses `placeCaret`.
- Links only (`a`, `.wikilink`). Bold, italic and tags keep the browser's own edge behaviour, so
  typing at the end of bold text extends it, as in every editor.
- **The hover tooltip is `useLinkHoverTooltip`**: half a second at rest on a link shows its URL or
  `[[target]]`; the pending hover is an object holding the timer and the URL, and the callback
  checks it is still current before showing anything. Never hang data off a timer handle; it is a
  number in the browser and the assignment throws in strict mode.

## The slash menu is tiered

- `/` opens on eleven commands. `advanced: true` in `SLASH_COMMANDS` keeps Callout, File
  attachment and Embed note off the opening screen; typing anything after the slash searches
  everything, so `/call` still finds Callout.
- **The tier rule lives in one place, `filterSlashCommands()`**, used by both the menu and the
  keyboard navigation. A second copy is how Enter inserts a different block than the one
  highlighted.
- Order is the menu's only structure: headings, lists, then Table and Image (no typed shortcut,
  so the menu is their route), then code and quote, Divider last because `---` is faster to
  type. Most commands have typed shortcuts; weigh that before promoting anything.
- Rows are a bare Lucide glyph and a label, muted at rest and accent when selected: no chip,
  border or markdown-syntax column. The shadow is `theme.modalShadow`.
- Menus position through `positionMenu()` / `useMenuPosition`: honour the anchor, keep a
  viewport margin, flip to the other side on overflow, clamp last. Route every new popover
  through it rather than writing a fresh clamp.
- Selection is keyboard-first: opening and filtering reset to the first row, and rows take the
  selection on actual mouse movement, not `mouseenter`, because a menu can mount under a
  stationary pointer.

## The paragraph model

Blocks are Markdown structure, not source lines (`structureParagraphs` in `utils/markdown.js`).

- **A paragraph block holds every adjacent plain line**, joined by `\n`; a plain line directly
  under a list item is the item's lazy continuation. Enter makes a new paragraph, which the
  serializer separates from a paragraph or list item above it with one blank line. Shift+Enter
  inserts a soft break (`insertLineBreak`, so Chromium fires `input` and the normal commit path
  stores it) in paragraphs, list items and quotes, and acts as Enter in a heading.
- **One blank line is structure, not a row**, only between a paragraph or list item and the
  paragraph after it, and only when every blank in the run is exactly empty. Every other blank
  line, including a run holding a whitespace-only line, is an empty paragraph block, a visible
  row; the file's final newline is the empty last row. Nothing is recorded that the file does
  not say: no per-block join state, no note-level framing.
- **Quotes and callouts do not absorb.** A lazy line under a quote stays its own paragraph and
  gets no separator, because quote lines are written with `> ` and joining it would change bytes
  on save. That cost, and the blank-line rule's effect on Obsidian-style notes, are the open
  decisions in `docs/BACKLOG.md`.
- **On screen a newline is a `<br>`, and a `<br>` reads back as a newline.** `inlineMarkdownToHtml`
  gives a trailing newline a second `<br>` so the empty last line stays reachable; both
  DOM→Markdown walkers ignore a block's final `<br>`. Caret arithmetic (`getCaretOffset`,
  `placeCaret`, `caretLength`) counts a soft-break `<br>` as one character and the trailing one
  as none; never clamp a caret to `textContent.length`.
- **Three pitches, in order** (`PARAGRAPH_GAP` in `EditableBlock`, applied in `GlobalStyles`): a
  soft break is line height alone; Enter adds 12px after a paragraph or quote; an empty row adds
  a whole line, so Enter twice is twice a paragraph break. A paragraph after a list item gets the
  same 12px from a sibling rule on `data-block-type`, which every block root carries; the
  paragraph's margin lives in the stylesheet so that rule can win. The geometry test in
  `paragraph-model.spec.ts` guards the order, not the pixels.

- **One blank line before a divider is structure too**, after a paragraph or a list item: dropped on
  read, written on save, the same run rule as the paragraph separator (`takesSeparator`). Without
  it `---` under a line of text is a setext heading underline to every other reader, so the
  paragraph became a heading and the rule vanished. A blank *after* a divider stays an empty row
  (backlog: blank lines around headings). A file with the tight form still opens as a divider and
  gains the blank on its first save; sanctioned in the spec.

### Dividers are selectable blocks

- **A divider (or an image) is addressed as a whole, Notion-style** (`isSelectableBlock` in
  `utils/domHelpers.js`; the state is `selectedBlockId`, one for both). A click selects it and a
  band appears around it, the block's own box with a 4px radius reaching 4px past the text
  column each side, accent at 10% (Light) / 18% (Dark), the rule inside lifted to accent at 40%
  so it stays visible in the tint; Backspace or Delete removes it; Enter opens a paragraph under
  it; Escape deselects and moves nothing; a printable character deselects and types where the
  caret already is. No hover state, default cursor: the editor stays clean at rest, and the block
  never changes height. The alphas live in `SpacerBlock`, theme-scoped by `theme.name`.
- **The arrow keys stop on it, and Backspace from the block below selects it first.** ArrowDown
  from the last line above selects the divider, ArrowDown again puts the caret at the start of the
  next text block; ArrowUp mirrors it. Backspace at the start of the block below (empty or not)
  selects the divider instead of merging text across a line the user can see; the second Backspace
  removes it and lands the caret at the start of the next text block (the end of the previous one
  if there is none), so a third Backspace merges as it always did. Code, table, callout and file
  blocks are still stepped over (`landingBefore` / `landingAfter` in `useKeyboardHandlers`).
- **The divider's root registers itself in the block ref map** from its own effect, so the gutter
  grip can lift it and drop geometry sees it; the grip centres on the rule itself
  (`firstLineRect` in `BlockDragHandle` takes a block's `hr` as its line), where the text-line
  fallback sat it 8px low. It must not share `EditableBlock`'s `elRef`: that
  ref's repaint effect would replace the rule with a `<br>` (a parsed divider carries `text: ""`).
  `findNearestBlock` skips non-editable blocks so the mouse-up caret never lands in it.
- Deliberately absent: a hover treatment on the rule, a block menu, Duplicate or Turn into, forward
  Delete from the end of the block above (unhandled for every block).

## Paste keeps the block you are in

The rule lives in `utils/pasteBlocks.ts`, shared by the internal (`text/boojy-blocks`) and
external multi-line paste paths; single lines paste inline.

- **A block holding text never changes type on paste.** Plain text merges at the caret and keeps
  the block's type, checked state and indent; plain lines with no blank line between them stay
  together as soft breaks inside that block, and a blank line in the clipboard starts a new
  block; structured Markdown becomes its own block beside it
  (in front when the caret is at the start, splitting the text in the middle). Only an *empty*
  block is taken over, and only by structure such as `## Heading` or `- [ ] task`. A single
  structured line does that too; anywhere else a single line pastes inline as text.
- **One terminal line ending on the clipboard is incidental** and is stripped (LF or CRLF). Most
  apps copy a whole line with its break, which is why pasting used to look random. A deliberately
  copied blank line still arrives as a block.
- **A selection inside one block copies as text**, as in every other editor; structure travels
  only when the selection spans two or more blocks (a triple-click that ends at the very start of
  the next block still counts as one). Copying a list item's text and pasting it on a blank line
  therefore gives the text without the list. That looks like a missing feature; it is deliberate.
- **A paste that keeps a block's id and type must repaint that element directly**
  (`repaintKeptBlock`). The editor skips React renders for text-only changes, so a state-only
  write reaches disk but never the page, and the next keystroke writes the stale page back over it.

## Narrow desktop is still desktop

**Width changes how much room Boojy Notes has, not what it is.** The mobile navigation model is a
touch-device thing, not a width thing. Three separate questions drive layout: is this a touch
device (`useIsMobile.ts`, misnamed; rename in the backlog), does the sidebar fit
(`useSidebarFits.ts`), is the sidebar open. On a narrow desktop window the sidebar floats over
the editor as an overlay; that is the app making room, not switching identity. Narrowing a
desktop browser therefore does not preview the mobile layout; use device emulation.

## Testing notes

- `Sidebar.test.jsx` asserts the CSS reveal hooks (class names, tabIndex) rather than computed
  opacity, because jsdom can't evaluate the GlobalStyles stylesheet. Its note-row test allows
  the ··· svg and forbids only the file icon.
- `useActiveNote.test.js` guards the persistence migration; `osTrash.test.ts` the legacy
  `.trash` migration and managed-file-only deletion; `SlashMenu.test.jsx` the keyboard-first
  selection against stationary-pointer hover.
- Theme mocks need `ACCENT.onAccent` or components using it throw. `activeTabBg` and
  `settingsTab` don't exist; don't reintroduce them in mocks.
