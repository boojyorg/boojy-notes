# UI chrome, theme and icons

Design intent and the constraints a change must not break. The code owns exact values; history
is in git and `CHANGELOG.md`. Editor behaviour: `editor.md`. Files: `files-and-watcher.md`.

## Theme and colour

`src/constants/themes.js` is the only colour authority. Never hardcode a hex in a component.

- Product terms Light / Dark / System; stored keys stay `day` / `night` / `auto`. Existing users start on Light, a fresh install on
  System.
- Neutral palettes; teal is the identity, never gold. `?tweak` (dev only) overrides live; a
  judged value goes into `themes.js`.
- **Use surfaces by role**: `BG.editor` sheet, `BG.elevated` menus/modals, `BG.standard`
  sidebar, `BG.surface` content hover, `BG.hover` row/menu hover *and* selected, `BG.divider`
  borders. Text is `primary` / `secondary` / `muted`.
- **The accent is two tokens.** `ACCENT.primary` is the mark (fills, bars, markers);
  `ACCENT.text` is accent as readable ink. A label on the mark takes `ACCENT.onAccentText`;
  `onAccent` (white) is for shapes only. Must it be read? `text`; otherwise `primary`.
- **Accent is never a desktop surface**: identity, focus rings, thin markers, links, caret.
  Selected rows are neutral. The only tints: the tag pill, a mode that is on (the lit `</>`,
  a location's Active), a note's selection (one teal, `bandFill`, below the ==highlight==), a
  search hit's words, briefly.
- **A menu is `Menu`** (`components/Menu.tsx`): portalled, placed via `cssZoom`, keys on its own
  element (over a selection, never focused: keys in capture), rows as pills, the highlight state
  alone. A surface it cannot be uses `menuSurface`
  and `MenuRule`, never its own numbers. `Menu.test.tsx`.
- **Every ink reads on every ground it can sit on** (4.5:1 words, 3:1 a meaningful glyph),
  hover included; a label on a filled button takes its ground's `on…` token (`onAccentText`,
  `SEMANTIC.onError`). `themeContrast.test.js`, `e2e/accessibility.spec.ts` (axe,
  both themes).
- **The focus ring is `--boojy-focus-ring` (`ACCENT.text`)**, never the mark (2:1 on Light);
  tree rows draw it inset. Keyboard focus only; never `outline: none` on a control.

## Toasts

A quiet surface (`BG.elevated`, primary text) with **one coloured glyph that carries the
meaning**; never an accent fill. `done` fades (a click dismisses); `notice`, `warning`, `error`
wait for their × (a timed save failure is one nobody saw). **Notices about one condition share
a key, the newer replacing the older, and end when it stops being true** (`writeRecovered`).
The stack is centred at the editor's foot, clear of the sidebar. `toasts.spec.ts`.

## Scrollbars

- **Never set `scrollbar-width` / `scrollbar-color` on a bare selector**: Chromium then ignores
  every `::-webkit-scrollbar-*` rule. They live only in `@supports not
  selector(::-webkit-scrollbar)`.
- State rules set `background-color`, never `background` (it resets the clip).
- The editor keeps `scrollbar-gutter: stable` (a narrowing pane moved the centred path).
- `.editor-scroll` stays a class: `CalloutBlock`, `TableContextMenu`, `FloatingToolbar` query it.

## Icons: Lucide only

`src/components/Icons.jsx` wraps `lucide-react`, always `currentColor`; never hand-roll an SVG
(known exceptions in `FindBar`, `CodeBlock`, the task tick). Two sizes (list, navigation) and two
strokes (`ICON_STROKE_NAV` for chrome; the selection toolbar alone is bolder): don't flatten the
tiers. Hit boxes are `CHROME_BTN`.

## Window chrome

- The window is created hidden and shown on `ready-to-show` (else an empty canvas).
  `first-paint.spec.ts` (CI only).
- **No title bar** (`hiddenInset`); the traffic lights sit in the sidebar header. In full screen
  they hide: ask `trafficLightsShown(fullScreen)`, never `isElectronMac` alone.
- **Windows and Linux: `WindowStrip` above the Mac's row** (`hasWindowStrip`): File, Edit,
  Format, View open the real menus (`popup-menu`); Window and Help are the Mac's (⌘M, menu
  search), so four fit a narrow sidebar. The system's buttons are the overlay; each
  column's colour, the divider through it; no title. Fixed chrome stands `WINDOW_STRIP_H` lower.
- **A drag rectangle must never lie under a control earlier in the DOM**: Chromium applies
  regions in DOM order, so a later `drag` overrides an earlier `no-drag` (Playwright never sees
  it). Regions stand down while a popup is open; a surface that floats into the row (the
  selection toolbar) is `no-drag`. `chrome-row.spec.ts`.
- One active note; no tabs. Leave the `resolveInitialActiveNote()` migration read path.
- The wordmark opens Settings. No About, Help or Recently Deleted.
- **The header ··· is the active note's menu** (a row's ··· is its first group and Delete).
  While the Markdown view is on, a lit `</>` stands left of the ···; the path band reserves its
  room.
