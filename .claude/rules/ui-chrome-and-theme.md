# UI chrome, theme tokens and icons

Current-state rules for the visual layer. Read before touching `themes.js`, `Icons.jsx`, the
sidebar, the editor chrome, or anything that paints a surface. Where a rule looks like a
mistake, the clause after it says why it is deliberate. The history behind each decision is
in git and `CHANGELOG.md`, not here.

## Themes and colour

`src/constants/themes.js` is the only colour authority; never hardcode a hex in a component.
Two themes: `DAY` (light) and `NIGHT` (dark).

- `DAY` is the first-run fallback when `boojy-theme` has no saved `themeMode`; saved `day`,
  `night` and `auto` choices always win.
- User-facing copy says Light/Dark. The STORED keys stay `day`/`night`; renaming them would
  orphan every saved preference.
- Electron: `nativeTheme.themeSource` is `"system"` and the window's first-paint
  `backgroundColor` is DAY's `#FCFCFC`, so a NIGHT user gets one brief light flash at launch.
  Wiring the saved theme back to main is the fix if that ever grates.
- `DAY` is a neutral, warm-biased light palette using sibling app Picito's neutral ramp as the
  family reference, keeping Boojy's cyan. Don't introduce gold: it is Picito's brand accent.

Surface roles (`DAY`), light → dark. **Use them by role, not by which grey looks right**; a
scheme of greys named by darkness is what makes every region read as a separate boxed panel.

| Token | Light | Role |
|---|---|---|
| `BG.editor` | `#FFFFFF` | the writing sheet |
| `BG.elevated` | `#FFFFFF` | raised: menus, popovers, modals |
| `BG.darkest` | `#FCFCFC` | app ground |
| `BG.dark` | `#F9F9F9` | chrome: mobile toolbar, slash-menu chips |
| `BG.standard` | `#F9F9F9` | sidebar |
| `BG.surface` | `#F4F4F5` | **content** hover |
| `BG.hover` | `#ECECEC` | **row/menu** hover AND selected |
| `BG.divider` | `#E9E9E9` | border (ink @ 8%) |

Text: `TEXT.primary` `#14110F` (18.3:1) / `TEXT.secondary` `#47403A` (9.9:1) / `TEXT.muted`
`#7A736C` (4.6:1). Accent `#2A737D` (5.3:1 on ground, 4.6:1 on a selected row), with
`ACCENT.onAccent` for anything sitting *on* an accent fill.

- **Interaction grammar is two-tier:** content hovers to `BG.surface`; rows and menu items
  hover *and* select to `BG.hover`, so hover previews selection. When adding a hover state,
  decide which of the two it is.
- **The accent is theme-scoped.** NIGHT's `#A4CACE` is ~1.7:1 on a light ground. Never use one
  accent constant across both themes.
- **Accent is never a desktop surface.** It is identity, focus rings, 2-3px markers, wikilinks
  and the caret. Desktop selected rows are neutral. Mobile note rows keep a compact
  accent-tinted pill (`${accentColor}18` selected, `${accentColor}30` active) because the denser
  layout needs it; that is fixed product styling, not a runtime option.

### Known leaks (not yet fixed)

- `theme.overlay(a)` returns `rgba(0,0,0,a)`, not ink-tinted; ~40 leaf tokens (`inlineCode`,
  `frontmatter`, `codeCopy`, `codeLang`, `codeSelection`, `wikilinkBroken`, `calloutIconHover`)
  still use their own `rgba(0,0,0,…)` literals instead of routing through it.
- Callout (11 × 3 values) and syntax (8) colours are hand-picked per theme, not derived.
- `StarField.jsx` hardcodes `#FFFFFF` ×8, so the starfield can't work on a light ground
  (`DAY.starField: false` keeps it dormant).
- `Toast.tsx` and the `danger` branch of `ConfirmDialog` keep `color: "#fff"`: text on
  SEMANTIC status colours, deliberately outside the accent scope.

## Scrollbars

- **Never set `scrollbar-width` or `scrollbar-color` on a bare selector.** Chromium 121+
  ignores every `::-webkit-scrollbar-*` rule on any element that sets either, and nothing
  errors; the webkit block just stops existing. The standard properties live only inside
  `@supports not selector(::-webkit-scrollbar)`, which Chromium skips and Firefox takes.
