# Editor

The rules of the custom contentEditable editor: what a change must not break, and the one
reason each rule is deliberate. `AGENTS.md` holds the four gotchas; this file holds the rest.
History is in git and `CHANGELOG.md`.

## Block drag: the gutter handle, never the text

- **Text never starts a block drag.** A hover-revealed grip in the left gutter moves blocks;
  keyboard reorder (`Cmd/Ctrl+Shift+↑/↓`) is the non-pointer path. **One floating handle** for
  the whole editor (`BlockDragHandle`), in the column's left padding so it never overlaps prose
  or shifts layout, centred on the block's first line (`firstLineRect`; a divider's `hr`).
  Desktop only, `aria-hidden`.
- **The editor stays clean at rest:** the grip is invisible until its block is hovered, hides on
  keydown and during a drag, doesn't exist with fewer than two blocks; hovering it lifts its
  ink and nothing else. Reveal is CSS. **Hidden means not hovered** (2026-09-20): the keydown
  that unmounts the grip also clears `hoveringHandle`, because an element unmounted under the
  pointer never fires mouseleave, and the stale flag muted every mousemove until the next note
  switch. **Blur cancels a press unconditionally** (`BoojyNotes` `onBlur`, both drag hooks):
  a grip press registers its window listeners at once, and guarded on `.active` a press
  followed by Cmd-Tab left them, so the next pointer movement was a phantom drag with no
  button down that hid the grip app-wide and dropped a block on the next click.
  `grip-reveal.spec.ts`.
- **The drag commits on drop.** The grabbed block stays put; a translucent copy follows the
  pointer; a 3px accent marker shows the gap. Release reorders once, one history entry, only if
  the order changed. Escape, window blur or release over the sidebar cancel. The no-op position
  is drawn *above* the grabbed block. A multi-block selection containing the grabbed block drags
  as one run.
- **Measured geometry is divided by the UI scale before it becomes a style.** The scale is CSS
  `zoom` on `<html>`; Chromium reports rects and `clientX/Y` already multiplied, and a `top` on
  an element inside the zoom is multiplied again. `cssZoom(el)` (`domHelpers`) is applied by
  the grip, the ghost and marker (`useBlockDrag`), `ContextMenu`, `PathTreeMenu`, `NotePath` and
  the selection toolbar. Not yet: the link, code, image and file menus, the table's badge and
  cell menu, `SortMenu`; judge those at 100%.
- **Frontmatter is the file's head, not a block of the body.** `reorderFloor` in
  `utils/blockOrder.ts` is the one rule (with frontmatter first, the lowest index a reorder may
  touch is 1); `moveBlock` refuses a move from or to index 0; the grip never lifts it; the drop
  target is clamped under it. It is `contentEditable=false` and the cross-block seam refuses a
  range ending in it. `frontmatter-order.spec.ts`.
- **Every root the grip can show beside must be in `blockRefs`.** Text roots register `elRef`;
  divider and table register their own root; image, file, code, callout and embed register their
  wrapper via `wholeRef` (a second ref, because `elRef`'s repaint effect would paint empty text
  over the wrapper). Only frontmatter is out, and the grip never shows beside it. A registered
  root is also a band the drop geometry can see, so a block can land above one; unregistered,
  the last three could not be moved *at all*, since the keyboard reorder needs a caret their own
  field keeps (2026-09-19). Registration is the grip's, not selection's: `isSelectableBlock` still
  leaves code, callout and file out. `image-block-drag.spec.ts`, `code-block-drag.spec.ts`.
- **Deliberately absent:** a "+" beside the grip, a click menu on it, a handle on mobile, an
  always-visible handle.

## Links: the caret stays outside

- **A caret at either edge of a link rests on a zero-width space inside a `caret-anchor` span**
  (`CARET_ANCHOR`, `makeCaretAnchor`, applied inside `placeCaret`; `anchorBeforeLink` for offset
  0 of a block that opens with a link). Chromium canonicalises a caret at a link's edge to
  *inside* it, and the next keystroke rewrote a wikilink's alias. The span marks it as
  scaffolding: the walkers drop the U+200B inside a `caret-anchor` and read text typed on it
  as prose; a U+200B anywhere else is the file's byte and is kept. Never strip the character by
  value; never add a caret placement path that bypasses `placeCaret`.
- **The browser's own caret is caught at the keystroke, not at the move.** End, a click on the
  edge and ArrowRight leave Chromium's caret inside the span; a native `beforeinput` listener
  (`useEditorFocusUX`) runs `caretOutOfLinkEnd` / `caretOutOfLinkStart` before any insertion
  outside an IME composition. Deliberately not a `selectionchange` normaliser: that re-anchors
  after every ArrowLeft back into the link, so the link's last character could never be reached.
  Links only (`a`, `.wikilink`); bold, italic and tags keep the browser's edge behaviour.
- **A wikilink click opens the note its target names, and never guesses or creates**
  (`utils/wikilinkTarget.ts`, one reading for the click, the picker and the broken mark;
  2026-09-20, three decisions Tyr took on the prototype). `[[Note#Heading]]`, `[[Note#^block]]`,
  `[[Folder/Note]]`: the part before `#` names the note, in the folder its path gives; an
  explicit path is the path (a stale one draws unresolved rather than opening a namesake;
  `noteLinkKeys` holds `folder/title` keys beside titles). The heading is ignored for now.
  **A name two notes share resolves to neither** (`wikilinkCandidates`; the renderer's title set
  leaves a shared title out, so the link draws dashed) and **a name no note has creates
  nothing**: both open the link picker on the link (`openLinkFixerRef`, `fix` mode) with the
  candidates, or `Create note` first, as its rows, and nothing happens until a row is chosen.
  A same-note heading (`[[#Intro]]`) names no note and only toasts. Rename and move rewrite
  nothing in other notes, by decision: the link breaks, draws dashed, the chip says so, and the
  click fixes it from the picker (`docs/BACKLOG.md`). `link-resolution.spec.ts`,
  `useWikilinkHandlers.test.js`.
