# Editor

The custom contentEditable editor: what a change must not break, and the one reason each rule
is deliberate. `AGENTS.md` holds the four gotchas. Exact sizes and colours live in the code;
history in git and `CHANGELOG.md`.

## One owner for note state

Note state has two copies: React state and `useHistory`'s keystroke ref, which runs ahead of
state for the 300 ms text-commit debounce. **Every change goes through a `useHistory` action;
the raw setter is not exposed.** Six actions; a seventh is a smell.

| Action | For | Undo |
| --- | --- | --- |
| `commitTextChange` | typing (debounced); ends a draft at its first character | per 500 ms burst |
| `commitNoteData` | a user edit: block, checkbox, rename, new/deleted note, drop | yes |
| `adoptNoteData` | a change of record: the written filename, a folder move | no |
| `applyExternalNote` | a note as the disk holds it | drops its entries |
| `remapNoteFolders` | a directory rename or move | no |
| `replaceNoteData` | the whole vault: load, switch, rebuild after outside delete | keeps existing notes' |

- **Undo and redo act on the open note only** (`takeNewestFor`); stacks shared, capped at 50.
  A typing group belongs to one note and a structural commit closes it. Undo never conjures a
  deleted note; a move is not undoable. `undo-scope.spec.ts`.
- A draft ends in the ref at its first keystroke (no `promoteDraft`). The rebuild after an
  outside delete keeps drafts and dirty notes from the ref. A vault switch flushes, empties,
  then switches. A version already written is not written again. `note-ownership.spec.ts`,
  `pending-edits-lifecycle.spec.ts`.

### The DOM is painted from the ref, and a programmatic edit is read back like a keystroke

- **A text block is painted only on a signal** (mount, a `syncGen` bump, a title-set change),
  from `latestBlock(noteDataRef)`, never from the render (which can be a keystroke behind),
  caret offset restored. A bump alone paints nothing; pair it with a commit that publishes at
  once.
- **A text-only commit never repaints**, so a programmatic text edit edits the DOM and reads it
  back (`domNodeToMarkdown` → `updateBlockText`): formatting, the link popover, Find → Replace.
  `repaint-ownership.spec.ts`.

## One edit, one block root

The editor is one contentEditable over React-owned block roots; Chromium will happily edit
across two and break the next commit. **An edit that reaches beyond one block root is the
app's, made through state.**

- **The seam is the native `beforeinput` on the editor root** (`useCrossBlockEdit`,
  `getTargetRanges()`). One root: left to Chromium. More: cancelled and, for delete, text,
  Enter and Shift+Enter, done in state. React's `onBeforeInput` cannot stand in.
- **`execCommand` fires no `beforeinput`**, so script mutations ask `scopeOf` first.
- **Bold and italic are structural wraps** (`toggleWrappingTag`), never `execCommand("bold")`,
  which reads the computed style (un-bolded words inside headings). `heading-bold.spec.ts`.
- **A block with its own field owns its edits and its keys** (table cell, callout, code
  textarea): `handleEditorKeyDown` returns when focus is in a field, because its logic reads a
  document selection that is stale there. The one exception: inline-format shortcuts in a
  `data-inline-field` go to `applyFormat`.
- A collapsed Delete/Backspace into a neighbour merges only with text; it selects a divider,
  image or table. **Backspace in the only empty block is prevented** (Chromium deletes the
  `<p>` itself). `cross-block-ownership.spec.ts`.

## Keys and focus: the closest active surface owns them

- **A surface that takes a key prevents its default; one that reads a key checks
  `defaultPrevented` first.** The shell (`useAppKeyboard`) is the last, bubble-phase window
  listener; a surface never adds its own bubble-phase window listener.
- **An open modal, or a focused menu, owns every key beneath it** (`focusOwner()`). Each
  surface closes itself on Escape; Escape never hides the sidebar.
- A native text field outside the editor owns its editing keys. Enter activates the focused
  button natively.
- **A closing surface hands focus back only while it holds it, with `preventScroll`**
  (focusing the editor otherwise scrolls the note). `useFocusTrap`.