- The thumb is 12px of track carrying a 7px visible pill: a `2.5px solid transparent` border
  plus `background-clip: padding-box` widens the grab target without thickening the ink. State
  rules use `background-color`, never the `background` shorthand, which resets
  `background-clip` and makes the thumb jump to full track width on hover.
- The sidebar bar (`.sidebar-scroll::-webkit-scrollbar-thumb`) re-splits that border 4px
  content-side / 1px edge-side so the ink hugs the divider. It pairs with `ROW_INSET_RIGHT = 2`:
  tree pills keep the 4px left inset but stop 2px short of the gutter. The action group's
  right inset stays 4px against the tree pills' 2px; accepted. With no overflow there is no
  gutter; accepted, `scrollbar-gutter: stable` is the candidate fix.
- Ramp is three steps, rest → hover → `:active`: DAY `#E9E9E9` → `#C9C7C5` → `#A8A5A2`, NIGHT
  `#3A3D4A` → `#4A4D5A` → `#5A5D6A`. DAY's `thumb` deliberately equals `BG.divider`. Sidebar and
  editor share one grammar, both visible at rest.
- `.editor-scroll` stays as a class: `CalloutBlock`, `TableContextMenu` and `useSidebarDrag`
  query it as a DOM hook.
- Styling `::-webkit-scrollbar` makes macOS bars non-overlay, so they take 12px of layout
  width. Check that cost before widening the track.

## Icons: Lucide only

`src/components/Icons.jsx` wraps `lucide-react` behind the historic export names
(`<SearchIcon />`, `<FolderIcon open …/>`, `<FileIcon active …/>`). Always `currentColor`.

- **Sizes are two-tier:** 16px for repeated list glyphs (folder rows, search results, menu
  items); 18px for the navigation tier (the New note / Search action glyphs and the standalone
  controls: panel toggle, editor ···, `ICON_CONTROL`). Mobile top-bar controls are 20px.
- **Stroke is two-tier:** 1.5 for editor/content icons (Lucide's default 2 reads busy at 16px
  among prose); 2 (`navBase` / `ICON_STROKE_NAV`) for navigation chrome (Search, NewNote,
  NewFolder, Folder, SidebarToggle, MoreHorizontal), which balances them against 14px labels.
- Control hit boxes are 32px (`CHROME_BTN`: toggle and ···); the New Folder header button is
  28px filling its 28px header.
- Don't flatten the tiers in either direction: rendered line weight is `stroke × size/24`, so
  equal strokes at equal sizes is what keeps the ink uniform.
- Don't hand-roll an SVG unless Lucide genuinely lacks it. The previous hand-drawn set had
  seven sizes and six stroke weights, and that inconsistency is what made the UI read as
  assembled.
- Icons inherit `color`. A wrapper that sets no `color` needs one (the sidebar `SearchIcon`
  wrapper sets `TEXT.muted` for this reason).

## Window chrome and navigation

