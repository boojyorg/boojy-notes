# Editor

What a change to the editor must not break, and why.

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

- **Undo and redo act on the open note only** (`takeNewestFor`); stacks shared. A typing group
  belongs to one note and a structural commit closes it. Undo never conjures a deleted note; a
  move is not undoable. `undo-scope.spec.ts`.
- **One keystroke is one entry**: Enter's split and Backspace's join set text and blocks in one
  commit. `undo-steps.spec.ts`.
- A draft ends in the ref at its first keystroke. The rebuild after an outside delete keeps
  drafts and dirty notes from the ref. A vault switch flushes, empties, then switches. A
  version already written is not written again. `note-ownership.spec.ts`,
  `pending-edits-lifecycle.spec.ts`.

### The DOM is painted from the ref, and a programmatic edit is read back like a keystroke

- **A text block is painted only on a signal** (mount, a `syncGen` bump, a title-set change),
  from `latestBlock(noteDataRef)`, never from the render (a keystroke behind), caret restored,
  a line-end space before it as U+00A0. A bump alone paints nothing; pair it with a commit that
  publishes at once. `repaint-spaces.spec.ts`.
- **A text-only commit never repaints**, so a programmatic text edit edits the DOM and reads it
  back (`domNodeToMarkdown`): formatting, the link popover, Find → Replace.
  `repaint-ownership.spec.ts`.

## One edit, one block root

The editor is one contentEditable over React-owned block roots; Chromium edits across two and
breaks the next commit. **An edit that reaches beyond one block root is the app's, made
through state.**

- **The seam is the native `beforeinput` on the editor root** (`useCrossBlockEdit`,
  `getTargetRanges()`). One root: left to Chromium. More: cancelled and, for delete, text,
  Enter and Shift+Enter, done in state. React's `onBeforeInput` cannot stand in.
- **`execCommand` fires no `beforeinput`**, so script mutations ask `scopeOf` first.
- **Bold, italic and code are structural wraps** (`toggleWrappingTag`), never
  `execCommand("bold")`, which reads the computed style. What is selected decides on or off;
  edge spaces stay outside, typed ones too (`liftTypedSpace`). `heading-bold.spec.ts`,
  `format-edge-spaces.spec.ts`.
- **A block with its own field owns its edits and its keys** (table cell, callout, code
  textarea): `handleEditorKeyDown` returns in a field, whose document selection is stale there;
  only inline-format shortcuts in a `data-inline-field` go to `applyFormat`.
- A collapsed Delete/Backspace into a neighbour merges only with text; it selects a divider,
  image or table. **Backspace in the only empty block is prevented** (Chromium deletes the
  `<p>`). `cross-block-ownership.spec.ts`.

## Keys and focus: the closest active surface owns them

- **Tab outside a list goes to the open note's sidebar row** (`focusBeyondNote`; Shift+Tab the
  name); lists indent, cells and code keep their Tab. Swallowing it was a keyboard trap.
  `keyboard-walkthrough.spec.ts`.
- **A surface that takes a key prevents its default; one that reads a key checks
  `defaultPrevented` first.** The shell (`useAppKeyboard`) is the last, bubble-phase window
  listener; a surface never adds its own.
- **An open modal, or a focused menu, owns every key beneath it** (`focusOwner()`). Each
  surface closes itself on Escape; Escape never hides the sidebar. A native text field outside
  the editor owns its editing keys.
- **A closing surface hands focus back only while it holds it, unscrolled, ringed only if it
  was.** `useFocusTrap`.
- **Suggestion menus under the caret never take focus** and own a key only while offering a
  completion. The `[[` picker is a dialog and takes focus.
- A completion from a native listener commits at once. A triple-click selects the block or its
  field by the app's hand (`selectClickedBlock`). A caret rescue never takes focus back.
- ArrowUp with nothing above reaches the note's name, ArrowDown comes back; Shift+Arrow is
  always the browser's. `key-ownership.spec.ts`, `title-arrows.spec.ts`.
- **⌥↑/↓ (Ctrl elsewhere) jump to a block's start** (`isBlockJump`), on screen.
  `block-jump.spec.ts`.
- **A line command takes a line only if the selection holds some of it** (`selectedLines`);
  ⌘Enter ticks those to-dos one way (`todoFlip`), else is Enter. `selected-lines.spec.ts`.

## Backspace sheds the kind before it merges