- **The menu bar is every command with its shortcut** (`electron/appMenu.ts`). **An item does
  nothing itself**: it sends its id (`menu-command`) and `useAppKeyboard` runs what the key runs,
  under the key's ownership rules. The window reports its state (`menu-state`) and the menu is
  rebuilt only on change. A held format or kind is checked. Undo is not the `undo` role (it
  bypasses the app's history); no zoom roles (they steal the UI scale's keys); Reload is dev
  only. `app-menu.spec.ts`.
- **Every chrome control names itself with one chip, never a native `title`** (`Tooltip.tsx`):
  after `TOOLTIP_REST_MS`, at once while warm; portalled to `body`, placed via `cssZoom`. No
  shadow. A shortcut shown must match `useAppKeyboard`. `chrome-tooltips.spec.ts`.
- **Shell keys live in `useAppKeyboard`.** `⌘K` is link, never Search. `⇧⌘L`/`E`/`R` align a
  table column, claimed only in a cell; Go to Sidebar is `⌃⌘S`, since `⇧⌘E` is taken. Sort has none.
- **The collapsed header carries the sidebar's three controls**; while the sidebar shows, it
  renders none, so exactly one of each exists. Only the hidden sidebar's chrome row and action
  block are `inert` (the whole column broke double-click rename). `header-controls.spec.ts`.

## Settings, setup and UI scale

- Settings is one pane on the palette's surface. Accent never marks the chosen pill.
  Switching never asks.
- **Interface size is one segmented control; every press applies at once** — no timer in this
  row (a debounce overwrote newer values). The figure is an editable
  field committed on Enter/blur; an outside change cancels an unfinished edit. `stepScale` is
  the one rule shared with `Cmd+±`.
- **Settings keeps the scale it opened with** (`zoom: openedAt / uiScale`), so the pane holds
  still. Centred by a wrapper, never a transform (it would contain the
  `fixed` children). A menu opened inside it portals to `body`, keys in capture; the scale keys
  are the one shortcut that works over Settings. `interface-size.spec.ts`.
- **`vw`/`vh` ignore the UI scale**: anything sized against the viewport divides by it
  (`atScale()`).
- **One zoom system**: the app's UI scale. `main.js` resets Chromium's zoom on `dom-ready`;
  judge chrome after Cmd+0. A scale shortcut always answers with `UiScaleChip`.
- **First-run setup** (`SetupDialog`): every way out saves the choice and never shows again;
  nothing is written until the first keystroke. `first-run.spec.ts`.

## Motion is two clocks

`tokens/motion.js`: the panel's clock moves the sidebar (`.panel-motion`); the small one
(`MOTION_*`) moves popovers, dialogs, toasts, ticks and presses; never a spring. No third clock.

- **A surface leaves by unmounting at once and leaving a copy** (`useExitGhost`: inert,
  timer-removed), never by staying mounted, which would keep its focus trap and keys. Its root
  is `position: fixed`. A menu is measured at its resting `scale` (`useMenuPosition`).
- **A press shades the button and dips an icon-only one's glyph, never scales the button**: it
  would pull its edge from under the pointer and lose an edge press. `.press` opts a control in.
- Reduced motion plays no keyframe and makes no copy; the suites run with it, `motion.spec.ts`
  without.
- The sidebar is its full `sidebarWidth`, never `flex: 1`, sliding under the window edge;
  `transform: none` at rest. `sidebar-motion.spec.ts`.

## The note's path is centred in the chrome row

- `NotePath`: folders (secondary, clickable) / name (primary, weight 500, editable, never
  accent). A root note shows its name alone.
- **The empty name's placeholder is CSS on the DOM**, never a class from debounced state; the
  field keeps the placeholder's width for the rest of an editing session in which it showed.
- **Where it sits is CSS; what it shows is JavaScript.** Sticky band with `chromePathInset()`
  and `CHROME_PATH_RIGHT_INSET`; two flex spacers centre it on the pane when it fits, never
  over a control. What fits is measured by an invisible twin (`utils/pathCrumbs.ts`).
- **The note's first line sits on the New note row's baseline, for every block type.** The
  column padding is one number (`COLUMN_TOP`, `utils/typeBaseline.ts`); a first block reaches up
  (`firstBlockLift`) rather than pushing the line down. A baseline is not canvas
  `fontBoundingBoxAscent`; probe with a zero-size inline-block. A note opens scrolled to the
  top. `note-path.spec.ts`, `editor-scroll.spec.ts`.

## A folder crumb opens the sidebar's tree under itself

- `PathTreeMenu` shows the crumb's parent's contents with the path to the open note expanded
  (`crumbScope`); `…` shows the root. A root note carries a folder glyph so the path always has
  a clickable location. Click only, never hover.
- Tree keys on a document listener; **a press outside closes and is not swallowed** (no
  backdrop: a first press on a top-row button read as dead). Fixed width.
- **Rows drag with the sidebar's drag** (`useSidebarDrag`); the head row (`data-drop-scope`) is
  the drop "up into this folder". Only folder rows and the head row are targets.
