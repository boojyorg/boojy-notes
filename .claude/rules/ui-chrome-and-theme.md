# UI chrome, theme and icons

Design intent and the non-obvious constraints of the visual layer. The code owns the exact
implementation; this file owns the rules a change must not break and, where a rule looks like
a mistake, the one reason it is deliberate. History is in git and `CHANGELOG.md`. Editor
behaviour is in `editor.md`; files, the watcher and persistence in `files-and-watcher.md`.

## Theme and colour

`src/constants/themes.js` is the only colour authority. Never hardcode a hex in a component.

- Product terms are Light / Dark / System; the stored keys stay `day` / `night` / `auto` and the
  objects `DAY` / `NIGHT` (renaming would orphan saved preferences). System follows the OS
  appearance only; a saved `autoMethod` is ignored. Light is the first-run default.
- Electron's first-paint `backgroundColor` is Light's ground, so a Dark user sees one brief
  light flash at launch. Wiring the saved theme to the main process is the fix if it grates.
- The palettes are neutral. Boojy Notes' teal is its identity; never gold (Picito's accent).
  Dark is a grey ramp with small steps (sheet `#181818`, sidebar one step up, hover one more),
  grounds pure grey, ink one step warm. Every text tier clears AA on the sidebar.
- `?tweak` on a dev build mounts a colour panel (`dev/ThemeTweaker.jsx`, DEV only) that lays
  overrides over the active theme via `setThemeOverrides`. A judged value goes into `themes.js`,
  never into the panel's storage.
- No decorative background; the editor ground is `BG.editor`.

**Surface roles, Light, light → dark.** Use by role, never by which grey looks right.

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

Text is three steps (`TEXT.primary` / `secondary` / `muted`).

**The accent is two tokens.** `ACCENT.primary` is the *mark* colour, `MARK` = `#8FC1C6` in both
themes: checkbox fill, quote bar, drop markers, focus rings, selection band, switch, confirm
button, info toast, the wordmark's N. `ACCENT.onAccent` is white in both themes; at 2:1 on the
mark it is for a tick and a bold button label, never body text. `ACCENT.text` is accent *as
ink*, per theme (`#2A737D` Light, `#9CC9CE` Dark, both ≥ 4.5:1): wikilinks, `#tags`, search
hits, the active toolbar and slash-menu glyph, Settings section labels. Rule for a new use:
does it have to be *read*? Then `text`; otherwise `primary`, with `onAccent` for anything drawn
on it. `LayoutContext` hands out both as `accentColor` and `accentText`.

- **Interaction grammar is two-tier.** Content hovers to `BG.surface`; rows and menu items
  hover *and* select to `BG.hover`, so hover previews selection.
- **Accent is never a desktop surface**: identity, focus rings, 2–3px markers, wikilinks and the
  caret. Selected rows are neutral. The one tint is the selected divider's band (accent at 10%
  Light / 18% Dark). Mobile note rows keep an accent pill.

Known leaks, not yet fixed: about 26 leaf tokens use plain black alphas (Dark's `overlay()` is a
white alpha); callout and syntax colours are hand-picked per theme (Dark callout grounds are
the colour at 14% over the sheet, border 25%); `Toast` and the danger `ConfirmDialog` keep
`#fff` on semantic status colours, deliberately.

## Scrollbars

- **Never set `scrollbar-width` or `scrollbar-color` on a bare selector.** Chromium then ignores
  every `::-webkit-scrollbar-*` rule on that element. The standard properties live only inside
  `@supports not selector(::-webkit-scrollbar)`.
- The thumb is a slim pill inside a wider transparent-bordered track (`background-clip:
  padding-box`); state rules set `background-color`, never the `background` shorthand, which
  resets the clip.
- Sidebar and editor share one grammar (rest → hover → drag). No overflow means no gutter;
  `scrollbar-gutter: stable` is the fix if it grates.
- `.editor-scroll` stays as a class: `CalloutBlock`, `TableContextMenu` and `FloatingToolbar`
  query it.