- Backspace at the start of a heading, list item, quote or task makes it a paragraph and nothing
  else (`DEMOTES_TO_PARAGRAPH`); an indented item outdents first; only a paragraph merges.
  Enter at the start of a titled heading opens a paragraph above.
- **Caret positions count visible characters** (`caretLength`), never Markdown length. A split
  on a soft break's edge spends the break. `enter-backspace.spec.ts`.

## Links: the caret stays outside

- **A caret at a link's edge rests on a U+200B inside a `caret-anchor` span**, placed only by
  `placeCaret` (Chromium's edge caret typed into the alias). Walkers drop U+200B only inside a
  `caret-anchor`; elsewhere it is the file's byte. Never strip it by value.
- **The browser's caret is fixed at the keystroke** (`caretOutOfLinkEnd`/`Start`), never on
  `selectionchange`, which would trap ArrowLeft.
- **A wikilink click opens the note its target names; it never guesses or creates**
  (`utils/wikilinkTarget.ts`). A name two notes share, or none, draws dashed and opens the link
  picker in fix mode; a vault file's name opens the file (`fileForTarget`).
  `link-resolution.spec.ts`.
- **One link picker** (`LinkPicker.tsx`) for Cmd+K, the toolbar, `[[`, Edit link and an
  unresolved click; it writes the shortest clear target (`linkTargetFor`). `link-picker.spec.ts`.
- **`#tag` is a pill; the Markdown stays `#tag`.** One grammar, `TAG_RE`, for renderer,
  completion, search and filter; `extractAllTags` skips code, frontmatter, URLs and link
  addresses. Punctuation typed at a pill's end lands outside it. `tag-pill.spec.ts`.
- **A backslash escape is its symbol alone, sealed**: one caret character, read back with its
  backslash; as written in code, addresses and wikilinks. `escapes.spec.ts`.
- Bare URLs autolink in prose only; `<url>` is text. **`LINK_DEST` is the one reading of a link
  destination.**

## Typed inline formatting converts on the closing marker, and changes no bytes

- A format becomes its element when its closing marker is typed; the literal run *is* the
  Markdown, so it is a repaint and Cmd+Z is typing undo.
- **The trigger is the native `insertText` of one marker character**, outside composition,
  never the text alone (Backspace re-converted). **The paint is verified**
  (`paintTypedFormat`): paired differently, the old DOM and caret come back.
  `typed-formatting.spec.ts`.
- **A code span is literal** (`codeSpans.js`, CommonMark's backtick runs): nothing in it is
  drawn; untouched it keeps its spelling (`data-md`), edited only what changed; only ⌘E acts in
  one. `literal-code.spec.ts`.
- **Formatting ends with its text** (`forgetDeletedStyle`): after a deletion the next letters
  take the caret's own formatting, never a deleted run's; overtyping keeps its style.
  `typing-style.spec.ts`.
- **Block triggers wait for their space, and Enter does what the space does**
  (`utils/blockTriggers.ts`): a marker can carry an argument (a fence's language) a trigger on
  its last character could never read. **A line kind's marker typed before a one-line
  paragraph's text converts it too**; Cmd+Z gives the literal back. `marker-on-text.spec.ts`.

## The selection toolbar waits for the selection to finish

- Shows on mouse-up or at rest; hides at once on collapse. Measured once when shown.
- **It shows only where it can act**: any text block; in a block with its own fields, only
  inside one `data-inline-field`, without Link.
- **`FORMATS` in `FloatingToolbar.jsx` must match `useKeyboardHandlers`.**
  `formatting-toolbar.spec.ts`.

## Right-click is Cut, Copy and Paste

- `EditorContextMenu`: a misspelled word's or a link's actions, then Cut, Copy, Paste; a field
  outside the note gets the same (`TextFieldMenu`). **Items run the keys' own path.** Never
  focused, so the selection stays blue. `text-context-menu.spec.ts`.
- **Spelling is the system's, underlined by the app** (`useSpellingMarks`; Chromium's is late),
  never in code, tags or links; guesses only on a marked word. A Mac: wrong in all its
  languages, guessed in the sentence's first. Windows: Chromium's line and guesses.
  `spelling.spec.ts`, `spelling-line.spec.ts`.

## Block drag: the gutter grip; on the phone, a hold

- **On the desktop text never starts a block drag; a picture does.** One floating grip
  (`BlockDragHandle`) in the left padding, on hover, `aria-hidden`; a click selects the block.
- A key hides the grip (a modifier alone doesn't: Shift-click). **Blur cancels a press
  unconditionally** (Cmd-Tab left a phantom drag). `grip-reveal.spec.ts`.
- **On the phone a still finger holds the block** (`useHoldToGrab`): moved, it drags; let go,
  `BlockMenu`. A scroll, a double-tap or selected text is the browser's. A lone new finger ends
  a lost hold (Android reuses finger ids). `hold-to-grab.spec.ts`.
- **Commits on drop**, one history entry, only if order changed; Escape, blur or the sidebar
  cancel. A selection drags as one run; moved blocks glide (`settleBlocks`). `motion.spec.ts`.
- **`⌘⇧↑/↓` steps a block and its nested items past the neighbour's group** (no item changes
  parent; `moveStep`). `list-move.spec.ts`.
- **Measured geometry is divided by `cssZoom(el)` before it becomes a style** (UI scale).
- **Frontmatter is never moved** (`reorderFloor`). `frontmatter-order.spec.ts`.
- **Every root the grip can show beside is in `blockRefs`**; media, code and callout register
  via `wholeRef`, not `elRef` (its repaint paints over the wrapper).

## Menus

- **The slash menu is tiered**: `advanced: true` rows stay off the opening screen, one rule for
  menu and keys (`filterSlashCommands()`). Rows take selection on real mouse movement.
- **Route every popover through `positionMenu()` / `useMenuPosition`.**
- **Every menu's keys are one rule** (`useMenuKeys`); a suggestion under the caret
  (`suggestion: true`) leaves typing keys to typing and is a `listbox`. `menuKeys.test.ts`,
  `callout-picker.spec.ts`.
- **The editor column never carries a transform** (it would contain the `fixed` menus).
  `editor-menus.spec.ts`.
- **A chosen block with its own field takes the caret** (`hasOwnField`); the rest hand it to
  the paragraph below. `slash-focus.spec.ts`.

## Maths

- **A `$$` formula never moves; its source opens underneath** (`MathBlock`; ⌘Z stays the
  note's); ↑/↓ at its edges walk out. `math-block.spec.ts`.
- **`$x$` in a sentence is one sealed element** (`data-math`): one caret character; the closing
  `$` converts it, a press opens its source (`InlineMathPanel`). `inline-math.spec.ts`.
- **`\` completes the `\word` the caret ends**; a choice is one undo entry
  (`closeTypingGroup`). `latex-menu.spec.ts`.

## Headings

**Every editor spacing value lives in `DEFAULT_RHYTHM`.** New headings are ATX; an empty one
shows `Heading N` from CSS. `heading-placeholder.spec.ts`.

## The Markdown view is the file, edited as typing

`SourceView`: the note as `blocksToMarkdown` writes it, a plain monospace field. **Each note
keeps its own view, saved** (`useSourceView`).

- **Switching commits nothing**, so it changes no byte. Each input is parsed with
  `markdownToBlocks` and committed via `commitTextChange`.
- **It repaints only when the blocks aren't the ones it committed** (by identity). The caret
  crosses by block (`utils/sourceView.ts`). `source-view.spec.ts`.
- **Colour says what each part is; nothing may change a character's width** (the field lies
  over the layer): no ligatures in either box. `sourceView.test.ts`.

## Lists

- **The caret, and a selection's ends, never rest beside a marker** (`caretIntoTextRoot`,
  `selectionIntoTextRoots`). `list-caret.spec.ts`.
- **Tab moves an item with its nested items; over several, all of them** (`indentRun`): in is
  all or nothing, out each that can; one undo. `multi-item-indent.spec.ts`.
- `listLayout` owns numbers and prefixes; authored spellings stay; a text edit never renumbers
  an imported list (`reconcileListEdit`).

## The paragraph model

Blocks are Markdown structure, not lines (`structureParagraphs`).

- **A paragraph holds every adjacent plain line**, joined by `\n`. Enter makes a paragraph;
  Shift+Enter a soft break. **Enter in a quote is a soft break**; on an empty last line it
  leaves the quote (adjacent quote blocks are one quote on disk).
- **One blank line between any two blocks is structure; each further blank is an empty row.**
  Spacing comes from the block's kind, never from blank lines.
- **On screen a newline is a `<br>`** (plus a trailing one both walkers ignore). Never clamp a
  caret to `textContent.length`.
- **A soft-break line that would open a block is written escaped** (`readsBackAsText`), so
  authored files are never rewritten. `paragraph-model.spec.ts`.

## A special block's field is a real field

Table cell, callout title/body, code textarea. **The field holds what state holds, and the file
never holds a byte sequence the syntax cannot.**

- Read with the editor's reader, commit every input through `commitTextChange`; a typed closing
  marker converts there as in a block (`fieldTextAfterTyping`).
- **`data-inline-field`** (cell, callout body) marks a field that owns its inline formatting
  (`formatInlineField`); Chromium's `Cmd+B` must never run in a field.
  `special-block-fields.spec.ts`.
- **A field repaints only when it doesn't hold the ref's latest text** (`useOwnedField`);
  structural operations reshape the block as the ref holds it.
- The serializer enforces the syntax: a cell's newline is `<br>`, a callout title's a space.

## Code blocks

Every `.code-line` takes at least `1lh` (or the layers drift). **One hover toolbar per code
block.** `code-language.spec.ts`. **A `mermaid` fence is drawn** (`DiagramView`), its code
above, open until its `</>` closes it. `diagram.spec.ts`.

## Images

- **A width is CSS pixels** (Obsidian's `|350`), capped at the column; none means natural size,
  never enlarged. One added in the app gets a width only as a Retina PNG. Showing an image never
  rewrites it. `image-controls.spec.ts`.
- **A missing attachment is a `Not found` card**; Find it… copies the file in under the linked
  name. `missing-attachments.spec.ts`.

## Tables

- **Ragged on disk, ragged forever**: a row holds exactly its line's cells; only an explicit
  column operation pads (`tableShape.ts`).
- **A table keeps its spelling** (`tableSource`, `tableAlign.ts`): lined up stays lined up
  (widening re-pads, nothing narrows); otherwise unchanged rows keep their lines, and an edited
  one fitting a lined-up header takes its columns. `table-preservation.spec.ts`.
- **Rows and columns move by grips on the edges** (`TableHandles`), drawn on the root (the
  scroller clips); one write, on drop. In a cell `⌘⇧↑/↓` moves the row, `⌥⇧⌘←/→` the column
  (`⌘⇧←/→` stays select-to-edge). `table-handles.spec.ts`.
- Wraps at words, then scrolls; a short column never wraps. `table-widths.spec.ts`.

## Whole-block selection

- **Any block can be selected whole** (`utils/blockRun.ts`): the grip, the gutter strip, Escape,
  a press on a divider, image or table; Shift-click extends. **A list item brings its nested
  items** (`subtreeEnd`). Text blocks wear the band; the caret rests, hidden.
- On a selection, Backspace/Delete remove it in one commit and ⌘C/⌘X copy it whole
  (`wholeBlocksCopy`); a letter deselects and types. A press off `data-selection-surface`
  deselects.
- **The grip's click also opens `BlockMenu`** beside it (right-click, Shift+F10); its shown keys
  work. `block-selection.spec.ts`.
- Backspace from below / Delete from above selects a divider, image or table first
  (`reachAcross`). **Arrows stop on a divider or image and enter every block with a field**;
  deletion steps over code and embeds (`landingBefore` vs `caretLandingBefore`).
- **Taking the caret back never scrolls the note** (`placeCaret`: `preventScroll`).
- **Measure a caret's line with `caretRect`** (an empty node's range reports zeros).
  `caret-navigation.spec.ts`.

## Paste and copy

- **A block holding text never changes type on paste.** Plain lines stay soft breaks; a blank
  line starts a block; only an empty block is taken over by structure. Lines a keyboard types at
  once (Gboard's clipboard) are a paste (`typedPaste`).
- **Files, pasted or dropped, go through one ordered loop** (`saveAndInsertFiles`).
  `file-drop.spec.ts`.
- **Copy**: structure travels only for whole blocks (`fullBlock`); a partial selection writes
  visible text and inline HTML. `copy-clipboard.spec.ts`.
- **A multi-line rich paste is read as Markdown first** (`utils/richPaste.ts`) unless it has no
  semantic formatting or comes from a code editor. `rich-paste.spec.ts`.
- **The DOM read-back is verbatim; only marked scaffolding is dropped** (`walkNode`). A typed
  U+00A0 is a space unless the block held one (`settleTypedSpaces`); Chromium's copied styling
  is unwrapped (`shedStyleResidue`). `domRoundTrip.test.js`, `typed-spaces.spec.ts`,
  `style-residue.spec.ts`.