- **One link picker for an address and a note** (`LinkPicker.tsx`, owned by `useLinkPicker`;
  2026-09-20, built from a prototype Tyr judged). Cmd+K, the toolbar's Link, a typed `[[`, a
  right-click's Edit link and a click on an unresolved link all open it. Creating is one field,
  `Paste a link or search notes…`: an address with or without its scheme (`readAddress`) is the
  first row, `Link to youtube.com`; notes whose title holds the letters follow with the folder
  muted at the right; a name no note has ends with `Create note`, under the address row, never
  in its place; a click or Enter applies, Escape or a press outside cancels. What is written:
  words selected + address → `[words](url)`; nothing selected + address → the bare URL, kept
  verbatim; words + note → `[[Target|words]]`; nothing + note → `[[Target]]`, where the target is
  the shortest that names the note and no other (`linkTargetFor`: the title, or `Folder/Title`
  for a namesake). Create makes the note in the open note's folder without opening it
  (`createNote(…, { open: false })`). **The `[[` route is the same picker, notes only** (no
  address row for `google.com`), opened by `useInputHandler`'s `wikilinkMenu` state and applied
  through `handleWikilinkSelect`, which rewrites the block from the `[[`; it takes focus, which
  retires the old rule that the wikilink menu never did. **Editing is Text and Destination**, Text
  focused and selected, no list until the destination is typed in; Enter or a press outside
  commits a valid change, Escape cancels, Tab commits nothing, and a destination that is neither
  an address nor a note is refused (the field in the error ink; a press outside then closes
  without touching the link). Remove leaves the words. The caret after a new link is placed by
  `placeCaret`, so the next keystroke is prose. **While the picker holds focus the words it will
  link wear a neutral wash** (`mark.link-picker-wash`, `theme.selectionWash`), unwrapped before
  anything is read back. Link is still not offered inside a table cell or callout (known gap).
  `link-picker.spec.ts`, `LinkPicker.test.tsx`, `linkDestination.test.ts`.