- Styled webkit bars are non-overlay on macOS and take layout width.

## Icons: Lucide only

`src/components/Icons.jsx` wraps `lucide-react` behind the historic export names, always
`currentColor`. Don't hand-roll an SVG; a mixed hand-drawn set is what made the UI read as
assembled. Known exceptions, swap when touching the file: three SVGs in `FindBar` (two arrows,
a close), two in `CodeBlock` (one with a hardcoded green), the task-list tick in `EditableBlock`.

- **Two size tiers:** 16px for repeated list glyphs (rows, results, menu items), 18px for
  navigation and standalone controls. Mobile top-bar controls are 20px.
- **Two stroke tiers:** 1.5 for content, 2 for navigation chrome (`ICON_STROKE_NAV`); the slash
  menu's glyphs and the table's add bars take the navigation stroke at 16px. The selection
  toolbar alone uses 2.5 (`ICON_STROKE_TOOLBAR`). Rendered weight is `stroke × size / 24`;
  don't flatten the tiers.
- Control hit boxes are 32px (`CHROME_BTN`, `constants/layout.js`). Icons inherit `color`.

## Window chrome

- **No desktop top bar, no title bar.** The window is `hiddenInset`; on macOS the traffic
  lights sit inline in the sidebar header and the wordmark shifts by `MAC_TRAFFIC_INSET` (82;
  judge at 100% page zoom only, the lights never scale). In full screen macOS hides the lights
  and every inset that keys off them falls back to the ordinary inset: the main process answers
  `is-full-screen` and sends `full-screen-changed`; `useFullScreen` holds it in `LayoutContext`;
  ask `trafficLightsShown(fullScreen)`, never `isElectronMac` alone. Web and non-mac Electron
  render none of this.
- **Drag regions.** The sidebar header and the path band's strip between the two control
  groups (`note-path-drag`) are `app-region: drag`; controls opt out. **A drag rectangle must
  never lie under a control that comes before it in the DOM**: Chromium applies the rectangles
  in DOM order, so a later `drag` unions back over an earlier `no-drag` and the first press
  moves the window (Playwright's synthetic clicks never see it). `chrome-row.spec.ts` asserts no
  drag rectangle overlaps a chrome button in either sidebar state. While a popup is open the
  regions stand down (`html.popup-open [data-drag-region]`), so a press on the empty row can
  close it.
- **One active note.** Opening a note replaces it; no tabs or split view. Old `boojy-ui-state`
  blobs with pane state still migrate in `resolveInitialActiveNote()`; leave that read path.
- **The wordmark opens Settings** (`wordmark-settings-button`). No app dropdown, About, Help or
  Recently Deleted surface.
- **The editor header's ··· is the active note's menu and the second route to Settings**
  (`ctxMenu.type === "header"`): Rename, Duplicate, Delete, then Settings with its cog glyph and
  no rule before it; never the sidebar's multi-selection. With no note it holds Settings alone
  (`App options`, not `Note actions`). It ends with the note's word count (`note-stats`, one
  muted 11px line under the menu's only rule, never a menu item): the desktop has no status bar
  and this is the one surface that costs no pixels until asked. A menu separator, where drawn,
  is `MenuRule` (1px `BG.divider`, inset 6px), never an item's top border.
- **Undo and Redo are chrome buttons before the note's name** (Lucide `Undo2`/`Redo2`, 18px,
  navigation stroke, in `ChromeButton`), `aria-disabled` when the *open note* has nothing to
  take back (the attribute, not `disabled`, so the control still takes the pointer and focus
  and its chip still says `Undo ⌘Z`; the click is dropped in `ChromeButton`). A press keeps
  the editor's selection (`keepSelection`). Back is not undo: no straight arrows.
