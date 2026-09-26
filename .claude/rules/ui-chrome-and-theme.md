# UI chrome, theme and icons

Design intent and the constraints a change must not break. The code owns exact values; history
is in git and `CHANGELOG.md`. Editor behaviour: `editor.md`. Files: `files-and-watcher.md`.

## Theme and colour

`src/constants/themes.js` is the only colour authority. Never hardcode a hex in a component.

- Product terms Light / Dark / System; stored keys stay `day` / `night` / `auto` (renaming
  orphans saved preferences). Light is the first-run default for existing users; a fresh
  install starts on System.
- Neutral palettes; teal is the identity, never gold. `?tweak` (dev only) overrides live; a
  judged value goes into `themes.js`.
- **Use surfaces by role**: `BG.editor` sheet, `BG.elevated` menus/modals, `BG.standard`
  sidebar, `BG.surface` content hover, `BG.hover` row/menu hover *and* selected (hover previews
  selection), `BG.divider` borders. Text is `primary` / `secondary` / `muted`.
- **The accent is two tokens.** `ACCENT.primary` is the mark (fills, bars, markers);
  `ACCENT.text` is accent as readable ink. A label on the mark takes `ACCENT.onAccentText`;
  `onAccent` (white) is for shapes only. Must it be read? `text`; otherwise `primary`.
- **Accent is never a desktop surface**: identity, focus rings, thin markers, links, caret.
  Selected rows are neutral. The only tints: the tag pill, a mode that is on (the lit `</>`,
  a location's Active), whole-block selection.
- **Every menu's rows are pills** on `MENU_RADIUS` / `MENU_PAD` / `MENU_ROW_RADIUS`; a new menu
  uses these, never its own numbers. Separators are `MenuRule`.
- **Every ink reads on every ground it can sit on** (4.5:1 words, 3:1 a meaningful glyph),
  hover included; a label on a filled button takes its ground's `on…` token (`onAccentText`,
  `SEMANTIC.onError`). `themeContrast.test.js`; axe checks the components, contrast on, both
  themes: `e2e/accessibility.spec.ts`.
- **The focus ring is `--boojy-focus-ring` (`ACCENT.text`)**, never the mark (2:1 on Light);
  tree rows draw it inset. Keyboard focus only; never `outline: none` on a control.
- Known leaks: black alphas in some tokens, hand-picked callout/syntax colours.

## Toasts

A quiet surface (`BG.elevated`, primary text) with **one coloured glyph that carries the
meaning**; never an accent fill. `done` fades and is click-dismissable; `notice`, `warning`,
`error` wait for their ×, because a timed save failure is one nobody saw. **Notices about one
condition share a key and the newer replaces the older; a keyed notice ends when it stops being
true** (`writeRecovered`). The stack sits at the foot of the editor, not the window, so it never
covers sidebar rows. `toasts.spec.ts`.

## Scrollbars

- **Never set `scrollbar-width` / `scrollbar-color` on a bare selector**: Chromium then ignores
  every `::-webkit-scrollbar-*` rule. They live only in `@supports not
  selector(::-webkit-scrollbar)`.
- State rules set `background-color`, never `background` (it resets the clip).
- The editor keeps `scrollbar-gutter: stable` (a pane that narrowed moved the centred path).
- `.editor-scroll` stays a class: `CalloutBlock`, `TableContextMenu`, `FloatingToolbar` query it.

## Icons: Lucide only

`src/components/Icons.jsx` wraps `lucide-react`, always `currentColor`; never hand-roll an SVG
(known exceptions in `FindBar`, `CodeBlock`, the task tick). Two sizes (16 list glyphs, 18
navigation), two strokes (1.5 content, `ICON_STROKE_NAV` 2 chrome; the selection toolbar alone
2.5). Don't flatten the tiers. Hit boxes are `CHROME_BTN`.

## Window chrome

- The window is created hidden and shown on `ready-to-show` (else an empty canvas while
  loading). `first-paint.spec.ts` (CI only).
- **No title bar** (`hiddenInset`); the traffic lights sit in the sidebar header. In full screen
  they hide: ask `trafficLightsShown(fullScreen)`, never `isElectronMac` alone.