- **The destination chip** (`LinkTooltip`, `useLinkHoverTooltip`): the tooltip chip's grammar,
  4px under the link, after the 500 ms rest, on hover or when a **key** brings the caret to rest
  inside a link (a pointer-placed caret arms nothing). A web link says its URL; a note link its
  name with the folder muted beside it; a missing or shared name says so in the error ink. The
  context menu is Open, Copy (a note's *name*, never its raw target), Edit link…, Remove link;
  an unresolved link gets Fix link… and Remove link.
- **A `#tag` is a pill, and the Markdown is still `#tag`** (2026-09-20, `styles/tagPill.ts`,
  one shape for the editor's `.inline-tag` and Search's filter chip): the accent at
  `TAG_PILL_ALPHA` (14% Light / 22% Dark, a step over the selection band; a neutral grey was
  judged too faint), `ACCENT.text` ink, 1px 5px, radius 6, 0.92em. **The pill appears on the
  first letter** (`useInputHandler`, at the tag-menu detection): the block is painted by hand
  from its text and the caret put back inside the new span, once, since a text-only commit
  never repaints and `#p` stayed plain until something else did. **One tag
  grammar** (`TAG_RE` in `utils/tags.ts`: `#` at the start or after whitespace or `(`, a
  letter, then letters, marks, digits, `_`, `/`, `-`; `#café` is a tag): the renderer, the
  `#…` completion (`TAG_TAIL_RE`), Search's tag rows and the filter all read it, so a `#` the
  editor never draws as a tag is never offered as one. **What becomes a tag is not what search
  reads**: `extractAllTags` takes prose, list, quote, heading, callout and table-cell text with
  inline code, bare URLs and link addresses removed, and skips code blocks and frontmatter, so
  `#include`, `color: #fff` and `page#top` are never tags while search still finds them as
  text. **A space or punctuation typed at the end of a pill lands outside it**
  (`caretOutOfTagEnd`, from the link rules' `beforeinput` seam, for an `insertText` that
  `TAG_CHAR_RE` refuses): a text-only edit never repaints, so the character would sit in the
  pill until the next repaint; a letter stays, because the tag is growing. `tag-pill.spec.ts`.
- **A backslash escape is shown as written** (`\*not italic\*`); the walkers read text back
  verbatim, so hiding it lost it on the first edit.
- **A bare URL is linked in prose only, read as written**: the autolink pass takes the HTML a
  piece at a time and links only inside prose, decoded first, so `&gt;` ends the URL. The
  brackets of `<url>` are text; there is no angle-bracket autolink.
- The pending hover in `useLinkHoverTooltip` is an object holding the timer, never data hung
  off a timer handle.

## Typed inline formatting converts on the closing marker, and changes no bytes

- `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `==highlight==` and `***both***` become
  their element the moment the closing marker is typed (Notion's model). The literal run *is*
  the Markdown, so a conversion is a repaint of the block from its own text plus the caret
  parked after the element, and Cmd+Z is ordinary typing undo. Literal stars are typed as `\*`.
  The one byte change: `_italic_` and `__bold__` are committed in the star form; a file that
  holds `_italic_` is untouched and shows literal (backlog).
- **The trigger is the native InputEvent, never the text alone.** `typedFormatHit`
  (`utils/typedFormatting.js`) fires only on an `insertText` of one marker character outside a
  composition (a Backspace onto the fresh anchor read the block back as `**bold**` and
  converted it again). The rAF fallback and the keyboard handler pass no event.
- **The matcher is strict** (`closingFormatAt`): non-empty content with no edge whitespace, no
  opener after a backslash or after its own marker, CommonMark's intraword rule for
  underscores, collapsed caret in the block's plain text only; a suggestion menu about to open
  wins.
- **The paint is by hand and verified** (`paintTypedFormat`): after `inlineMarkdownToHtml` the
  new element is located by its Markdown prefix; when the renderer paired the markers
  differently the previous DOM and caret are put back and the block stays literal. No
  `syncGeneration` bump (the repaint would put the caret back inside the element).
  `typed-formatting.spec.ts`, `typedFormatting.test.js`.

## The selection toolbar waits for the selection to finish

- Shows on mouse-up for a pointer selection, and after `TOOLBAR_REST_MS` (300) with no further
  change for a keyboard one (`useEditorFocusUX`; nothing is set while `mouseIsDown`). Hiding is
  immediate on collapse.
- Six Lucide glyphs at 16px on `ICON_STROKE_TOOLBAR` (2.5) in 28px boxes (`FormatIcon`); named
  by `aria-label`. **Active is the glyph in the accent and nothing else**; the grey fill is
  hover's alone.
- **It shows only where it can act, and shows only what can act** (2026-09-19). A text block:
  always. A block that owns its fields: only inside a field that holds inline Markdown, and only
  while both ends of the selection are in that one field — so a callout's title, a code block's
  body and a selection across two cells show nothing. In a field it is **five** glyphs: Link is
  the editor's alone for now, and the strip drops the glyph rather than offer one that cannot
  act. Before this the strip appeared over a cell with all six live and every one of them did
  nothing (`measure()` only needed an ancestor with `data-block-id`, which the table root has).
- **Applying a format keeps the toolbar where it is**, and the hook measures the selection once
  when the toolbar appears, never again while on screen (re-measuring slid the strip under the
  pointer as Bold widened the glyphs).
- **It is centred on the selection, or as near the centre as it can be and stay whole**
  (`clampedLeft`, measured in a layout effect so the clamped centre is the first one painted).
  The scroller is `overflow-x: hidden`, so the half hanging past a narrow column was scissored,
  not merely off-centre: the strip keeps `EDGE` (8) inside the scroller's edges, and centres
  itself in a column narrower than it is.
- **The pressed glyph outranks the editor's text-only render skip.** Applying a format re-reads
  the block, which sets `textOnlyEditForEditor`, and *then* refreshes the toolbar's state, so
  `EditorArea`'s comparator decides `toolbarState` before that fast path; skipped, the accent
  waited for the 300 ms text commit to publish. The glyph's ink is not transitioned for the same
  reason (the fill's ramp is hover's).
- Resting on a button for `TOOLTIP_REST_MS` (400, `Tooltip.tsx`, the chrome row's chip too)
  shows a chip with the name and shortcut (12px/500, the app's own chip, not inverted), below
  only when it would clip (`chipWouldClip` against `.editor-scroll`). `FORMATS` in
  `FloatingToolbar.jsx` is the one place an editor shortcut is shown and must match
  `useKeyboardHandlers`; `shortcutLabel` writes `⇧⌘S` on a Mac (`isMac`, not `isElectronMac`).
  **Inline code is shown as `⌘E`** (Notion's; 2026-09-20) and `Cmd+\`` still works unshown: the
  backtick is a dead accent key on Spanish and most European layouts and reports `Dead` with
  Cmd held, so the shown shortcut must be a letter.
  `formatting-toolbar.spec.ts`.

## ATX headings share one editor path

H1–H6 render as native heading elements in `EditableBlock` with the same editing, Enter
(new paragraph; Shift+Enter acts as Enter), navigation and history. New headings use ATX
markers; imported indentation, marker spacing, trailing whitespace and closing markers live in
`headingSource` and survive text edits. Setext is deferred. Scale (`HEADING_STYLES`, primary
ink, against 15px/400 body):

| Level | Size | Weight | Top / bottom | Line height |
| --- | --- | --- | --- | --- |
| H1 | 28 | 700 | 8 / 12 | 1.3 |
| H2 | 22 | 600 | 6 / 10 | 1.35 |
| H3 | 20 | 600 | 8 / 8 | 1.35 |
| H4 | 18 | 600 | 8 / 6 | 1.35 |
| H5 | 16.5 | 600 | 8 / 4 | 1.35 |
| H6 | 15 | 700 | 8 / 4 | 1.4 |

H1/H2 keep −0.4/−0.2px letter spacing. Bold inside a heading is one step heavier
(`GlobalStyles`: 800 in H1 and H6, 700 in H2–H5).

## An empty heading names its level

`data-placeholder="Heading N"` on the heading element, shown by CSS while the element holds
nothing or only the caret's `<br>` (the paragraph placeholder's two rules, in `GlobalStyles`),
in the heading's own type because the pseudo-element inherits it; muted ink at 40%, absolute,
because Chromium draws the caret after an in-flow `::before`. **Every empty heading shows it,
focused or not**: the editor is one contentEditable so a block is never `:focus`, and Notion
shows it unfocused too. A pseudo-element, so it can never reach the file or the clipboard.
`heading-placeholder.spec.ts`, `EditableBlock.test.jsx`.

## The slash menu is tiered

- `/` opens on eleven commands. `advanced: true` in `SLASH_COMMANDS` keeps H4–H6, Callout, File
  and Embed off the opening screen; typing after the slash searches everything. **The tier rule
  lives in `filterSlashCommands()`**, used by the menu and the keyboard navigation alike.
  Order: Markdown blocks first roughly by reach, then Table and Image (`data.test.js`).