- **The same surface is the Move to… picker** (`pick`): folders only, root first, current
  folder ticked. Choosing (row body) and expanding (chevron) are separate. A folder being moved
  and its subtree are disabled in place. `breadcrumb-tree.spec.ts`, `move-to.spec.ts`.
- **Every move ends in `moveNotesTo` / `moveFolderTo`**: notes via `bulkMoveNotes`
  (`adoptNoteData`, not undoable). **The destination is shown, never announced**: revealed and
  pill-marked in the sidebar if it is showing, no toast; a sidebar drag skips the reveal.

## Sidebar

- Three rows then the tree: the window row (wordmark, Search, toggle), the `New note` pill (the
  one labelled action, neutral, never a filled accent), the vault row (New folder, Sort,
  on hover; never more than three glyphs). **Only the tree scrolls**; the rows above it share its
  drop zone (`data-drop-zone`).
- **The row is named after the storage location's folder** (default `Notes`; code: vault).
  It and ⌘O open `VaultMenu`, a switcher only; Settings adds, uses, reveals, removes. A row: name and place (the Finder control), teal `Active` or hover `Use`, hover ×,
  which asks and moves off the open one first. `vault-switcher.spec.ts`.
- **A file that is not a note** follows its folder's notes, extension muted; a click opens it in
  its own app; menu Open, Show in Finder, Delete; never renamed or dragged. The attachment
  store is the root's last row.
- The wordmark is one generated asset per theme, never the master PNG; regenerate both with
  `dev/wordmarks.sh` when `MARK` or `TEXT.primary` changes.
- **Alignment**: `SPINE` and `TEXT_COL` in `constants/layout.js`, shared with the popup; a
  note's title starts where a folder at its depth puts its glyph; `SIDEBAR_TREE_INSET` is the
  sidebar's own and never baked into the shared constants.
- Rows are neutral `BG.hover` pills for hover and selection; the active note is never bold or
  accent. Only structure and actions get a glyph. An unnamed note reads `Untitled` muted.
- Row controls (note ···, folder New note + ···) are zero-width at rest and `span
  role="button" tabIndex={-1}` (a nested button fails axe). A row's ··· passes its rectangle
  (`rowMenuAnchor`) so a flipped menu clears the row.
- A note renames inline on double-click; a folder only from its menu. The rename input commits
  once.
- One `role="tree"`, the vault row a sibling (axe). Folders first, alphabetical; the root is a
  folder.
- **The tree is one Tab stop** (roving tabindex: last focused row, else the open note).
  `visibleTreeRows` / `treeMove` (`utils/treeNav.ts`) are the order and the arrows; each row
  carries `aria-level`/`setsize`/`posinset`. Enter opens, F2 renames, ⌘⌫ deletes, Shift+F10 the
  row's menu, Escape back to the note (not under a menu or dialog); ⌃⌘S lands on the open
  row. Focus returns to the row after a rename, its neighbour after a delete.
  `tree-keyboard.spec.ts`.
- **Sort is a preference, not an arrangement**: Most recent means most recently *modified*
  (`recencyOf()`), never opened, so opening never reorders. `sortNoteIds` returns the same
  reference when already sorted.
- **Drag means location, not order**: dragging moves the file or directory. A drag starts past
  `DRAG_THRESHOLD`, no hold. Dropping on the editor doesn't open the note.

## Search is a palette, not a panel

- `SearchPalette.tsx` (Cmd+P, Search button, tag click): opens fresh; Escape closes at once.
  One-line rows; an excerpt only when the title doesn't explain the hit. Empty: **Recent**
  (`utils/recentNotes.ts`, per vault, never on the note).
- **A result is a note, a folder (own name, two at most) or a file (never the attachment
  store)**, in one order: `orderResults` (a note or file named as well as a folder stays
  first). `#` lists tags, nested (`nestTags`). A tag (exact set) or folder (subfolders in) is a
  chip; chips combine; Backspace returns the last as text. No filter buttons, dates or sort.
  Nothing matched: a Create row (none under a tag chip).
- **Matching** (`utils/search.ts`): every word or `"phrase"` in title or body, folded for case,
  accents, whitespace; **no fuzzy matching**. Enter acts on the query as typed
  (`flushSearch`). The sidebar never reads the query.
- Opening a hit tints its words (`utils/searchHighlight.ts`: a CSS highlight, never the DOM).
  `search-palette.spec.ts`.

## Narrow desktop is still desktop

- **There is no touch layout**; every device gets the desktop layout.
- The sidebar is always in the layout, never an overlay; don't bring the overlay back.
- **The sidebar yields before the note** (`sidebarWidthFor()`, `EDITOR_FLOOR_W`); `WINDOW_MIN_W`
  is imported by `electron/main.js`. **A line is at most `rhythm.measure` ems**, centred under the
  name; margins go first, then gutters.

## Testing notes

`Sidebar.test.jsx` asserts CSS hook classes, not computed styles (jsdom). Theme mocks carry
`ACCENT.onAccent`.