- **A drag rectangle must never lie under a control earlier in the DOM**: Chromium applies
  regions in DOM order, so a later `drag` overrides an earlier `no-drag` (Playwright never sees
  it). Regions stand down while a popup is open. `chrome-row.spec.ts`.
- One active note; no tabs. Leave the `resolveInitialActiveNote()` migration read path.
- The wordmark opens Settings. No About, Help or Recently Deleted.
- **The header ··· is the active note's menu**: Rename, Duplicate, Move to…, Version History,
  Delete, the view item, Settings, then the word count as a muted line (the desktop's only status surface). A
  view item says what it will do (`Show Markdown` / `Show Formatted`). While the Markdown view
  is on, a lit `</>` stands left of the ··· as its one mark; the path band reserves that room
  either way so the path never moves.
- **The menu bar is every command with its shortcut** (`electron/appMenu.ts`). **An item does
  nothing itself**: it sends its id (`menu-command`) and `useAppKeyboard` runs what the key runs,
  under the key's ownership rules. The window reports its state (`menu-state`) and the menu is
  rebuilt only on change. A format or kind the selection holds is checked, never a renamed
  item. Undo is not the `undo` role (the browser's undo would bypass the app's history). No
  zoom roles (they would steal the shortcut for Chromium's page zoom). Reload is dev only (it
  drops debounced typing). `app-menu.spec.ts`.
- **Every chrome control names itself with one chip, never a native `title`** (`Tooltip.tsx`):
  after `TOOLTIP_REST_MS`, at once while warm; portalled to `body` and placed via `cssZoom`
  (inside the control it was clipped). No shadow (a label is not a surface to act on). A
  shortcut is shown only where one exists and must match `useAppKeyboard`. Specs locate chrome
  by `aria-label`. `chrome-tooltips.spec.ts`.
- **Shell keys**: `⌘N`, `⇧⌘N`, `⌘P` Search, `⌘K` link (never Search), `⌘,`, `⌘\` sidebar, `⌘/`
  Markdown view, `⌘S` save point, `⌘Z`/`⇧⌘Z`, `⌘±0` UI scale, `⇧⌘L`/`E`/`R` align the caret's
  table column (claimed only in a cell), `⌃⌘S` Go to Sidebar (`⇧⌘E` is Align Centre). Sort has
  none.
- **The collapsed header carries the sidebar's three controls**; while the sidebar shows, it
  renders none, so exactly one of each exists. Only the hidden sidebar's chrome row and sticky
  block are `inert` (the whole column broke double-click rename). `header-controls.spec.ts`.

## Settings, setup and UI scale

- Settings is one pane on the palette's surface: Appearance (theme pills, Interface size),
  Storage locations, Updates. Accent never marks the chosen pill. Switching never asks. The Updates button's label is its state.
- **Interface size is one segmented control; every press applies at once** — no timer in this
  row (a debounce still moved and could overwrite newer values). The figure is an editable
  field committed on Enter/blur; an outside change cancels an unfinished edit. `stepScale` is
  the one rule shared with `Cmd+±`.
- **Settings keeps the scale it opened with** (`zoom: openedAt / uiScale`), so the pane holds
  still while the app resizes behind it. Centred by a wrapper, never a transform (a transform
  becomes the containing block for `fixed` children). A menu opened inside it portals to
  `body` and takes keys in capture. The scale keys are the one shortcut that works over
  Settings. `interface-size.spec.ts`.
- **`vw`/`vh` ignore the UI scale**: anything sized against the viewport divides by it
  (`atScale()`).
- **One zoom system**: the app's UI scale. `main.js` resets Chromium's zoom on `dom-ready`;
  judge chrome after Cmd+0. A scale shortcut always answers with `UiScaleChip`, even at the end
  of the range.
- **First-run setup** (`SetupDialog`): every way out saves the choice and never shows again;
  nothing is written until the first keystroke. `first-run.spec.ts`.

## The sidebar toggle is one slide on one clock

`tokens/motion.js` `PANEL_MS` / `PANEL_EASE` / `panelTransition()`; everything on it carries
`.panel-motion` (no travel under reduced motion). The column is its full `sidebarWidth`, never
`flex: 1`, and slides under the window edge; `transform: none` at rest. Don't add a second
duration. `sidebar-motion.spec.ts`.

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
  backdrop: the first press on a top-row button read as dead). 280px wide whatever is open.
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
  revealed on hover; never more than three glyphs).
- **The row is named after the storage location's folder** (default `Notes`; code: vault).
  It and ⌘O open `VaultMenu`, a switcher only; Settings adds, uses, reveals, removes (added
  rarely). A row: name and place (the Finder control), teal `Active` or hover `Use`, hover ×,
  which asks and moves off the open one first. `vault-switcher.spec.ts`.
- **A file that is not a note** follows its folder's notes, extension muted; a click opens it in
  its own app; its menu is Open, Show in Finder, Delete. Never renamed or dragged (a rename
  rewrites no links). The attachment store is the root's last row, a paperclip.
- The wordmark is one generated asset per theme, never the master PNG; regenerate both when
  `MARK` or `TEXT.primary` changes: `magick assets/boojy-notes-wordmark.png \( +clone -alpha
  extract \) \( -clone 0 -alpha off -fuzz 12% -fill "<MARK>" -opaque "#A4CACE" +fuzz -fill
  "<TEXT.primary>" -opaque black \) -delete 0 +swap -alpha off -compose CopyOpacity -composite
  assets/boojy-notes-wordmark-<light|dark>.png`.
- **Alignment**: `SPINE` and `TEXT_COL` in `constants/layout.js`, shared with the popup; a
  note's title starts where a folder at its depth puts its glyph; `SIDEBAR_TREE_INSET` is the
  sidebar's own and never baked into the shared constants.
- Rows are neutral `BG.hover` pills for hover and selection; the active note is never bold or
  accent. Only structure and actions get a glyph (no note icon, no chevron). An unnamed note
  reads `Untitled` muted.
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
  row's menu, Escape back to the note (not while a menu or dialog is open); ⌃⌘S lands on the
  open note's row. Focus returns to the row after a rename, to its neighbour after a delete.
  `tree-keyboard.spec.ts`.
- **Sort is a preference, not an arrangement**: Most recent means most recently *modified*
  (`recencyOf()`), never opened, so opening never reorders. `sortNoteIds` returns the same
  reference when already sorted.
- **Drag means location, not order**: dragging moves the file or directory. A mouse drag starts
  past `DRAG_THRESHOLD` with no hold; touch keeps the hold. Dropping on the editor doesn't open
  the note.

## Search is a palette, not a panel

- `SearchPalette.tsx` (Cmd+P, the Search button, a tag click): search only, every open starts
  fresh, Escape closes in one press.
- Empty: **Recent** (`utils/recentNotes.ts`, localStorage per vault, never a timestamp on the
  note). `#` lists tags; choosing one makes a filter chip (set membership, never substring).
- Rows are one line; an excerpt only when the title doesn't explain the match.
- **Matching** (`utils/search.ts`): every word must match title or body, folded for case and
  accents; ranked, **no fuzzy matching anywhere**. Enter acts on the query as typed
  (`flushSearch`).
- **One order: the array `searchNotes` returns**; never a separate display order. The desktop
  sidebar never reads the query. `search-palette.spec.ts`.

## Narrow desktop is still desktop

- **The touch layout is switched off** (`TOUCH_LAYOUT`); every device gets the desktop layout.
- The sidebar is always in the layout, never an overlay; don't bring the overlay back.
- **The sidebar yields before the note**: `sidebarWidthFor()` keeps `EDITOR_FLOOR_W`.
  `SIDEBAR_MIN_W` derives from the header row; `WINDOW_MIN_W` is imported by
  `electron/main.js`, never set by hand. Gutters shrink before text.

## Testing notes

`Sidebar.test.jsx` asserts CSS hook classes, not computed styles (jsdom). Theme mocks carry
`ACCENT.onAccent`. `activeTabBg`, `settingsTab`, `settingsFontSize` don't exist; don't
reintroduce them.