- **Suggestion menus under the caret never take focus** and own a key only while offering a
  completion; the tag menu offers only tags that start with the typed letters, never the typed
  tag itself. The `[[` picker is the exception: a dialog that takes focus.
- **A key a menu consumed never reaches the editor** (`defaultPrevented`); no per-menu special
  case.
- A completion from a native listener commits at once (`commitNoteData`). Tab/Shift+Tab keep
  the caret on its character. A triple-click selects the block, or the field it is in, by the
  app's hand (`selectClickedBlock`: Chromium's collapses on the next row's marker). The
  click's caret rescue never takes focus back.
- ArrowUp with nothing above reaches the note's name (`focusTitleEnd`), ArrowDown from it comes
  back. Shift+Arrow is always the browser's. `key-ownership.spec.ts`, `title-arrows.spec.ts`.

## Backspace sheds the kind before it merges

- Backspace at the start of a heading, list item, quote or task makes it a paragraph and nothing
  else (`DEMOTES_TO_PARAGRAPH`); an indented item outdents first; only a paragraph merges.
- Enter at the start of a heading with text opens a paragraph above.
- **Caret positions count visible characters** (`caretLength`), never Markdown length. A split
  on a soft break's edge spends the break. `enter-backspace.spec.ts`.

## Links: the caret stays outside

- **A caret at a link's edge rests on a U+200B inside a `caret-anchor` span**, placed only by
  `placeCaret`: Chromium canonicalises an edge caret to inside the link and the next keystroke
  rewrote a wikilink's alias. Walkers drop U+200B only inside a `caret-anchor`; elsewhere it is
  the file's byte. Never strip it by value; never place a caret bypassing `placeCaret`.
- **The browser's own caret is fixed at the keystroke** (`beforeinput` in `useEditorFocusUX`:
  `caretOutOfLinkEnd`/`Start`), never on `selectionchange`, which would trap ArrowLeft.
- **A wikilink click opens the note its target names; it never guesses or creates**
  (`utils/wikilinkTarget.ts`, shared by click, picker and the broken mark). An explicit path is
  the path. A name two notes share, or none, draws dashed and opens the link picker in fix mode.
  Rename and move rewrite no links, by decision. `link-resolution.spec.ts`.
- **One link picker** (`LinkPicker.tsx`, `useLinkPicker`) for Cmd+K, the toolbar, `[[`, Edit
  link and an unresolved click. Address first, then notes, `Create note` last. What it writes:
  words+URL `[words](url)`; URL alone verbatim; words+note `[[Target|words]]`; note alone
  `[[Target]]`, the shortest unambiguous target (`linkTargetFor`). Create doesn't open the note.
  The `[[` route is notes only, rewrites from the `[[`. The words being linked wear a wash that
  is unwrapped before anything is read back. Not offered in a cell or callout yet.
  `link-picker.spec.ts`.
- The destination chip (`LinkTooltip`) shows after a rest, on hover or a key-placed caret only.
- **`#tag` is a pill; the Markdown stays `#tag`.** One grammar, `TAG_RE` in `utils/tags.ts`,
  read by renderer, completion, search and filter. `extractAllTags` skips code, frontmatter,
  URLs and link addresses. The pill appears on the first letter (painted by hand). A space or
  punctuation typed at a pill's end lands outside it (`caretOutOfTagEnd`). `tag-pill.spec.ts`.
- A backslash escape is shown as written (hiding it lost it on edit). Bare URLs autolink in prose
  only; `<url>` brackets are text. **`LINK_DEST` is the one reading of a link destination**
  (balanced parentheses); bare URLs trim trailing punctuation by GitHub's rule.

## Typed inline formatting converts on the closing marker, and changes no bytes

- `**b**`, `*i*`, `` `c` ``, `~~s~~`, `==h==`, `***bi***` become elements when the closing
  marker is typed; the literal run *is* the Markdown, so it is a repaint and Cmd+Z is typing
  undo. The one byte change: `_i_`/`__b__` typed are committed in star form.