- **Each row carries its typed shortcut as a muted mono hint** (`hint`). Nine are Markdown;
  two are Boojy's own quick keys: `||| ` makes a table whose columns the pipes count, `![] `
  opens the image picker (the space lets `![alt](url)` still be typed). Both run the menu's own
  command through `executeSlashCommand`, the table passing `{ columns }`. Tier-2 blocks have no
  trigger.
- Labels are plain words (Quote, To-do list). Rows: Lucide glyph at the navigation stroke,
  label, hint; no chip or group heading.
- Menus position through `positionMenu()` / `useMenuPosition`: honour the anchor, keep a
  margin, flip on overflow, clamp last. Route every new popover through it.
- **The editor column never carries a transform.** The link, code, image and file menus and
  the table's badge are `position: fixed` inside the column, and a transformed ancestor would
  become their containing block. The fade is opacity alone. `TableContextMenu` and the callout
  picker portal to `body`. `editor-menus.spec.ts`.
- Selection is keyboard-first: opening and filtering reset to the first row; rows take the
  selection on actual mouse movement, not `mouseenter`.
- **The block you chose owns the next keystroke when it has a field of its own.** Code, Callout
  and Table (`OWNS_CARET` in `useSlashCommands`) queue their own id in `focusBlockId`; the focus
  effect, finding no text root for it, focuses the block's first field through `ownedField`
  (`domHelpers`). `handleBlockNav` uses the same helper. Divider, Image, File and Embed hand the
  caret to the paragraph under them. `slash-focus.spec.ts`.

## One edit, one block root

The editor is a single contentEditable wrapping every block root, so Chromium is willing to
merge, split or format across two React-owned roots, and the next commit then throws or the
screen and file part ways. **An edit whose reach is not confined to one block root is the
app's, made through state.**

- **The seam is the native `beforeinput` on the editor root** (`useCrossBlockEdit`), the one
  event that says which roots an edit is about to touch (`getTargetRanges()`). A range inside
  one root is left to Chromium; anything else is cancelled and, where it has a meaning in the
  block model (delete, typed text, Enter, Shift+Enter), made in state. Formatting, history and
  composition across roots are refused. React's `onBeforeInput` cannot stand in.
- **`execCommand` fires no `beforeinput`**, so every script mutation asks `scopeOf` first:
  inline formatting applies per block; Cut is copy plus the owned deletion; a cross-block paste
  is the owned replacement; a link needs one text block.
- **Bold and italic on a selection are structural wraps** (`toggleWrappingTag` with `STRONG` /
  `EM`), never `execCommand("bold")`, which decides from the *computed* style and un-bolded a
  heading's word. A wrap reaching into an existing run dissolves the partial clone. A collapsed
  caret keeps `execCommand` (residue, rare). `heading-bold.spec.ts`.
- **A block that owns its own field owns its edits** (table cell, callout, code textarea); a
  selection reaching from a text block into one is refused. **It owns its keys too**: the editor
  root's `handleEditorKeyDown` returns when the active element is a field inside it, because
  everything it does is a function of the document selection, which is stale or empty while a
  textarea holds focus (2026-09-19: an arrow pressed in a code block took focus out of it by a
  range left in another block, and a letter landed in the note's first block). The cost, taken
  knowingly: `Cmd+Shift+↑/↓` no longer reorders from inside a cell — use the grip, or the caret
  outside the block. **One exception, and only for an inline format** (2026-09-19): a field that
  holds Markdown has the document selection inside itself, so `Cmd+B` and its kin go to
  `applyFormat` before the guard returns, because it is the one applier and that is what keeps
  the strip's pressed glyph right whichever way the format was asked for. A code block's
  textarea is not such a field, so there the key is still dropped.
- **A collapsed Delete or Backspace reaching into a neighbour** merges only with a text block,
  selects a divider, image or table (the next key removes it), and refuses anything else.
  `cross-block-ownership.spec.ts`. Residue: an IME composition over a cross-block selection
  cannot be cancelled; a text drag across blocks copies; Cmd+B across blocks toggles per block.
- **Backspace in the only, empty block is prevented, never left to Chromium**, whose own
  deletion on a lone `<p><br></p>` removes the paragraph element itself: a root with no block
  while state still held one, so nothing repainted and typing went nowhere until the note was
  reopened. `cross-block-ownership.spec.ts`.

## Menus own their keys; the editor keeps the caret

- **A key a menu has consumed never reaches the editor:** `handleEditorKeyDown` returns on
  `defaultPrevented`. One rule for every menu; no per-menu special case.
- **A completion made from a native listener commits at once** (`commitNoteData`) and
  repaints; a debounced text commit would let the menu's close repaint stale text over the
  block. The tag completion paints by hand for the caret alone: it parks the caret on an
  anchor past the ending space (a caret in a collapsed trailing space put the next character
  into the tag). A non-breaking space was probed and rejected (reached the file as U+00A0).
- **Tab and Shift+Tab keep the caret on its character** (`updateBlockIndent` reads the offset
  inside the commit).
- **A triple-click selects the clicked block by the app's hand** (`selectClickedBlock` in
  `useMouseHandlers`, on `detail === 3` inside a text root). Chromium's paragraph granularity
  ends at the start of the *next* block, and on a list row that is the non-editable,
  `user-select: none` marker, which Chromium answers by collapsing the whole selection: a
  numbered item or a task selected nothing, a bullet only when a bullet followed it. The range
  is the text root's contents, so it stops at the row's end. `triple-click.spec.ts`.
- **The click's caret rescue never takes focus back** (`useMouseHandlers`): if something the
  click opened holds focus a frame later, the rescue steps aside.

## Keys and focus: the closest active surface owns them