- **There is no desktop top bar and no title bar.** The window is `hiddenInset`. On macOS
  Electron the traffic lights sit inline in the sidebar header (`trafficLightPosition x:14
  y:19` centres them on the header's 25px optical row); the wordmark shifts by
  `MAC_TRAFFIC_INSET` = 78, exported from `EditorChrome.jsx`. Move one, re-judge the other.
- The sidebar header is the window drag region (`WebkitAppRegion: drag`; wordmark and
  `ChromeButton`s opt out). Collapsed, the toggle shifts right of the lights at the same inset
  and a 14px invisible strip along the viewport top keeps the window draggable. The strip
  deliberately stops above the note label's line box (top ≈16px) so it never steals label
  clicks; don't thicken it without moving the label. Web and non-mac Electron render none of
  this (`isElectronMac` in `utils/platform.js`). Desktop and web share identical chrome
  geometry.
- **Navigation is one string.** `useActiveNote` holds the active note; opening a note replaces
  it. There are no tabs and no split view; `useSplitView`, `useTabDrag`, `PaneContainer`,
  `PaneTabBar`, `TopBarDesktop`, `SplitDivider` and `tabBarHitTest` are deleted. Restoring tabs
  means reverting that refactor, not remounting a component.
- Old `boojy-ui-state` blobs with `splitState`/`tabs` are still read in
  `resolveInitialActiveNote()` (active pane's note wins, left/top/right/bottom fallback); only
  `{ activeNote, expanded }` is written. Don't "clean up" the read side; it keeps old installs
  safe.
- Cmd-click on a wikilink is a plain click: `handleWikilinkCmdClick` aliases
  `handleWikilinkClick` in `useWikilinkHandlers.js`.
- Deleting the open note lands on an empty draft (desktop) or the sidebar (mobile). Quick Open,
  Recents and back/forward are candidates in `docs/BACKLOG.md`, not built.
- Help is unreachable and Settings has no Help entry. The old `HelpDropdown` shortcut reference
  is in git history; re-verify it against `useAppKeyboard` before reusing any of it.
- **The wordmark opens Settings directly** (`setSettingsOpen(true)`, testid
  `wordmark-settings-button`). There is no app-level dropdown, About destination or Recently
  Deleted surface.
- **Settings is a single pane** (`settings/SettingsModal.jsx`): Appearance, Storage (desktop),
  Updates, and a one-line version/credit footer. `settingsTab` does not exist in
  `SettingsContext`; don't reintroduce it in mocks. Spell check has no UI but applies from the
  stored Electron setting; UI scale is keyboard-only (`Cmd+Plus/Minus/0` in `useAppKeyboard`).
- **Delete follows the platform.** Electron sends each indexed Boojy-managed `.md` file to the
  OS Trash; web deletion is permanent behind confirmation. Folder deletion never removes or
  trashes the physical folder, so unsupported sibling files stay put. The retired private
  `.trash` gets one conservative startup migration: recognised notes are copied under
  readable, collision-safe names before the OS-trash operation, and the legacy source is
  removed only after that succeeds. Ambiguous or failed contents remain untouched and trigger a
  native warning once per distinct problem set (`legacyTrashWarnedSignature` in
  settings.json); OS cruft (`.DS_Store`) is ignored. Deleting a note that never reached disk is
  a benign no-op (`missing: true` from `trash-note`). The watcher's unlink suppression is
  event-consumed, not timed, so a slow OS trash move can't fire a spurious `file-deleted`.
- Word count is mobile-only (`EditorMoreMenu`); `useNoteStats` computes only what it consumes.
- **`syncGeneration` is editor plumbing, not cloud sync.** It tells uncontrolled
  `contentEditable` blocks when to repaint from React state. Don't remove it on the strength of
  its name.
- The sidebar drag handle is gated on `!collapsed`; rendered unconditionally, its 4px fill and
  1px border leave a hairline down the left edge.
- Undo/redo are keyboard-only (`useAppKeyboard.js`, Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z).

### The panel toggle moves between states

Expanded, it lives in the sidebar header, top-right, 12px in from the divider, opposite the
wordmark. Collapsed, `EditorChrome` renders it fixed at the viewport's top-left. It jumps on
purpose: the expanded header reads as `wordmark … toggle`. `ChromeButton` is exported from
`EditorChrome.jsx` so both sites share one button.

## Sidebar

### Primary actions and alignment

- `New note` / `Search` sit under the wordmark as plain rows: 32px tall, 12px radius, hover to
  `BG.hover` with `TEXT.primary` ink. Clicking Search swaps the row in place for the field at
  the same geometry. `New Note` at the foot of the tree is mobile-only.
- **The action group lives inside the sidebar's single scroll container as a
  `position: sticky` block** (opaque `chromeBg`, zIndex 1). Every sidebar state shares that one
  scroller so the search field keeps one DOM position across search-mode flips and can never
  remount (and drop focus) mid-typing; don't split the states back into separate scrollers.
  Entering or leaving search resets scrollTop. Rows slide under the sticky block with no
  separator; a scrolled-only hairline is the fix if that ever reads smudgy.
- **Two-column alignment:** `SPINE = 12` carries the wordmark, action icons, section header
  labels and folder icons; `TEXT_COL = 34` carries every label. Action glyphs run 18px with a
  4px gap, folder glyphs 16px with a 6px gap, both anchored on the spine. Root note rows are
  text-only, so a 22px empty gutter sits left of their titles: that is TEXT_COL alignment, not
  a missing icon. Don't "fix" it.
- Tree rows are 30px pills (12px radius, 4px left inset / 2px right, 2px gap) with neutral
  `BG.hover` for hover, selection and multi-select alike. The active note is `TEXT.primary` at
  normal weight; the pill alone carries "active", never bold, never accent. Mobile keeps its
  accent-tinted pill and bold active title.
- Section headers are 13px/700 in `TEXT.secondary`, one step quieter than row ink.

### Note rows: trailing ··· and inline rename

- Desktop note rows carry a trailing ··· opening the same menu as right-click, anchored
  `NOTE_MENU_GAP` (4px) below the row with its left edge `NOTE_MENU_SHIFT` (8px) left of the
  button, growing rightward into the editor. Both tunables sit with the row constants in
  `Sidebar.jsx`. Right-click keeps cursor placement.
- The ··· slot is **zero-width at rest** so a long title truncates against the full row width;
  while the dots are revealed (row hover/focus, or its menu open) the title re-truncates only
  20px plus the 5px gap shorter. Width and visibility are CSS (`.sidebar-note-more` in
  GlobalStyles). The width change is instant and only the ink fades (120ms); a sliding
  re-truncation reads worse than a snap. Muted ink on row hover, primary when the dots
  themselves are hovered. The row that opened the menu holds its pill, dots and slot width
  until it closes (inline styles out-specify the collapsed class).
- It is a `span role="button"` with `tabIndex={-1}`: a real button nested in the treeitem
  button fails axe `nested-interactive`. The row stays the keyboard path.
- Single-note menu items carry 16px nav-stroke glyphs (Pencil/Copy/Trash2, inheriting item ink
  so Delete's goes red); folder and bulk menus stay text-only.
- A pointer-opened menu shows no focus ring on its first item: `useFocusTrap` takes
  `initialFocus: "container"` and ContextMenu parks focus on the menu container (`tabIndex={-1}`,
  `outline: none`), because Chromium treats script focus as `:focus-visible`. Keyboard Tab and
  arrows still move real focus and indicate normally.
- **Double-click renames inline**, notes and folders alike, swapping the row for the same input
  in place. `renamingNote` sits beside `renamingFolder` in SidebarContext; the commit is
  `renameNote(id, title)` in `useNoteCrud`, mirroring the editor-title commit so persistence
  treats both identically. The note input arrives with the name selected Finder-style and
  stops pointerdown so it can't start a row drag. The ··· menu's Rename routes through
  `startNoteRename` (BoojyNotes), which falls back to focusing the editor title (caret at end,
  no select-all) only when the sidebar is hidden. Folder rows skip the toggle when
  `e.detail >= 2`; the first click's toggle stands rather than delaying single-click.

### Sections: `Folders` and `Notes`

- Two headers share one `SectionHeader` in `Sidebar.jsx`. `Folders` carries a trailing
  `FolderPlus`, the only desktop affordance for creating a folder (the `+ New Folder` tree row
  is mobile-only). `Notes` carries the sort toggle. Neither collapses, so neither has a chevron.
- Spacing: 12px above the header, 28px header, 4px down to its first row; `Folders` takes its
  12px from the action group's bottom padding. Headers scroll with their content rather than
  pinning; a pinned `Folders` lies about the rows under it once the list scrolls.
- **The desktop sidebar has TWO trees**, `role="tree" aria-label="Folders"` and
  `role="tree" aria-label="Notes"`, with the headers as siblings between them. A header (or the
  New folder button inside one) is not a legal child of `role="tree"`; a single tree fails
  axe's `aria-required-children` at critical impact, which the e2e gate catches. Mobile has no
  headers and keeps one tree wrapping its inline `New Folder` / `New Note` rows.
  `sidebarScrollRef` and the pointer-down handler stay on the outer scroller so
  `useSidebarDrag`'s `[data-note-id]` queries are unaffected.
- **Both headers always show**: `Folders` because it holds the only create affordance, `Notes`
  because it is the visible root drop target and the home of the sort control, and both are
  wanted precisely when every note has been filed. `Notes` hides only when a search matches no
  root note. The `role="tree"` under it stays conditional: an empty tree fails axe.

### Section-header controls: hidden at rest

`SectionAction` in `Sidebar.jsx` is the one component for a header's trailing control (New
folder, Sort): 28px box, 16px nav-tier glyph. Invisible at rest, revealed at 0.55 by hovering
the header (`.sidebar-section-header`) or by keyboard focus (`:focus-within`), lifted to full
`TEXT.primary` ink plus `BG.surface` when the control itself is hovered or focused. All states
are CSS (`.sidebar-section-action` in GlobalStyles); don't add JS opacity handlers, they
permanently override the class rules after the first hover. Touch devices keep the controls
always visible (`@media (hover: hover)` guards the hiding). An open menu holds its control at
full ink via the `active` prop. 0.55 is the faintest composite clearing ~3:1 on the DAY ground
(0.4 does not). Accepted tradeoff: a mouse user gets no standing hint that New folder exists
until they hover a header.

### Only structure and actions get a glyph

Note rows carry no file icon at any depth. Folders carry only the folder icon: no disclosure
chevron, the whole row toggles, the open-folder glyph plus indented children carry the state,
and `aria-expanded` is always set as the programmatic signal. The removed file icon's width is
still folded into each note row's left padding (minus the chevron allowance that came out of
both row kinds) so titles keep their column under folder names; don't "simplify" that padding
away. `FileIcon` still ships in search results, which are not tree rows.

## Note order is a preference, not a stored arrangement

- One global control orders every note list, root and folder contents alike: `Most recent`
  (Clock3) / `Alphabetical` (ArrowDownAZ), persisted in `boojy-note-sort`, defaulting to
  recency. It sits on the `Notes` header as a click-to-flip toggle: the glyph shows the CURRENT
  mode, the tooltip and aria-label's tail say what a click does ("Sorted by most recent — switch
  to alphabetical"). A third sort mode would break the toggle and bring a menu back; that is
  the accepted bet.
- **"Most recent" is last *touched*: `max(last opened here, file mtime)`**, `recencyOf()` in
  `utils/noteSort.js`. Neither half works alone: opening never writes to disk, so mtime can't
  see reading; and last-opened starts empty on an existing vault, which makes both modes
  produce the same list and reads as a broken control. mtime is also the only half that sees
  an edit made in another app. Web has no filesystem, so web notes rely on last-opened alone.
- `parseNoteFile` populates `lastModified` (one `statSync` on a file it is already reading);
  `search.js` uses it as a score tiebreak.
- Last-opened lives in `boojy-note-opened` (localStorage), never in the user's files: stamping
  a file on open would corrupt the mtime the sort depends on. It is per-machine, and a vault
  opened elsewhere regenerates note IDs so it starts over, with mtime carrying the order in the
  meantime. Notes with neither timestamp sort alphabetically at the back.
- A pure `touch` with no content change does not refresh the order: `onFileChanged` in
  `useFileSystem.js` bails when blocks, title and folder all match, which is deliberate
  anti-churn. Boojy's own writes don't refresh it either and don't need to.
- `useNoteSort` prunes its map against the live note store when it writes, which covers
  deletions, external removals and regenerated IDs in one rule. **The empty-store guard in that
  effect is load-bearing**: `noteData` is `{}` until notes finish loading, and writing then
  would erase every timestamp on launch.
- Recency is stamped in `openNote` (BoojyNotes) and in `useNoteCrud`'s `createNote` /
  `duplicateNote` / `createDraftNote`. Any future site that makes a note active needs the same
  stamp, or a just-made note sorts into the never-opened tail.
- `sortNoteIds` returns the same array reference when the order is already correct, because
  the sidebar's memo chain compares identities to decide whether to rebuild the tree. In
  `SidebarContext` the comparator reads titles from `noteDataRef`, not `noteData` in the dep
  list, or the tree would rebuild on every keystroke. Alphabetical mode does not subscribe to
  the timestamps.

### Drag means location, not order

- Dragging a note moves the real `.md` file: onto a folder row files it there, onto the
  `Notes`/root area moves it back out. It never sets a position; sort decides display order.
  Folders are always alphabetical.
- The drag ghost is a title-only pill in the row's face on `BG.elevated` with
  `theme.dragShadow`, born flat over the row and lifting over 120ms. Releasing anywhere that is
  not a folder row or the root area (including over the editor) cancels: the pill flies back
  over 200ms and nothing changes. **Dropping a note over the editor does not open it**; drag
  never navigates. Every completed or cancelled drag calls `suppressNextClick()`
  (utils/domHelpers) so the browser's trailing click can't open the lifted row.
- **Folder rows are not draggable.** Folder nesting is a future feature, not a regression.
- Existing `.boojy-meta.json` files are left untouched on disk. Nothing reads or writes their
  `noteOrder`/`folderOrder` keys, so an old arrangement stays recoverable; don't tidy them up
  and don't reintroduce a reader.

## Block drag: the gutter handle, never the text

- **Blocks move by a hover-revealed grip in the left gutter; the text never drags.** Text is for
  writing and selecting, the handle is for moving; that separation is what removes the
  hold-timer race where a pause before a drag-to-select would reorder the block. Keyboard
  reorder (`Cmd/Ctrl+Shift+↑/↓` in `useKeyboardHandlers`) is the non-pointer path.
- `BlockDragHandle.jsx` is **one** floating handle for the whole editor, not one per block:
  every block root is a contentEditable, so a control inside it would be inside the text. It
  mounts in `EditorArea` (desktop only), listens for `mousemove` on the note column
  (`columnRef`, so hovering the gutter counts), and positions a 20×24 box holding a 16px
  `GripVertical` (stroke 1.5, dots filled via `fill="currentColor"`; stroked rings smudge at
  16px) at `HANDLE_W + HANDLE_GAP` = 24px left of the block's left edge. That is inside the
  column's existing minimum padding, so it never overlaps prose and never shifts layout.
  Vertically it centres on the block's first line box (`firstLineRect`), which keeps it on the
  line the eye reads first for headings, list rows and multi-line paragraphs alike. Geometry is
  measured against a 0×0 anchor rendered beside it, so it is correct whatever positioned
  ancestor it lands in (`editorContainerRef` is `position: relative`, not the column).
- Behaviour: invisible at rest; the block whose band (its top to the next block's top) holds
  the pointer gets the grip; `keydown` on the column hides it; `body.block-dragging` hides it;
  fewer than two blocks means no grip. Pressing and moving more than 3px lifts the block
  (`startHandleDrag` in `useBlockDrag`, no timer); a press released without moving does
  nothing.
- Reveal is CSS (`.block-drag-handle` in GlobalStyles, 0 → 0.55 muted ink via `blockHandleIn`).
  Hovering the grip lifts the ink to full `TEXT.muted` and nothing else: **there is
  deliberately no hover surface**, so the gutter stays part of the page rather than a control
  strip. Don't add JS opacity handlers. The handle is `aria-hidden` with no role or tabIndex: a
  pointer-only affordance, with the keyboard shortcut as the accessible path. Cursor is `grab`
  on the grip and `grabbing` on `<body>` during a drag.
- **Deliberately absent, don't add:** a "+" beside the grip (the slash menu creates blocks), a
  click menu on the grip, a handle on mobile, an always-visible handle. The editor must keep
  reading as a document, not a block-management surface.

### The drag commits on drop

- **While the pointer is down the note does not change.** The grabbed block stays where it is
  at full opacity; a translucent copy (`GHOST_OPACITY` 0.35, a print rather than a card: no
  background, shadow, scale or lift) follows the pointer; a 3px insertion marker shows where
  release would put it. The reorder happens once, on release, with one history entry and only
  if the order actually changed.
- The marker (`.block-drop-marker` in GlobalStyles, painted on `<body>` by `useBlockDrag`) is
  `color-mix(in srgb, ACCENT.primary 40%, transparent)`, radius 1.5, spanning the block column.
  Accent is within grammar here: a marker, not a surface, and theme-scoped through the token.
  The hook reads the marker's rendered height back to centre it in the gap, so a CSS height
  change needs no JS change.
- Placement (`positionMarker`): a boundary between two blocks is drawn at the centre of the gap
  (blocks carry a 6px bottom margin, so it never touches prose); the first/last position sits
  `EDGE_GAP` (4px) beyond the outermost block. **The no-op position is always drawn ABOVE the
  grabbed block (or the whole selected run), never through it and never just below it**: the
  marker holds above the grabbed run while the pointer is anywhere over it and over the top
  half of the next block, then jumps to the first real boundary once the pointer passes that
  block's middle. A midpoint cut through the text, and the gap just below reads as "it will
  move down one" when it will not.
- Releasing outside the editor's scroll area (over the sidebar) cancels; the marker hides the
  moment the pointer crosses out (`bd.outside`). A zero-size scroll rect (no layout yet)
  disables that check rather than treating everything as outside.
- Escape and window blur cancel through `useAppKeyboard`/BoojyNotes; nothing was written, so
  `cancelBlockDrag` just fades the copy (`FADE_MS` 120) and tidies up. The hook takes no
  `popHistory`, `editorBg`, `dragShadow` or `slotBg`. Auto-scroll runs every frame and re-runs
  the marker pass, since the marker is fixed-positioned and the blocks move under a stationary
  pointer. Multi-select (a selection spanning the grabbed block) drags the run as one stacked
  copy and treats it as one block for the no-op rule. The ghost copies the source's
  `font-family`/`color` because it lives on `<body>`, which has no app font.
  `suppressNextClick()` swallows the click that follows every drop.
- `theme.dragShadow` exists in both themes for anything that *lifts* (the sidebar note pill).
  The block ghost deliberately does not lift, so it doesn't use it.

## The slash menu is tiered

- `/` opens on eleven commands. `advanced: true` in `SLASH_COMMANDS` keeps Callout, File
  attachment and Embed note off the opening screen; the moment anything is typed after the
  slash, the search runs over everything, so `/call` still finds Callout.
- **The tier rule lives in one place: `filterSlashCommands()` in `constants/data.js`**, called by
  both `SlashMenu.jsx` and the arrow-key navigation in `useKeyboardHandlers.js`. A second copy
  is how Enter ends up inserting a different block than the one highlighted.
- Order is the menu's only structure: headings, lists, then Table and Image (the two commands
  with no typed-markdown shortcut in `useInputHandler.js`, so the menu is their route), then
  code and quote, with Divider last because `---` is faster to type than the menu is to open.
  Ten of the fourteen commands have typed shortcuts (`# `, `## `, `### `, `- `, `1. `, `[] `,
  `> `, `---`, ```` ``` ````); weigh that before promoting anything.
- Rows are 34px (20px glyph plus 7px above and below) in a 300px menu: bare Lucide glyph in a
  20px column, muted at rest and accent when selected, no chip, no border, no markdown-syntax
  column. `desc` still records each block's markdown in the data; it is just not rendered. The
  shadow is `theme.modalShadow`.
- Positioning is viewport-aware: `positionMenu()` in `src/utils/menuPosition.js` plus
  `useMenuPosition` give SlashMenu, ContextMenu (including the ··· note-actions menu) and any
  future popover one rule set: honour the anchor, 8px viewport margin, flip past the anchor's
  other side when the preferred side overflows, clamp as the last resort. The slash producer
  passes the block's full rect so a flipped menu sits above the line, not over it. Route new
  menus through this instead of writing a fresh clamp.
- Selection is keyboard-first: opening `/` and changing its filter reset to index 0. Rows update
  the selection on actual mouse movement, not `mouseenter`, because a newly mounted or flipped
  menu can appear beneath a stationary pointer and must not steal the initial selection.

## Narrow desktop is still desktop

**Width changes how much room Boojy has, not what Boojy is.** The mobile navigation model is a
touch-device thing, not a width thing. Three separate questions drive layout: is this a touch
device (`useIsMobile.ts`, misnamed; the rename to `useIsTouch` is in `docs/BACKLOG.md`), does the
sidebar fit (`useSidebarFits.ts`), is the sidebar open. Below ~780px the sidebar floats over the
editor as an overlay; that is the app making room, not switching identity.

Consequence for dev work: narrowing a desktop browser does not preview the mobile layout. Use
DevTools device emulation, which emulates pointer type.

## Testing notes

- `EditorChrome.test.jsx` asserts the toggle is absent when expanded and pinned left when
  collapsed. `Sidebar.test.jsx` covers the header toggle, action rows, wordmark-to-Settings, the
  no-chevron rule, the sort toggle (flip both ways, no menu role), and the header-control CSS
  reveal hooks (class names plus tabIndex 0, not computed opacity; jsdom can't evaluate the
  GlobalStyles stylesheet). Its note-row test allows the row's ··· svg and forbids only
  `lucide-file-text`.
- `useActiveNote.test.js` covers the persistence migration; `useAppPersistence.test.js` the
  write shape; `osTrash.test.ts` the conservative legacy migration and managed-file-only
  deletion. The e2e settings flow clicks `wordmark-settings-button` directly.
  `SlashMenu.test.jsx` guards the keyboard-first selection against stationary-pointer hover.
- Theme-mocking tests need `ACCENT.onAccent` in their mock or components using it throw. The
  `activeTabBg` token and `settingsTab` context field do not exist; don't reintroduce either.