- **Every chrome control names itself with one chip, never a native `title`** (`Tooltip.tsx`:
  the chip, `useTooltip`, `TOOLTIP_REST_MS` 400, `shortcutLabel`). Name 13px/500 in primary
  ink; the shortcut a step smaller on a `BG.surface` pill in secondary ink; radius 8, the
  elevated ground, a hairline border and **no shadow** (a shadow reads as a surface to act on;
  a label is not one), 4px under the control. **Portalled to `body` and fixed**,
  centred on its control from the control's rect and moved in from the window's edge, the
  placement divided by `cssZoom`: drawn inside the control it was clipped at the sidebar's
  edge and hidden under the editor. Below on the window's row and the Notes row, above on the
  selection toolbar (which flips below when it would clip). `ChromeButton` and `SectionAction`
  take `label` and `shortcut`; the wordmark's says `Settings`, the toggle's `Toggle sidebar` in
  both states, Undo's `Undo` greyed or not. Shown after the rest, or at once while a
  neighbour's chip has just hidden (`TOOLTIP_WARM_MS` 300) or on keyboard focus; a press,
  Enter, Space or Escape hides it until the pointer leaves and returns. A shortcut is shown
  only where one exists (`SHORTCUTS` in `EditorChrome.jsx`, the map in `useAppKeyboard`;
  Redo is `Ctrl+Y` off a Mac). **The shell's keys** (2026-09-17): `⌘N` New note, `⇧⌘N` New
  folder at the root, `⌘P` Search, `⌘,` Settings, `⌘\` Toggle sidebar (Notion's; `⌥⌘S` is three
  keys and `⌘B` is Bold), `⌘Z`/`⇧⌘Z` history, `⌘±0` UI scale. Sort has none, by decision: a
  two-option preference opening a menu earns no key. Folder-row and note-row controls keep native titles for now.
  Specs locate chrome controls by `aria-label`, never `title`. `chrome-tooltips.spec.ts`,
  `Tooltip.test.jsx`.
- **The collapsed header carries the sidebar's own three controls** (toggle, Search, New note)
  in front of the history pair, `BTN_GAP` 2 within a group and `GROUP_GAP` 12 between. While the
  sidebar shows it owns those three and the header renders none, so exactly one of each is
  reachable. The hidden sidebar keeps its DOM; **only its chrome row and sticky action block
  are `inert`** (`inert` on the whole column swallowed a double-click's second press while the
  panel animated and broke inline rename). `header-controls.spec.ts` counts what is exposed.
- **Settings is a single pane:** Appearance (theme picker only), Storage (path, `Show in
  Finder`, `Change`), Updates, a version footer. `settingsTab` and `settingsFontSize` don't
  exist; don't reintroduce them in mocks. UI scale is keyboard-only (`Cmd+Plus/Minus/0`).
- **One zoom system: the app's own UI scale.** The View menu carries no zoom roles (a menu role
  takes the shortcut before the renderer sees it, and Chromium's page zoom ran instead);
  `main.js` resets Chromium's zoom to 0 on every `dom-ready`. A dev window that looks bigger
  than the installed app is page zoom; judge chrome geometry after Cmd+0.
- Edit → Undo / Redo keep their menu roles (Cut, Copy, Paste, Select All must stay); Cmd+Z
  reaches the renderer's own handler.
- On desktop the word count lives in the ··· menu; the touch layout shows it in its own ··· menu
  and carries Undo and Redo at its toolbar's fixed left edge.
- The sidebar drag handle is gated on the sidebar showing; unconditional, it leaves a hairline.

### The sidebar toggle is one slide on one clock

`tokens/motion.js`: `PANEL_MS` 280, ease-out `PANEL_EASE`, `panelTransition()`; every element
on it carries `.panel-motion`, which a reduced-motion user gets with no travel. The sidebar's
column is its full `sidebarWidth`, never `flex: 1`, and slides out under the window's edge
(`translateX(-width)`; `none` at rest so nothing fixed inside it gains a containing block) as
the wrapper's width closes over it, contents fading over the first half; the history pair is a
fixed block that transitions `left`; the collapsed trio fades in over the last half; the path
band's inset transitions with the pair. Don't put the sidebar back on `flex: 1` and don't add a
second duration. The one per-frame cost left is the column re-wrapping its prose (720px beside
the sidebar, 840 alone; a product choice). `sidebar-motion.spec.ts`.

The toggle sits in the sidebar header opposite the wordmark when expanded, and at the head of
`EditorChrome`'s left group when collapsed; both use `ChromeButton`.

### The note's path is centred in the chrome row

`NotePath`: `University / Archive / Todd's Note`, folders then name, 14px/400: name in
`TEXT.primary`, folders `TEXT.secondary` (buttons that lift to primary on hover), slashes
`TEXT.muted`; nothing bold, nothing accent. A root note shows its name alone, never `Notes /`.
The name is the editable file label: a click renames in place, Enter goes to the first block.
**The empty field's placeholder is CSS on the DOM** (`[data-title]:has(> br:only-child)`, as the
block's), never a class from the debounced title; it inherits the field's padding so it starts
under the caret, and the field takes the placeholder's measured width
(`--title-placeholder-width`, set by `NotePath`) while empty **and for the rest of an editing
session in which the placeholder has shown** (`data-placeholder-floor`, set on focus and input,
cleared on blur), so a short name typed over it does not snap the pill narrow and re-centre the
path per keystroke; a rename that never empties follows its text; the field fits the name once
the caret leaves. Longer names still grow both ways (Finder's rename).

- **Where it sits is CSS; what it shows is JavaScript.** The band is `position: sticky` at the
  top of `.editor-scroll` (it paints `BG.editor`, invisible at rest). Its padding is
  `chromePathInset()` on the left (where the visible control group ends, plus `PATH_AIR` 12)
  and `CHROME_PATH_RIGHT_INSET` on the right. Two flex spacers: the narrower side's basis is
  the difference between the paddings, so the path centres on the *pane* when it fits and
  slides toward the band's centre by the least it must, never over a control. No shift cap and
  no second position. Keep the inset next to the group it measures.
- What is shown is the richest form that fits (`utils/pathCrumbs.ts`: full path, then `… /`
  and the nearest folders, then `… / name`, then the name), measured by an invisible twin of
  every crumb and a `ResizeObserver`, via `getBoundingClientRect` so the UI scale cancels.
  Widening never hides a folder.
- The body column's top padding is `COLUMN_TOP` (`EditorArea`); the column never moved. Touch
  devices have no chrome row and keep the name at the head of the column.
- `note-path.spec.ts`, `chrome-row.spec.ts`, `pathCrumbs.test.ts`, `NotePath.test.jsx`.

### A folder crumb opens the sidebar's tree under itself

`PathTreeMenu` shows the clicked folder's *parent's* contents with the path down to the open
note expanded, so the note's row is there on the sidebar's active pill (`crumbScope` in
`utils/pathTree.ts`); a top-level folder shows the root; the `…` crumb shows the root with the
whole path open (never a list of ancestors or an Up control). **A root note carries a folder
glyph before its name** (`note-path-root`, a `ChromeButton`, Lucide Folder 18px, held active
while open) that opens the root with nothing expanded, so the path always has one clickable
location; visible at rest, never hover-revealed. Click only, never hover.

- **Three states on one pill:** the open note keeps the sidebar's active row; the pointer's row
  takes the same pill; once a key has moved the highlight, the highlighted row also carries a
  2px inset accent ring, gone the moment the pointer moves.
- A click on a folder row toggles it in place; a note row opens through the sidebar's own
  `openNote` and closes the popup. Expansion starts fresh each open (nothing shared with the
  sidebar's `expanded`). Contents are the sidebar's `folderTree` and root list in the tree's
  own order, drawn in the sidebar's row grammar (constants in `constants/layout.js` so the
  two cannot drift; the popup's note rows stay on `TEXT_COL` and its column on the bare
  `SPINE`, judge live before moving them). Surface is every menu's; **280px wide whatever is
  open**; at most twelve rows before it scrolls; opens with the highlighted row scrolled into
  view by the least the list must move; position divided by `cssZoom`.
- Keys are the tree grammar on a document listener: Up/Down, Right opens or steps in, Left
  closes or steps out, Enter/Space, Home/End, Escape (focus back on the crumb). **A press
  outside closes it and is not swallowed** (capture-phase document `mousedown`, no backdrop):
  with a backdrop the first press on any top-row button read as a dead button. Focus rests on
  the `role="tree"` inside a non-modal `role="dialog"`; `focusOwner` counts a focused dialog as
  a menu. Deliberately absent: hover expansion, flyouts, a back row, filtering, every file
  action (it reaches notes; the sidebar organises them).
- `breadcrumb-tree.spec.ts`, `pathTree.test.ts`, `PathTreeMenu.test.tsx`.

## Sidebar

### Rows and alignment

- **The expanded sidebar is three rows and then the tree:** the window's row (`wordmark …
  Search, toggle`), the labelled `New note` pill, and the `Notes` row carrying New folder and
  Sort. Search is a `ChromeButton` immediately left of the toggle at `BTN_GAP`, so the pair
  never changes row when the sidebar hides. The desktop panel never shows a search field or
  results; the palette owns them. `New Note` and `New Folder` tree rows are mobile-only.
- **New note is the sidebar's one labelled action** (`SidebarNewNote`): a full-width pill in
  the tree's row grammar, 32px, neutral at rest (never a filled accent button), calling the
  same root creation as Cmd+N and the collapsed header's SquarePen. One visible way to make a
  note per state.
- **Wordmark at 18px, one asset per theme** (`Wordmark.tsx`; mobile 30px). The N is `MARK`,
  "otes" is `TEXT.primary`; the master `assets/boojy-notes-wordmark.png` is never drawn. The two
  drawn files are regenerated whenever `MARK` or a theme's `TEXT.primary` moves:
  `magick assets/boojy-notes-wordmark.png \( +clone -alpha extract \) \( -clone 0 -alpha off
  -fuzz 12% -fill "<MARK>" -opaque "#A4CACE" +fuzz -fill "<TEXT.primary>" -opaque black \)
  -delete 0 +swap -alpha off -compose CopyOpacity -composite
  assets/boojy-notes-wordmark-<light|dark>.png`.
- **Two-column alignment** (`constants/layout.js`): `SPINE` carries the wordmark, action icons,
  section labels and folder glyphs; `TEXT_COL` carries labels. **A note's title starts where a
  folder at the same depth puts its glyph** (`SPINE + depth × TREE_INDENT`), so notes and
  folders at one depth share a left edge; the indent step is `TREE_INDENT = TEXT_COL − SPINE`,
  so a child's contents start under its parent's name. The sidebar's column sits
  `SIDEBAR_TREE_INSET` (6) further in than the shared spine (`TREE_SPINE`); never bake the 6
  into `SPINE` or `TEXT_COL`, which the popup shares. Rows 28px, 2px gap, 12px radius pills.
- **Indent guides:** a 1px `BG.divider` line from each open folder's glyph centre through its
  children; root notes have no glyph, so the line ending is what says the folder ends.
- **New note and the Notes row are a sticky block inside the sidebar's single scroll
  container**, painted in the sidebar's own ground. Every sidebar state shares that scroller
  so the mobile search field never remounts mid-typing.
- Tree rows are neutral `BG.hover` pills for hover, selection and multi-select alike; the
  active note is primary ink at normal weight, never bold or accent. Mobile keeps its accent
  pill and bold title. **An unnamed note reads `Untitled` in `TEXT.muted`**, never a blank row
  (a new note under the caret, a cleared name); a note really called Untitled is in the row's
  ink.
- **Only structure and actions get a glyph.** Note rows carry no file icon; folders carry the
  folder icon only, no chevron (the whole row toggles, `aria-expanded` is the signal).
  `FileIcon` still ships in the mobile search results.

### Row controls, menus and rename

- **Note rows carry a trailing ···** opening the same menu as right-click, growing rightward.
  **Folder rows carry New note and ···** at every depth (`.sidebar-folder-actions`, 44px when
  revealed): New note (labelled `New note in <folder>` so the sidebar pill's own name stays
  unique for locators) makes the note through `createNote` and **opens the folder**; ··· opens
  the folder's menu. Both slots are **zero-width at rest** so a long name truncates against
  the full row, revealed on row hover or focus and held while that row's menu is up
  (`ctxMenuFolderId`); the width change is instant and only the ink fades. The controls are
  `span role="button"` with `tabIndex={-1}` (a real button nested in the treeitem fails axe
  `nested-interactive`); the row is the keyboard path; clicks stop at the glyph.
- **The folder menu is five glyphed items, no rule: New note, New folder, Rename, Duplicate
  folder, Delete folder.** Duplicate copies the directory beside itself as `Name (copy)`,
  everything in it included, and the copy appears closed beside the original (files rule).
  Reveal in Finder is Settings → Storage's. Single-note and folder menus carry glyphs; the
  bulk menu is text-only.
- **A row's ··· hands its menu the row's rectangle** (`rowMenuAnchor`), so a menu flipped above
  a low row sits above it and the pointer on the dots is not inside Delete. The header's ···
  and right-click keep point anchors. `ContextMenu` stays mounted between opens, so its
  highlight index and Move-to submenu reset in a layout effect on every `ctxMenu`; the index is
  the one owner of a row's hover surface, and a pointer-opened menu shows no ring on its first
  item. It divides its placement by `cssZoom`. `folders.spec.ts`.
- **A note renames inline on double-click; a folder from its menu's Rename alone** (a folder's
  first click toggled it under the field). Both use the same invisible field
  (`renameFieldStyle`: no border, fill or padding, the row's font at the row's place) with the
  name selected Finder-style; the row stands down under it (`.is-renaming`: no pill, no
  trailing controls). The rename input commits once: Enter unmounts it and the blur that
  follows must not rename again. The note's ··· Rename falls back to the editor title only when
  the sidebar is hidden. Rename from a menu depends on the closing menu leaving focus with the
  field (`editor.md`, "Keys and focus").

### The Notes row

- **One header over the list, labelled `Notes`**: row height, 14px/500, `TEXT.muted`, a label
  not a heading; no chevron, it does not collapse. Hidden with the tree while a search shows.
  It is the tree's accessible name and the root drop target. The storage folder's name is not
  shown anywhere in the sidebar; it is the path in Settings → Storage.
- **The row carries New folder and Sort, hidden at rest and revealed on row hover or focus**
  (`SectionAction`, `.sidebar-section-action`, 16px so they read with the folder glyphs). Only
  the ink fades; the slot keeps its width. This is the row's third flip (hover-revealed,
  visible at rest, hidden again because the folder rows under it reveal their own pair); the
  cost is no cue at rest, accepted. Sort is a Lucide ArrowUpDown (`SortIcon`) in both modes;
  its menu (`SortMenu.tsx`, `role="menu"` named `Sort notes`, `menuitemradio`, Clock and
  ArrowDownAZ glyphs, a Check in the mark colour on the chosen one) is the two modes and
  nothing else. The pair is held revealed and Sort lit while the menu is open (`menu-open`,
  `is-active`). **Never more than three glyphs here**; anything rarer earns a menu. Not
  anywhere, by decision: Collapse all folders, Change vault folder (Settings → Storage only).
- **One `role="tree"`, the Notes row a sibling above it, never inside it** (axe
  `aria-required-children`). The desktop tree element exists only when it has rows (an empty
  tree fails axe). Folders first, alphabetical; root notes follow in the sort preference,
  exactly as inside a folder. **The root is a folder.**

## Search is a palette, not a panel

- Desktop search is `SearchPalette.tsx`: Cmd+P, the Search button, or a click on an inline
  `#tag`. **Cmd+K is the editor's link shortcut, not Search.** A 560px dialog in the top third
  over a scrim, search only: no commands, no recent list, nothing before you type. Escape,
  Enter or a click outside closes and clears the query.
- Title hits show the match in the accent and nothing else; a body hit shows one muted line of
  context with the word in the accent; every row carries its folder path muted on the right.
  No grouping by folder. A `#` with no results shows the tag chips.
- **One search, two faces.** The palette reads and writes `SidebarContext`'s search state
  (`search`, `searchResults`, `activeResultIndex`, `navigateResults`), so Enter opens the
  highlighted result and jumps to its block. The sidebar tree filters behind the scrim; mobile
  keeps its field and inline results (`isMobile` in `Sidebar.jsx`); shared parts in
  `SearchParts.tsx`. Cmd+F in-note find is separate (`FindBar`).
- **One order: the list as `searchNotes` returns it**, score then recency. Both faces draw
  `searchResults.results` in that order, `activeResultIndex` is a position in it, the
  highlighted row carries `aria-current`. Never reintroduce a display order that is not the
  array's. `search-active-row.spec.ts`.

## Note order is a preference, not a stored arrangement

- One global control orders every list: Most recent / Alphabetical, persisted in
  `boojy-note-sort`, default recency; the Sort glyph on the Notes row.
- **"Most recent" means most recently modified, never opened**: `max(edited here this session,
  file mtime)` (`recencyOf()` in `utils/noteSort.js`). `useFileSystem` stamps a note the moment
  it becomes dirty; nothing is persisted by the app. Rename and move count as modification.
  **Opening, selecting or reading a note never reorders**, which is what makes double-click
  rename safe in recency mode. `boojy-note-opened` is no longer read.
- A pure `touch` does not refresh the order. `sortNoteIds` returns the same reference when
  already ordered (the sidebar's memo chain compares identities).

### Drag means location, not order

- Dragging a note moves the real `.md` file: onto a folder files it there, onto the Notes row
  or the empty space under the tree moves it to the root. Drag never sets a position. Folders
  are always alphabetical. Dragging a folder moves its directory the same way, never into
  itself or its own subtree.
- The ghost is a title-only pill with `theme.dragShadow`; releasing anywhere that isn't a
  target flies it back. **Dropping over the editor does not open the note**; every drag ends
  by suppressing the trailing click.
- Existing `.boojy-meta.json` files are untouched and unread; don't reintroduce a reader.

## Narrow desktop is still desktop

Width changes how much room the app has, not what it is. Two separate questions drive layout:
is this a touch device (`useIsMobile.ts`, misnamed), and is the sidebar open (`collapsed` in
`LayoutContext`). Narrowing a browser does not preview mobile; use device emulation.

- **The sidebar has one presentation: in the layout, at every width.** Shown, it pushes the
  editor. The overlay sidebar (`useSidebarFits`, `overlayOpen`, a hysteresis band) is gone;
  don't bring it back to make room.
- **The sidebar yields before the note does.** The dragged width is the preference; what is
  drawn is `sidebarWidthFor(preference, innerWidth)`: capped so the editor keeps
  `EDITOR_FLOOR_W` (316), never below `SIDEBAR_MIN_W`. **The sidebar minimum is derived from the
  header row** (`SIDEBAR_HEADER_W` + `HEADER_AIR`, 225): add a control to the row and the
  minimum follows. **The window minimum is `WINDOW_MIN_W` = `SIDEBAR_MIN_W` + 4 + 316** (545),
  imported by `electron/main.js`; never set `minWidth` by hand. `chrome-row.spec.ts`.
- **The column gives up its air before its text:** gutters ramp from 56px at 800px of editor
  width to 24px at 560 (`EditorArea`); the 24px floor is the block grip's.

## Testing notes

- `Sidebar.test.jsx` asserts the CSS reveal hooks (class names, tabIndex), not computed
  opacity; jsdom can't evaluate the stylesheet.
- `useActiveNote.test.js` guards the persistence migration; `osTrash.test.ts` the legacy
  `.trash` migration; `SlashMenu.test.jsx` keyboard-first selection.
- Theme mocks should carry `ACCENT.onAccent`. `activeTabBg`, `settingsTab` and
  `settingsFontSize` don't exist; don't reintroduce them.