- **A surface that takes a key prevents its default; one that reads a key checks
  `defaultPrevented` first.** The shell's shortcuts (`useAppKeyboard`) are the last listener, a
  bubble-phase window listener registered at startup. A surface therefore never listens on the
  window in the bubble phase (a listener added when it opens runs after the shell's); element
  handlers, document listeners and capture listeners all run before it.
- **An open modal dialog, or a menu that holds focus, owns every key beneath it.**
  `focusOwner()` asks the DOM: any `[aria-modal="true"]`, or the active element inside a
  `[role="menu"]` or `[role="dialog"]`. Each surface closes itself on Escape; Escape never hides
  the sidebar.
- **A native text field outside the editor owns its editing keys** (palette, rename field, find
  bar: the browser's own undo). The title field and a code textarea are inside the editor.
- **Enter activates the focused button, natively.** `ConfirmDialog` takes only Escape; the
  Trash prompt opens on its action, a permanent web deletion on Cancel.
- **A closing surface hands focus back only while it still holds it** (`useFocusTrap` cleanup).
  This is what lets Rename from a menu work: the field mounts and autofocuses in the same
  commit, and the trap must not put focus back on the row. A trap's first-item focus skips
  when focus is already inside.
- **A suggestion menu under the caret never takes focus and owns a key only while offering a
  completion.** The tag menu listens only with rows, never touches Space, and takes Enter only
  when accepting is a completion; the slash menu is opened on purpose and keeps its keys. **The
  `[[` picker is the exception** (2026-09-20): it is the link picker, a dialog with a field, and
  takes focus the moment it opens; Escape leaves the `[[` as typed and the caret after it.
- `key-ownership.spec.ts`. Not changed: Shift+Arrow at a block's edges, ArrowUp into the title,
  the link popover's position on a collapsed caret (backlog).

## One owner for note state

Note state has two copies by design: React state, and `useHistory`'s keystroke ref, which runs
ahead of state for the 300 ms text-commit debounce. **Every change goes through a `useHistory`
action, which applies it to the ref and state together; the raw setter is not exposed.** Six
actions; a seventh is a smell.

| Action | For | Undo entry |
| --- | --- | --- |
| `commitTextChange` | typing (debounced), into a paragraph or a special block's field; ends a draft at its first character | one per 500 ms burst |
| `commitNoteData` | a user edit: a block, a checkbox, a rename, a new or deleted note, a block drop | yes |
| `adoptNoteData` | a change of record: the filename a write produced, a move between folders | no |
| `applyExternalNote` | one note as the disk holds it: an outside edit, a conflict copy | drops the note's entries |
| `remapNoteFolders` | a directory rename or move | no |
| `replaceNoteData` | the whole vault: initial load, a vault switch, the rebuild after an outside delete | keeps entries for notes that still exist |

- **Undo and redo act on the open note and no other.** Both take the newest entry *for the
  active note* (`takeNewestFor`); `canUndo` / `canRedo` are the open note's, re-read through
  `onActiveNoteChanged`, and the handlers read the ref at the moment they run. The stacks are
  shared, capped at 50; navigation pushes and drops nothing. `undo-scope.spec.ts`.
- **A typing group belongs to one note** (`historyGroupNote`); leaving a note closes its group.
  **A structural commit closes it too** (`applyCommit`, 2026-09-20), as an undo does: "abc",
  Enter, "def" typed without a pause is three entries, not one. A code block's textarea lets
  `Cmd+Z`, `Shift+Cmd+Z` and `Ctrl+Y` through to the shell whichever case Shift gives the key
  (`CodeBlock`, key lower-cased; before, redo stopped there). The title's `syncGen` repaint
  keeps the caret offset while the field is focused, as a block's repaint does.
- **History is the editor's.** A snapshot restores title and blocks and keeps the live
  `folder`; a move is not undoable. Undo never conjures a note: entries for a note that is gone
  are discarded; a vault switch drops them.
- **A draft ends in the ref at the keystroke that first gives it text** (`commitTextChange`
  strips `_draft`), so the switch that discards a draft, the quit flush and the rebuild all see a
  note. `createDraftNote` and `discardDraft` are the whole lifecycle; there is no
  `promoteDraft`. `pending-edits-lifecycle.spec.ts`.
- **The rebuild after an outside delete keeps what exists only here**, from the ref: drafts and
  every note with unwritten edits, marked dirty and written.
- **A vault switch flushes, empties, then switches** (`replaceNoteData({})` and the dirty,
  deleted, conflicted and retry bookkeeping cleared before the new vault is read).
- **A version that has been written is not written again** (`prevNoteData` in `useFileSystem`
  records the object written). `note-ownership.spec.ts`.

### The DOM is painted from the ref, and a programmatic edit is read back like a keystroke

A render can be a keystroke behind the DOM (the next keystroke publishes the previous one
synchronously; the debounced commit publishes in a transition). **A text block is painted only
on a signal, from the block as the keystroke ref holds it, never from the render.**

- The signals are mount, a `syncGen` bump and a title-set change, the deps of `EditableBlock`'s
  repaint effect; it reads `latestBlock(noteDataRef)`, remembers the caret offset and puts it
  back clamped. Special blocks' fields follow the same rule through `useOwnedField`.
- **A bump alone paints nothing; a commit that publishes at once does, from anywhere.** The
  wikilink completion relies on that; the tag completion still paints by hand for the caret.
- **A text-only commit never repaints**, so a programmatic text edit goes through the DOM: edit
  the text on screen, then `domNodeToMarkdown` → `updateBlockText` (formatting, the link
  popover, Find → Replace). Replace edits the matched text node itself, the replacement is text
  never a pattern, and only text blocks are edited. `repaint-ownership.spec.ts`.
- Residue: the consume-once `textOnlyEdit` flags have no margin against a second reader; a
  spurious recompute costs a repaint, never a keystroke.

## List depth and numbering belong to the Markdown

- **Bullet markers alternate by depth in primary ink**: filled dot, hollow ring, filled again.
  No square at any depth; never the accent (the marker is typography, the checkbox a control).
  Drawn as boxes (`bulletMarkerStyle`: 6px dot, 7px ring with a 1.25px stroke, centred ~13px
  into the line box), never the `●`/`○` glyphs. Presentation only; the file's marker and
  indentation are untouched.
- `listLayout` in `utils/listStructure.ts` supplies the editor's numbers and the writer's
  prefixes: sibling counters continue across nested lists and blank rows, restart for a new
  sequence, respect an imported start; a child starts at its parent's content column.
- The reader recovers depth from indentation in context, not spaces divided by two;
  noncanonical prefixes and authored spellings stay on the blocks; a text-only edit never
  renumbers or re-indents an imported list.
- `useHistory` applies `reconcileListEdit` at the structural-commit seam: Enter, deletion,
  drag, reorder and indent repair affected ordered sequences, keeping an existing start; a new
  child sequence starts at one; a pasted list keeps its markers. Structural edits cannot skip
  depths or orphan a child. Disk adoption bypasses the repair; Undo restores the original
  markers.

## The paragraph model

Blocks are Markdown structure, not source lines (`structureParagraphs` in `utils/markdown.js`).

- **A paragraph block holds every adjacent plain line**, joined by `\n`; a plain line under a
  non-empty list item is its lazy continuation. Enter makes a new paragraph; Shift+Enter
  inserts a soft break (`insertLineBreak`) in paragraphs, list items and quotes, and acts as
  Enter in a heading.
- **Enter in a quote is a soft break, and Enter on an empty last line leaves the quote** for a
  paragraph, as an empty list item does (Obsidian's and Notion's quote; `quote-enter.spec.ts`).
  A second quote block was never a second quote on disk: adjacent quote blocks are written line
  under line and read back as one, so the split showed a second bar only until the reopen.
  `LIST_TYPES` therefore no longer holds `blockquote`. Quote text is upright in primary ink,
  the bar alone marking it; italic hid a quote's own emphasis.
- **One blank line is structure, not a row**, only between a paragraph or list item and the
  paragraph or divider after it (`takesSeparator`), and only when every blank in the run is
  exactly empty. Every other blank line is an empty paragraph block, a visible row. Without the
  blank before a divider, `---` under text is a setext underline to every other reader; a file
  with the tight form gains the blank on its first save (sanctioned in the spec).
- **Quotes and callouts do not absorb** a lazy line (quote lines are written with `> `, so
  joining would change bytes). Open decision in the backlog.
- **On screen a newline is a `<br>`**; a trailing newline gets a second `<br>` so the empty last
  line stays reachable, and both walkers ignore a block's final `<br>`. Caret arithmetic counts
  a soft-break `<br>` as one character and the trailing one as none; never clamp a caret to
  `textContent.length`.
- **Three pitches, in order** (`PARAGRAPH_GAP`, applied in `GlobalStyles`): a soft break is line
  height alone; Enter adds 8px after a paragraph or quote (and after a list item, via a
  sibling rule on `data-block-type`); an empty row adds a whole line.
- **A soft-break line that would start a block is written with its marker escaped**
  (`readsBackAsText`: `\# bar`, `\- bar`, `1\. two`, `\---`), asking the app's own parser which
  lines would open a block; nothing the parser already reads as text is escaped, so an authored
  file is never rewritten by reading it. The escape shows as written after a reopen; that
  visible difference is the one product question left. A newline in a heading is written as a
  space. `paragraph-model.spec.ts`, `markdown.test.js`, `markdownInterop.test.js`.

### A special block's field is a real field

A table cell, a callout's title or body and a code block's textarea are the block's own
fields. **What the field holds is what state holds, at the text grain, and the file never holds
a byte sequence the block's syntax cannot.**

- **Read with the editor's reader, commit on every input through `commitTextChange`**
  (`updateBlockText` for the code textarea and callout body, `updateCalloutTitle`,
  `updateTableCell`), so undo takes a 500 ms burst and the editor skips its render.
- **A field that holds inline Markdown owns its own formatting, and says so with
  `data-inline-field`** (a table cell, a callout's body; 2026-09-19). The format is wrapped
  around the selection inside the field and the field is then told with the `input` event a
  keystroke fires (`formatInlineField` in `utils/inlineFormatCommands.ts`), so the field's own
  handler is the only thing that commits it — one commit path per field, the one typing uses.
  The editor reads no block back there (a cell's text is the cell's, not the table block's), a
  selection with an end outside the field is refused, and a collapsed caret formats nothing (the
  pending style `execCommand` leaves is a text block's residue). A callout's **title** and a code
  block's textarea carry no attribute, because a `**` in either is literal. Chromium's own
  `Cmd+B` must never run in a field: it decides from the computed style, so in a header cell
  (600) it wrote a `font-weight: normal` span the walker reads as plain text and the file never
  got its `**`, while in a body cell it bolded by accident — the two halves of one bug.
  `inlineFormatCommands` holds the toggles, the shortcut map that `FORMATS` must match, and the
  one list of the formats a field carries. `special-block-fields.spec.ts`,
  `inlineFormatCommands.test.ts`.
- **A field is painted only when it does not already hold the latest committed text, and the
  keystroke ref decides** (`useOwnedField`; judged against the render, a cell was repainted and
  the keystroke lost). Forced on a `syncGen` bump. The code textarea is uncontrolled; its
  highlight overlay is painted from the input handler.
- **A structural operation on the block is a function of the block as the ref holds it**
  (`updateTableRows(noteId, blockIndex, reshape)` applies `reshape(rows, alignments)` inside the
  commit, so a pending cell edit is inside the rows it reshapes). `useTableInteractions` reads
  `dataRef` for geometry and focus only.
- **The serializer enforces the syntax.** A newline in a cell is written as `<br>` and
  `parseTableRow` maps that exact form back (`<br/>` stays text); a newline in a callout title
  is a space. In a cell, Enter moves down a row and Shift+Enter is a line break; in the callout
  title both move to the body. `special-block-fields.spec.ts`.

### Fenced code keeps its authored boundaries

Every `.code-line`, including an empty one, takes at least `1lh`, or the highlight layer and the
textarea drift apart. Backtick and tilde fences open one block; the body is literal textarea
text. `fenceSource` retains non-default opening and closing lines, including an absent closer,
and distinguishes an empty body from one blank line; the editor never normalises code. A body
edit that introduces a closing-looking line grows the fence; adding a block after an unclosed
import writes a closer. `tilde-fences.spec.ts`.

- **Every typed marker waits for its space, and Enter does what the space does**
  (`utils/blockTriggers.ts`; `useInputHandler` holds the space forms, `useKeyboardHandlers` the
  Enter ones, paragraphs only there — Enter in a list item means a new item). `# `, `- `, `1. `,
  `> `, `[] `, ` ``` `, `--- `, `||| `, `![] `: one rule, no exceptions. Three of them carry an
  argument, and **a marker that fires on its last character can never be given one** — which is
  why ` ```js ` put the language in the body until 2026-09-19 and `||||` could not ask for a
  third column. The argument is read from the marker: the fence's info string is its language,
  and a table's pipes are the row being drawn (a row of N cells is written with N+1 pipes, so
  `||| ` is two columns, `|||| ` three, clamped at `MAX_TYPED_COLUMNS`). A divider has none; its
  dash count is only CommonMark's three-or-more, so `----- ` opens the same rule `--- ` does.
  Until the space each is text, which is the only way a literal ``` or a row of pipes gets typed
  — dashes excepted, since a line of them is a thematic break in the file whatever the editor
  shows.
- **The block takes the caret into its own field**, as the slash menu's Code does; both go
  through `openCodeBlock` (`useBlockOperations`), and the divider's two routes through
  `openDivider` beside it — one owner per operation, whichever trigger asked for it.
- **The info string is kept as it was typed and resolved only for reading**: ` ```js ` stays
  `js` in the file, as it does in Obsidian where the file is the document, and the corner reads
  *JavaScript* (`canonicalLang`; `LANG_ALIAS` in `CodeBlock` answers the other question, which
  grammar highlights it, so `xml` is markup there and stays `xml` here). A word the app does not
  know is kept and read as written, with no highlighting and no row ticked. Choosing the
  language a block already has writes nothing (`sameLang`), so a menu re-pick never rewrites
  `js` to `javascript` (`utils/codeLanguage.ts`). `slash-focus.spec.ts`, `code-language.spec.ts`,
  `divider.spec.ts`, `table-block.spec.ts`, `blockTriggers.test.ts`, `codeLanguage.test.ts`.
- **The language is one list, in the app's menu grammar** (`CodeLangMenu`, from the block's
  label or its ···): Sort's rows, a check in the mark colour, `align: "end"` on `positionMenu`
  because the label sits at the block's right edge, and a letter jumps to a language. Plain
  first, then alphabetical — one editorial exception and a mechanical rule for whatever is
  added. **No glyph column**: Lucide ships no language marks, and a second icon set of brand
  logos beside a line set is what makes a UI read as assembled. **It portals to `body` and takes
  its keys on its own element.** Inside the editor's contentEditable the caret rescue pulled
  focus straight back (it only stands aside for focus that has left the editor), and a portal
  leaves the DOM but not the React tree, so Enter reached the editor's `onKeyDown` first and
  opened a block instead of choosing. `code-language.spec.ts`, `CodeLangMenu.test.tsx`.

### Tables are ragged on disk and stay ragged

- **A row holds exactly the cells its Markdown line holds**: the parser neither slices nor pads,
  and the serializer writes each row with its own cells; only the separator row follows the
  header's width. The grid is drawn as wide as the widest row (`tableColumnCount` in
  `utils/tableShape.ts`); a missing cell is drawn empty and a row gains cells only when one is
  written into it (`withCell`). An explicit column operation may pad every row to the operated
  column (`withColumnInserted`, which writes `""`, never a label); a passive open or save never
  pads. Keep the shape arithmetic in `tableShape.ts`.

### Dividers, images and tables are selectable blocks

- **Addressed as a whole, Notion-style** (`isSelectableBlock`; `selectedBlockId`). Selected, a
  band appears (`utils/selectionBand.ts`, accent at 10% / 18%); Backspace or Delete removes it
  (`deleteWholeBlock`); Enter opens a paragraph under it (a table too, the one keyboard route to
  a paragraph under a table that ends the note); Escape deselects; a printable character
  deselects and types. No hover state. A click selects a divider or image; a click on a table
  focuses the cell and **Escape from a cell selects the table** (`selectWhole`).
- **Backspace from the block below and forward Delete from the block above select it first**
  (`reachAcross`); the second press removes it. Code, callout and file blocks are still stepped
  over (`landingBefore` / `landingAfter`); extend the rule once the table has been judged live.
- **The arrows stop on a divider or image and walk into every block that keeps a field**:
  ArrowDown from above enters its first field (a table's first cell, a code block's first line),
  ArrowUp from below its end; inside the grid the arrows move between cells only at a cell's
  edges (`handleCellKeyDown`, `onBlockNav`). Code and callout joined the table on 2026-09-19
  (`hasOwnField` + `focusOwnedField`); before that they were stepped over in both directions and
  the pointer was the only way in. **Deletion keeps the older rule**: Backspace merges text, so
  it may only land where text can go and still steps over a code block (`landingBefore` vs
  `caretLandingBefore`). Shift+Arrow is never intercepted and nothing selects a range of cells,
  by decision.
- **The root registers itself in the block ref map** from its own effect (`SpacerBlock`,
  `TableBlock`), never through `EditableBlock`'s `elRef`, whose repaint would paint a `<br>` or
  empty text over it. `findNearestBlock` skips non-editable blocks.
- **Taking the caret back from a field never scrolls the note.** The editor root is one
  contentEditable spanning every block, so focusing it brings *its* top into view: leaving a code
  block or a table cell put the caret in the right place and jumped the page to the top
  (2026-09-19, measured 109 → 0 and 451 → 0). `placeCaret` focuses with `preventScroll` and then
  brings the block the caret landed in into view by the least the scroller must move;
  `focusOwnedField` does the same on the way in.
- **A caret's line is measured with `caretRect`, never the range's own rect.** A collapsed caret
  in an empty text node — an empty paragraph, a caret anchor — reports all zeros, and the arrows
  ask "first or last line of this block?" against it, so ArrowDown out of an empty paragraph
  never ran its branch at all. `caret-navigation.spec.ts`, `domHelpers.test.js`.
- Deliberately absent: a hover treatment, a block menu, Duplicate or Turn into.

### The table is a compact grid you can enter and leave

- **Content-sized, and it shrinks before it scrolls**: `width: fit-content; max-width: 100%`;
  past the column, auto layout shares width and wraps down to a **72px floor per cell**
  (`overflow-wrap: anywhere`), then scrolls inside `.table-scroller`. `min-width: 240px` on
  `.table-block`. Markdown holds no column width, so fixed resizable columns are out. Header
  bold with no fill; **no focus ring on a cell**; one 1px collapsed grid, square corners, no
  border or radius on the scroller.
- **The add-row and add-column boxes** (`ADD_BAR` 18, a Lucide plus at the navigation stroke,
  muted → primary on hover) share the grid's border line and show only while the pointer is on
  the box itself (`.table-add-bar:hover`, CSS only). Click adds one; drag adds several with the
  counter badge. A reveal on table hover was built and rejected.
- **A new column is empty.** The row and column strips (24px, click selects, hold and drag
  reorders, Backspace removes) stay invisible; the gutter grip stacks above the row strip
  (`Z.BLOCK_HANDLE`). Add hover handles if discovering the strips is a struggle in daily use.
- **The cell menu is the note-row menu's grammar, anchored to the cell** (`TableContextMenu`,
  portalled to `body`, which is why `body` carries the app font): 4px under the grid's bottom
  edge in line with the clicked column, flipping above the whole grid; arrow-to-line glyphs for
  the inserts, Trash for the deletes; ends with **Delete table** in every context. The header
  row and the last column cannot be deleted. **No alignment items**, by decision: a file's
  `:---:` renders and round-trips, but the app offers no control.
- Deliberately absent: column resizing, a header toggle, cell-range selection.
  `table-block.spec.ts`.

## Paste keeps the block you are in

`utils/pasteBlocks.ts` is shared by the internal (`text/boojy-blocks`) and external multi-line
paths; single lines paste inline.

- **A block holding text never changes type on paste.** Plain text merges at the caret; plain
  lines with no blank between them stay as soft breaks; a blank line starts a new block;
  structured Markdown becomes its own block beside it. Only an *empty* block is taken over, and
  only by structure.
- **One terminal line ending on the clipboard is incidental** and stripped.
- **A selection inside one block copies as text**; structure travels only when the selection
  wholly covers a block (`fullBlock`). Deliberate.
- **Copy writes two public formats and one private one** (`utils/clipboardCopy.ts`,
  `handleEditorCopy`). A whole-block copy: `text/plain` is the blocks' Markdown as
  `blocksToMarkdown` writes it, `text/html` their structure (headings, nested lists with
  `start`, quotes, `<pre>`, `<hr>`, tables; an image, file or embed is its `![[…]]` line). An
  ordinary selection: plain text is the visible text, HTML the inline formatting. A wikilink is
  its `[[target|display]]` notation in both; a `#tag` is text; no icon, class or data attribute
  travels. The Markdown is the app's spelling, not the file's bytes. `copy-clipboard.spec.ts`
  proves the payloads on the event's DataTransfer; paste into Obsidian and TextEdit was checked
  by hand, not automated.
- **A paste that keeps a block's id and type repaints that element directly**
  (`repaintKeptBlock`); a state-only write never reaches the page.
- **A rich single-line paste is the app's own insertion**: the HTML is sanitised to inline nodes
  (`sanitizeInlineFragment`, never a wrapper element) and inserted with `insertNode`, then the
  block is read back as after a keystroke; `insertHTML` split paragraphs and wrote U+00A0.
- **The DOM read-back is verbatim; only marked scaffolding is dropped** (`walkNode` in
  `inlineFormatting.js`, serving the live element and serialised HTML alike). A formatting
  element wraps whatever it holds, a space included; only one holding nothing is dropped. A link
  is the bare URL only when it is the editor's own autolink (`bare-url`) and its text is still
  its URL. The ↗ icon is the `external-link-icon` span. Contract: `domRoundTrip.test.js`,
  `inline-preservation.spec.ts`. Residue: a typed trailing space Chromium holds as `&nbsp;`
  reaches the file as U+00A0 when the save lands first (backlog).
