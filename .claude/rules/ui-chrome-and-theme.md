# UI chrome, theme and icons

Design intent and the non-obvious constraints of the visual layer. The code owns the exact
implementation; this file owns the rules a change must not break, and, where a rule looks like
a mistake, the one reason it is deliberate. History is in git and `CHANGELOG.md`.

## Theme and colour

`src/constants/themes.js` is the only colour authority. Never hardcode a hex in a component.

- **Product terminology is Light / Dark / System.** The stored preference keys stay
  `day` / `night` / `auto`, and the theme objects stay `DAY` / `NIGHT`; renaming either would
  orphan saved preferences for no user benefit. Copy changes, keys don't.
- Light is the first-run default when nothing is saved; a saved choice always wins.
- Electron's first-paint `backgroundColor` is Light's ground, so a Dark user sees one brief
  light flash at launch. Wiring the saved theme back to the main process is the fix if it ever
  grates.
- The palettes are neutral, with sibling app Picito's neutral ramp as the family reference and
  Boojy Notes' cyan as its own identity. Don't introduce gold; it is Picito's brand accent.
- The star field (`StarField.jsx`, `starField` on each theme) is leaving the product in its
  own branch; don't extend it.

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
  and the caret. Desktop selected rows are neutral. Mobile note rows keep a compact
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
  `MAC_TRAFFIC_INSET` to clear them (move one, re-judge the other). The header is the window
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
- **Delete follows the platform.** Electron sends the `.md` files Boojy Notes manages to the OS Trash;
  web deletion is permanent behind confirmation. Folder deletion never touches the physical
  folder, so unsupported sibling files stay put. The retired private `.trash` gets one
  conservative startup migration into the OS Trash: recognised notes are copied under
  collision-safe names before the source is removed, ambiguous items are left untouched and
  reported once per distinct problem set, OS cruft is ignored. Deleting a note that never
  reached disk is a benign no-op, and the watcher's unlink suppression is event-consumed rather
  than timed so a slow trash move can't fire a spurious `file-deleted`.
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

- `New note` / `Search` sit under the wordmark as plain rows that hover to `BG.hover`. Clicking
  Search swaps the row in place for the field at the same geometry. The `New Note` and
  `New Folder` tree rows are mobile-only.
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

### A persisted note's title is its filename

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

### Sections: `Folders` and `Notes`

- Two headers share `SectionHeader`. `Folders` carries the only desktop New Folder affordance;
  `Notes` carries the sort toggle. Neither collapses, so neither has a chevron. Headers scroll
  with their content; a pinned `Folders` lies about the rows under it once the list scrolls.
- **Two trees, not one** (`role="tree"` for Folders and for Notes, headers as siblings between
  them). A header inside a tree fails axe `aria-required-children` at critical impact, which
  the E2E gate catches. Mobile has no headers and keeps one tree.
- **Both headers always show**, and are wanted precisely when every note has been filed.
  `Notes` hides only when a search matches no root note; the `role="tree"` under it stays
  conditional because an empty tree fails axe.
- **Section-header controls are hidden at rest** (`SectionAction`: New folder, Sort), revealed
  at 0.55 by hovering the header or by keyboard focus, full ink when the control itself is
  hovered or focused. All CSS (`.sidebar-section-action`); JS opacity handlers would override
  the class rules after the first hover. Touch devices keep them always visible. 0.55 is the
  faintest composite clearing 3:1 on the light ground. Accepted tradeoff: a mouse user has no
  standing hint that New folder exists until they hover a header.

## Note order is a preference, not a stored arrangement

- One global control orders every list, root and folders alike: Most recent / Alphabetical,
  persisted in `boojy-note-sort`, default recency. It is a click-to-flip toggle on the `Notes`
  header: the glyph shows the current mode and the label's tail says what a click does. A third
  mode would need a menu; accepted bet.
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

- Dragging a note moves the real `.md` file: onto a folder files it there, onto the `Notes` area
  moves it back out. Drag never sets a position; sort decides display order. Folders are always
  alphabetical.
- The ghost is a title-only pill that lifts in; releasing anywhere that isn't a folder or the
  root area flies it back and nothing changes. **Dropping over the editor does not open the
  note**; drag never navigates. Every drag ends by suppressing the trailing click so it can't
  open the lifted row.
- **Folder rows are not draggable.** Nesting is a future feature, not a regression.
- Existing `.boojy-meta.json` files are left untouched; nothing reads their ordering keys.
  Don't tidy them and don't reintroduce a reader.

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

## Paste keeps the block you are in

The rule lives in `utils/pasteBlocks.ts`, shared by the internal (`text/boojy-blocks`) and
external multi-line paste paths; single lines paste inline.

- **A block holding text never changes type on paste.** Plain text merges at the caret and keeps
  the block's type, checked state and indent; structured Markdown becomes its own block beside it
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