- **The trigger is the native `insertText` InputEvent of one marker character**, outside
  composition, never the text alone (Backspace re-converted). The matcher is strict
  (`closingFormatAt`). **The paint is verified** (`paintTypedFormat`): if the renderer paired
  markers differently, the old DOM and caret are restored. No `syncGeneration` bump.
  `typed-formatting.spec.ts`.
- **Block triggers wait for their space, and Enter does what the space does**
  (`utils/blockTriggers.ts`): `# `, `- `, `1. `, `> `, `[] `, ` ``` `, `--- `, `||| `, `![] `.
  The marker carries an argument (fence language, pipe count = columns + 1), which a trigger
  firing on its last character could never read.

## The selection toolbar waits for the selection to finish

- Shows on mouse-up, or after `TOOLBAR_REST_MS` of no change for a keyboard selection; hides
  immediately on collapse.
- **It shows only where it can act**: any text block; in a block with its own fields, only
  inside one `data-inline-field` field, with Link dropped.
- Measured once when shown (re-measuring slid it under the pointer); centred, clamped `EDGE`
  inside the scroller.
- Active = the glyph in the accent, nothing else. The pressed glyph outranks the text-only
  render skip in `EditorArea`'s comparator.
- **`FORMATS` in `FloatingToolbar.jsx` must match `useKeyboardHandlers`.** Inline code is shown
  as `⌘E` (the backtick is a dead key on European layouts). `formatting-toolbar.spec.ts`.

## Right-click is Cut, Copy and Paste

- `EditorContextMenu`: link actions first when on a link, then Cut, Copy, Paste (desktop only);
  in a table cell (its own host and text) Delete table last. Media and code keep their own.
- **Items run the keys' own path**: restore the captured range, then `execCommand` or the
  `paste` IPC, writing exactly what ⌘X/⌘C/⌘V do.
- **Mac text-menu behaviour** (`utils/contextSelection.ts`): outside the selection selects the
  word, inside keeps it, on no word places the caret. **The menu never takes focus**: it listens
  in document capture, so the selection stays the ordinary blue. `text-context-menu.spec.ts`.

## Block drag: the gutter handle, never the text

- **Text never starts a block drag.** One floating grip (`BlockDragHandle`) in the left
  padding, revealed by CSS on hover, desktop only, `aria-hidden`; `Cmd/Ctrl+Shift+↑/↓` is the
  keyboard path. Absent with fewer than two blocks.
- The keydown that hides the grip also clears `hoveringHandle` (an unmounted element never
  fires mouseleave). **Blur cancels a press unconditionally** (else a Cmd-Tab left a phantom
  drag). `grip-reveal.spec.ts`.
- **Commits on drop**, one history entry, only if order changed. Escape, blur or release over
  the sidebar cancel. A multi-block selection drags as one run.
- **Measured geometry is divided by `cssZoom(el)` before it becomes a style** (the UI scale is
  CSS `zoom`; rects are already scaled). Not yet applied to the link/code/image/file menus, the
  table's badge and cell menu, `SortMenu`.
- **Frontmatter is never moved** (`reorderFloor`, `moveBlock` refuses index 0).
  `frontmatter-order.spec.ts`.
- **Every root the grip can show beside is in `blockRefs`**; media, code and callout register
  via `wholeRef`, not `elRef` (whose repaint would paint over the wrapper).

## Menus

- **The slash menu is tiered**: `advanced: true` keeps H4–H6, Callout, File, Embed off the
  opening screen; the rule lives in `filterSlashCommands()` for both menu and keys. Rows show
  their typed shortcut as a hint. Rows take selection on real mouse movement, not `mouseenter`.
- **Route every popover through `positionMenu()` / `useMenuPosition`.**
- **Every menu's keys are one rule** (`useMenuKeys`, `utils/menuKeys.ts`): arrows wrap past
  disabled rows, Home/End, Enter and Space choose, Escape closes, a letter jumps; only where a
  menu listens differs. A suggestion under the caret (`suggestion: true`: tag, callout type; the
  slash menu steps with `stepIndex` in the editor's handler) leaves Space, letters, Home and End
  to typing and is a `listbox` of `option`s (a `menuitem` cannot be selected).
  `menuKeys.test.ts`, `callout-picker.spec.ts`.
- **The editor column never carries a transform** (it would contain the `fixed` menus). `editor-menus.spec.ts`.
- **A chosen block with its own field takes the caret** (`hasOwnField` in `useSlashCommands`: Code, Callout, Table
  focus their first field through `ownedField`); the rest hand it to the paragraph below.
  `slash-focus.spec.ts`.

## Headings

H1–H6 are native heading elements on one editing path; type and margins from `headingStyle`
(`tokens/rhythm.ts`: much more space above than below). **Every editor spacing value lives in
`DEFAULT_RHYTHM`**, read through `useRhythm`; `?tweak` / `pnpm dev:tweak` drags it live. New headings
are ATX; imported spacing and closers live in `headingSource`. Setext is deferred. An empty
heading shows `Heading N` via a CSS `data-placeholder` pseudo-element (never in the file),
focused or not. `heading-placeholder.spec.ts`.

## The Markdown view is the file, edited as typing

`SourceView`: the note as `blocksToMarkdown` writes it, a plain monospace field (never a live
preview). `sourceView` is app-wide in `LayoutContext`, never saved.

- **Switching commits nothing**, so it changes no byte. Each input is parsed with
  `markdownToBlocks` and committed via `commitTextChange` (one undo burst).
- **It repaints only when the blocks aren't the ones it committed** (identity: a text
  comparison respelled under the caret).
- The caret crosses by block (`utils/sourceView.ts`). The entry place is read once in
  `useState` (StrictMode runs effects twice). `source-view.spec.ts`.

## Lists

- Bullets alternate dot / ring by depth, primary ink, as boxes.
- **The caret never rests beside a marker**: arrows at a row's edge cross by the app's hand,
  the click rescue and `caretIntoTextRoot` in `beforeinput` guard the rest (text typed there
  never reached the file). `list-caret.spec.ts`.
- `listLayout` (`utils/listStructure.ts`) owns numbers and prefixes. Depth is read from
  indentation in context; authored spellings stay; a text edit never renumbers an imported
  list. `reconcileListEdit` repairs ordered sequences at structural commits only.

## The paragraph model

Blocks are Markdown structure, not lines (`structureParagraphs`).

- **A paragraph holds every adjacent plain line**, joined by `\n`. Enter makes a paragraph;
  Shift+Enter a soft break (in a heading, Enter). **Enter in a quote is a soft break**; on an
  empty last line it leaves the quote (adjacent quote blocks are one quote on disk).
- **One blank line between any two blocks is structure; each further blank is an empty row.**
  Spacing comes from the block's kind (`tokens/rhythm.ts`), never from blank lines. The app
  writes one blank between blocks, none between list items; a file's other spelling is kept as
  `tightAbove` / `looseAbove`, and `mustSeparate` pairs are always written apart.
- **On screen a newline is a `<br>`**, plus a trailing `<br>` for an empty last line that both
  walkers ignore. Never clamp a caret to `textContent.length`.
- **A soft-break line that would open a block is written escaped** (`readsBackAsText`), asking
  the app's own parser, so authored files are never rewritten. `paragraph-model.spec.ts`.

## A special block's field is a real field

Table cell, callout title/body, code textarea. **The field holds what state holds, and the file
never holds a byte sequence the syntax cannot.**

- Read with the editor's reader, commit every input through `commitTextChange`.
- **`data-inline-field`** (cell, callout body) marks a field that owns its inline formatting
  (`formatInlineField`): wrapped in the field, then an `input` event so its own handler commits.
  Chromium's `Cmd+B` must never run in a field. `special-block-fields.spec.ts`.
- **A field repaints only when it doesn't hold the ref's latest text** (`useOwnedField`); the
  render prop lags a keystroke. Structural operations reshape the block as the ref holds it
  (`updateTableRows`).
- The serializer enforces the syntax: a newline in a cell is `<br>`, in a callout title a space.

## Code blocks

Every `.code-line` takes at least `1lh` (or the layers drift). `fenceSource` keeps authored
fences, including an absent closer; the editor never normalises code. **The info string is kept
as typed** (`js` stays `js`) and resolved only for display (`canonicalLang`); re-picking the
same language writes nothing. The language menu portals to `body` and takes its own keys (the
caret rescue and `onKeyDown` steal them). `code-language.spec.ts`.

## Images

- **A width is CSS pixels** (Obsidian's `|350`), capped at the column; none means natural size,
  never enlarged (`imageDisplayWidth`). An image added in the app gets a width only when it is a
  Retina PNG (`pHYs`). An existing image is never rewritten by being shown.
- Nothing at rest; the pointer shows a bar and a resize pill; selected shows its wash only.
  Click selects, double-click opens full size.
- Absent: alignment, crop, caption, Replace. `image-controls.spec.ts`,
  `image-size.spec.ts`.

## Tables

- **Ragged on disk, ragged forever**: a row holds exactly its line's cells; the grid draws the
  widest row; only an explicit column operation pads (`tableShape.ts`).
- **A table keeps its spelling** (`tableSource`, `tableAlign.ts`): lined up stays lined up
  (widening re-pads, nothing narrows); otherwise unchanged rows keep their lines, wherever
  they move. New and tidied tables are lined up. `table-preservation.spec.ts`.
- **Rows and columns move by grips on the edges** (`TableHandles`): first cell or margin shows
  the row's, a header cell the column's. Drawn on the root (the scroller clips). A carried row
  passes a neighbour at its middle (`dropIndex`); one write, on drop. `table-handles.spec.ts`.
- Content-sized, shrinking to a per-cell floor, then scrolling. Add boxes reveal on their own
  hover. Grip menus hang under the grip; inserts take the caret. `table-block.spec.ts`.

## Dividers, images and tables are selectable blocks

- Selected as a whole (`isSelectableBlock`, `selectedBlockId`): Backspace/Delete removes, Enter
  opens a paragraph below, Escape deselects, a printable character deselects and types. A press
  selects; a press anywhere off `data-selection-surface` deselects. Escape from a cell selects
  the table.
- Backspace from below / Delete from above selects it first (`reachAcross`), removing an empty
  row between in the same press; the caret is hidden while a block is selected.
- **Arrows stop on a divider or image and enter every block with a field**; deletion still
  steps over code (`landingBefore` vs `caretLandingBefore`).
- Roots register themselves in the ref map, never via `elRef`.
- **Taking the caret back never scrolls the note**: `placeCaret` focuses with `preventScroll`,
  then scrolls the block minimally.
- **Measure a caret's line with `caretRect`** (a collapsed range in an empty node reports
  zeros). `caret-navigation.spec.ts`.

## Paste and copy

- **A block holding text never changes type on paste** (`utils/pasteBlocks.ts`). Plain lines
  stay soft breaks; a blank line starts a block; only an empty block is taken over by
  structure. One trailing newline is stripped.
- **Files, pasted or dropped, go through one ordered loop** (`saveAndInsertFiles`). A drop is
  the whole pane's (`.editor-scroll`) and lands where the block-drag marker says.
  `file-drop.spec.ts`.
- **Copy**: structure travels only for whole blocks (`fullBlock`). Whole blocks write
  `blocksToMarkdown` as text and structural HTML; a partial selection writes visible text and
  inline HTML. `copy-clipboard.spec.ts`.
- **A multi-line rich paste is read as Markdown first** (`utils/richPaste.ts`) then through the
  same block rules; HTML with no semantic formatting is ignored. A single-line rich paste is
  sanitised to inline nodes and inserted with `insertNode`, never `insertHTML`.
  `rich-paste.spec.ts`.
- **The DOM read-back is verbatim; only marked scaffolding is dropped** (`walkNode`). A link
  becomes a bare URL only if it is the editor's own `bare-url` autolink with unchanged text.
  `domRoundTrip.test.js`, `inline-preservation.spec.ts`.
