# Editor

## One owner for note state

Note state has two copies: React state and `useHistory`'s keystroke ref, which runs ahead.
**Every change goes through a `useHistory` action; the raw setter is not exposed.** Six actions; a seventh is a smell.

| Action | For | Undo |
| --- | --- | --- |
| `commitTextChange` | typing (debounced); ends a draft at its first character | per burst |
| `commitNoteData` | a user edit: block, checkbox, rename, new/deleted note, drop | yes |
| `adoptNoteData` | a change of record: the written filename, a folder move | no |
| `applyExternalNote` | a note as the disk holds it | drops its entries |
| `remapNoteFolders` | a directory rename or move | no |
| `replaceNoteData` | the whole vault: load, switch, rebuild after outside delete | keeps existing notes' |

- **Undo and redo act on the open note only** (`takeNewestFor`); stacks shared. A typing group
  belongs to one note and a structural commit closes it. Undo never conjures a deleted note.
  `undo-scope.spec.ts`.
- **One keystroke is one entry**: Enter's split and Backspace's join set text and blocks in one
  commit. `undo-steps.spec.ts`.
- The rebuild after an outside delete keeps drafts and dirty notes from the ref. A vault switch
  flushes, empties, then switches. A version already written is not written again. `note-ownership.spec.ts`,
  `pending-edits-lifecycle.spec.ts`.

### Painting from the ref

- **A text block is painted only on a signal** (mount, a `syncGen` bump, a title-set change),
  from `latestBlock(noteDataRef)`, never from the render, caret restored,
  a line-end space before it as U+00A0. A bump alone paints nothing; pair it with a commit that
  publishes at once. `repaint-spaces.spec.ts`.
- **A text-only commit never repaints**, so a programmatic text edit edits the DOM and reads it
  back (`domNodeToMarkdown`): formatting, the link popover, Replace. `repaint-ownership.spec.ts`.

## One edit, one block root

The editor is one contentEditable over React-owned block roots; an edit across two
breaks the next commit. **An edit that reaches beyond one block root is the app's, made
through state.**

- **The seam is the native `beforeinput` on the editor root** (`useCrossBlockEdit`,
  `getTargetRanges()`). One root: left to Chromium. More: cancelled and, for delete, text,
  Enter and Shift+Enter, done in state.
- **`execCommand` fires no `beforeinput`**, so script mutations ask `scopeOf` first.
- **Bold, italic and code are structural wraps** (`toggleWrappingTag`), never
  `execCommand("bold")` (computed style). What is selected decides on or off;
  edge spaces stay outside, typed ones too (`liftTypedSpace`). `heading-bold.spec.ts`,
  `format-edge-spaces.spec.ts`.
- **A block with its own field owns its edits and its keys** (table cell, callout, code
  textarea): `handleEditorKeyDown` returns in a field, whose document selection is stale there;
  only inline-format shortcuts in a `data-inline-field` go to `applyFormat`.
- A collapsed Delete/Backspace into a neighbour merges only with text; it selects a divider,
  image or table (`reachAcross`). **Backspace in the only empty block is prevented** (Chromium deletes the
  `<p>`). `cross-block-ownership.spec.ts`.

## Keys and focus: the closest active surface owns them

- **Tab outside a list goes to the open note's sidebar row** (`focusBeyondNote`; Shift+Tab the
  name). `keyboard-walkthrough.spec.ts`.
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
  field, by the app (`selectClickedBlock`). A caret rescue never takes focus back, nor
  follows a link's click.
- ArrowUp with nothing above reaches the note's name, ArrowDown comes back; Shift+Arrow is
  always the browser's. `key-ownership.spec.ts`, `title-arrows.spec.ts`.
- **⌥↑/↓ (Ctrl elsewhere) jump to a block's start** (`isBlockJump`), on screen.
  `block-jump.spec.ts`.
- **A line command takes a line only if the selection holds some of it** (`selectedLines`);
  ⌘Enter ticks those to-dos one way (`todoFlip`), else is Enter. `selected-lines.spec.ts`.

## Backspace sheds the kind before it merges

- Backspace at the start of a kind in `DEMOTES_TO_PARAGRAPH` makes it a paragraph; an indented
  item outdents first; only a paragraph merges.
  Enter at the start of a titled heading opens a paragraph above.
- **Caret positions count visible characters** (`caretLength`), not Markdown. A split
  on a soft break's edge spends the break. `enter-backspace.spec.ts`.

## Links: the caret stays outside

- **A caret at a link's edge rests on a U+200B inside a `caret-anchor` span**, placed only by
  `placeCaret`. Walkers drop U+200B only inside a `caret-anchor`; elsewhere it is the file's
  byte. Never strip it by value.
- **The browser's caret is fixed at the keystroke** (`caretOutOfLinkEnd`/`Start`), never on
  `selectionchange`, which would trap ArrowLeft.
- **A wikilink click opens the note its target names; it never guesses or creates**
  (`wikilinkTarget.ts`). A name two notes share, or none, draws dashed and opens the
  picker to fix; a file opens (`fileForTarget`); a heading or `^id` is found as Obsidian finds
  it (`headingTarget.ts`, a child only in its parent; `blockTarget.ts`), as a visit
  (`historyJump`); a missing one is said. An ID is
  drawn quietly only while it ends its block. `link-resolution.spec.ts`,
  `heading-links.spec.ts`, `block-links.spec.ts`.
- **A footnote reference is one sealed character showing `[n]`** over its source
  (`numberFootnotes`, first reference first), which copies and saves.
  A caret anchor follows; ←/→ take it whole, Backspace its `]` (`footnoteRefKey`). A click goes to
  its definition (its label's last), a visit; with none, the panel writes one. `footnotes.spec.ts`.
- **A footnote is made in its panel** (`useFootnoteDraft`): `[^` shows a faint `n]`,
  Enter/Tab types it; a typed new label (not line-first) or Insert footnote too. A draft
  till Done or a leave (`flushAll`, not a blur); refused, its text waits in a notice.
  `footnote-create.spec.ts`.
- **A definition shows `n.`; an unused one a dash**, its label above on hover or caret.
  Its ↩ is Back while that jump is the visit open, else the first
  reference, tinted as an element (`tintElement`).
- **Move footnotes to bottom waits for its safety save** (`useMoveFootnotes`).
  `footnote-move.spec.ts`.
- **One link picker** (`LinkPicker.tsx`) for every way in, writing the shortest clear target
  (`linkTargetFor`). `link-picker.spec.ts`.
- **`#tag` is a pill; the Markdown stays `#tag`.** One grammar, `TAG_RE`, for renderer,
  completion, search and filter; `extractAllTags` skips code, URLs and link addresses, and
  reads frontmatter only as its `tags:` property (`frontmatterTags`). Punctuation typed at its
  end lands outside it. A click searches, except on the tag holding the caret; Enter jumps
  past it, in any field. `tag-pill.spec.ts`.
- **A backslash escape is its symbol alone, sealed**: one caret character, read back with its
  backslash; as written in code, addresses and wikilinks. `escapes.spec.ts`.
- Bare URLs autolink in prose only; `<url>` is text. **`LINK_DEST` is the one reading of a link
  destination**; one inside the vault opens there (`vaultLinkTargets`).

## Typed inline formatting converts on the closing marker

- The literal run *is* the Markdown, so converting is a repaint and Cmd+Z is typing undo.
- **The trigger is the native `insertText` of one marker character**, outside composition,
  never the text alone. **The paint is verified**
  (`paintTypedFormat`): paired differently, the old DOM and caret come back.
  `typed-formatting.spec.ts`.
- **A code span is literal** (`codeSpans.js`): nothing in it is drawn; untouched it keeps its
  spelling (`data-md`), edited only what changed; only ⌘E acts in one. `literal-code.spec.ts`.
  **`_x_` and `__x__` keep their underscores**, stars only where those cannot say it
  (`writesUnderscores`).
  **So are a `%%` comment and an inline footnote, muted** (`literalRuns`), no format acting; the grey
  follows the markers (`repaintComments`). `comments.spec.ts`, `footnotes.spec.ts`.
- **Formatting ends with its text** (`forgetDeletedStyle`): after a deletion the next letters
  take the caret's formatting, never a deleted run's; overtyping keeps its style.
  `typing-style.spec.ts`.
- **Block triggers wait for their space, and Enter does what the space does**
  (`blockTriggers.ts`): a marker may carry an argument. **A line
  kind's marker typed before a one-line paragraph's text converts it too**; Cmd+Z gives the
  literal back. `marker-on-text.spec.ts`.

## The selection toolbar

- Shows on mouse-up or at rest; hides at once on collapse.
- **It shows only where it can act**: any text block; in a block with its own fields, only
  inside one `data-inline-field`, without Link.
- **`FORMATS` in `FloatingToolbar.jsx` must match `useKeyboardHandlers`.**
  `formatting-toolbar.spec.ts`.

## Right-click

- `EditorContextMenu`: a misspelled word's, link's or tag's actions, then Cut, Copy, Paste; a field
  outside the note gets the same (`TextFieldMenu`); Shift+F10 at the caret. **Items
  run the keys' own path.** `text-context-menu.spec.ts`.
- **Spelling is the system's, underlined by the app** (`useSpellingMarks`),
  never in code, tags or links; guesses only on a marked word.
  `spelling.spec.ts`, `spelling-line.spec.ts`.

## Block drag

- **On the desktop text never starts a block drag; a picture does.** One floating grip
  (`BlockDragHandle`) in the gutter; nested (`data-indent`), on its parent's marker
  (`gripX`), clear of a wide number; on hover, `aria-hidden`.
- A key hides the grip (not a lone modifier: Shift-click). **Blur always cancels
  a press**. `grip-reveal.spec.ts`.
- **On the phone a still finger holds the block** (`useHoldToGrab`): moved, it drags; let go,
  `BlockMenu` (on a tag, the tag's menu). A scroll, double-tap or text selection is the browser's. A lone new finger ends
  a lost hold (Android reuses ids). `hold-to-grab.spec.ts`.
- **Commits on drop**, one entry, only if order changed; Escape, blur or the sidebar
  cancel. A selection drags as one run. `motion.spec.ts`.
- **`⌘⇧↑/↓` steps a block and its nested items past the neighbour's group** (`moveStep`).
  `list-move.spec.ts`.
- **Measured geometry is divided by `cssZoom(el)` before it becomes a style**.
- **Every root the grip shows beside is in `blockRefs`**; media, code and callout register via
  `wholeRef`, not `elRef` (its repaint covers the wrapper).

## Menus

- **The slash menu is tiered**: `advanced: true` rows stay off the opening screen, one rule for
  menu and keys (`filterSlashCommands()`).
- **Route every popover through `positionMenu()` / `useMenuPosition`.**
- **Every menu's keys are one rule** (`useMenuKeys`); a caret suggestion (`suggestion: true`)
  is a `listbox`. `menuKeys.test.ts`, `callout-picker.spec.ts`.
- **The editor column never carries a transform** (it would contain the `fixed` menus).
  `editor-menus.spec.ts`.
- **A chosen block with its own field takes the caret** (`hasOwnField`); the rest hand it to
  the paragraph below. `slash-focus.spec.ts`.

## Maths

- **A `$$` formula never moves; its source opens underneath** (`MathBlock`; ⌘Z is the
  note's); ↑/↓ at its edges walk out. `math-block.spec.ts`.
- **`$x$` in a sentence is one sealed element** (`data-math`): one caret character; its closing
  `$` converts it, a press opens its source (`InlineMathPanel`). `inline-math.spec.ts`.
- **`\` completes the `\word` the caret ends**; a choice is one undo entry
  (`closeTypingGroup`). `latex-menu.spec.ts`.

## Headings

**Every editor spacing value lives in `DEFAULT_RHYTHM`.** New headings are ATX; an empty one
shows `Heading N` (CSS). `heading-placeholder.spec.ts`.

## The Markdown view is the file

`SourceView`: the note as `blocksToMarkdown` writes it. **Each note
keeps its own view, saved** (`useSourceView`).

- **Switching commits nothing**, so it changes no byte. Each input is parsed
  (`markdownToBlocks`) and committed (`commitTextChange`).
- **It repaints only when the blocks aren't the ones it committed** (by identity). The caret
  crosses by block (`sourceView.ts`). `source-view.spec.ts`.
- **Colour says what each part is; nothing may change a character's width**:
  no ligatures. `sourceView.test.ts`.

## Lists

- **The caret, and a selection's ends, never rest beside a marker** (`caretIntoTextRoot`,
  `selectionIntoTextRoots`). `list-caret.spec.ts`.
- **Tab moves an item with its nested items; over several, all of them** (`indentRun`): in is
  all or nothing, out each that can; one undo. `multi-item-indent.spec.ts`.
- `listLayout` owns numbers and prefixes; authored spellings stay; a text edit never renumbers
  an imported list (`reconcileListEdit`).

## The paragraph model

- **A paragraph holds every adjacent plain line** (`structureParagraphs`), joined by `\n`.
  Enter makes a paragraph; Shift+Enter a soft break. **Enter in a quote is a soft break**; on an
  empty last line it leaves the quote (adjacent quote blocks are one quote on disk).
- **One blank line between any two blocks is structure; each further blank is an empty row.**
  Spacing comes from the block's kind, never from blank lines.
- **On screen a newline is a `<br>`** (plus a trailing one both walkers ignore). Never clamp a
  caret to `textContent.length`.
- **A soft-break line that would open a block is written escaped** (`readsBackAsText`), so
  authored files are never rewritten. `paragraph-model.spec.ts`.

## A special block's field is a real field

**The field holds what state holds, and the file
never holds a byte sequence the syntax cannot.**

- Read with the editor's reader, every input committed (`commitTextChange`); a typed closing
  marker converts there too (`fieldTextAfterTyping`).
- **`data-inline-field`** (cell, callout body) marks a field that owns its inline formatting
  (`formatInlineField`). `special-block-fields.spec.ts`.
- **A field repaints only when it doesn't hold the ref's latest text** (`useOwnedField`);
  structural operations reshape the block as the ref holds it.
- The serializer enforces the syntax: a cell's newline is `<br>`, a callout title's a space.
- **An empty callout title shows its type word, title-cased, and is never written**
  (`shownTitle`); a type change leaves the title alone. `callout-picker.spec.ts`.
- **A callout's fold is a view, never an edit**: `-` folded, `+` open, reset when the note
  changes; folded, the body is `inert` and Find opens it. `callout-fold.spec.ts`.

## Properties

- **Frontmatter is the note's properties** (`PropertiesBlock`), read with `yaml`
  (`readProperties`), never written by it. Unreadable YAML opens as YAML, a real field kept literal. Never moved (`reorderFloor`). `properties-view.spec.ts`,
  `frontmatter-order.spec.ts`.
- **A row edit is one `editFrontmatter` commit** that splices only that property's text, run
  by name on the latest text and read back first (`runChange`), else refused and the YAML
  opens; React paints it. An outside change to the property being edited sets the draft
  aside, with Restore. `properties.spec.ts`.
- **A list is edited an item at a time** (`replaceItem` and kin), each splicing only its bytes. `property-lists.spec.ts`.
- **Add property and `/properties`** (`PropertyPicker`): a picked type is a draft row
  (`freeName`), written once on Enter, Tab or a press elsewhere; Escape writes nothing. `---` on
  a note's first line opens it at the third dash (`opensProperties`). An empty value's type is
  this device's (`propertyTypes`), never the vault's. `properties-add.spec.ts`.

## Code blocks

**One hover toolbar per code block.** `code-language.spec.ts`. **A `mermaid` fence is drawn** (`DiagramView`), its code
open until `</>` closes it. `diagram.spec.ts`. **A `markdown` one is painted as the Markdown
view** (`paintMarkdownCode`); a callout's `[!type]` only where the parser opens one.

## Images

- **A width is CSS pixels**, capped at the column; none means natural size,
  never enlarged. Showing an image never rewrites it. `image-controls.spec.ts`.
- **A missing attachment is a `Not found` card**; Find it… copies the file in under the linked
  name. `missing-attachments.spec.ts`.

## Tables

- **Ragged on disk, ragged forever**: a row holds exactly its line's cells; only an explicit
  column operation pads (`tableShape.ts`).
- **A table keeps its spelling** (`tableSource`, `tableAlign.ts`): lined up stays lined up
  (widening re-pads, nothing narrows); otherwise unchanged rows keep their lines, and an edited
  one fitting a lined-up header takes its columns. `table-preservation.spec.ts`.
- **Rows and columns move by grips on the edges** (`TableHandles`) or a cell's keys; one write, on drop. `table-handles.spec.ts`.

## Whole-block selection

- **Any block can be selected whole** (`blockRun.ts`): grip, gutter, Escape (every block a
  text selection touches), a press on a divider, image, table or embed; Shift-click extends. **A list item or footnote brings what nests
  under it** (`subtreeEnd`; drops land after, `dropBoundary`).
- Backspace/Delete remove a selection in one commit, ⌘C/⌘X copy it whole (`wholeBlocksCopy`);
  a letter deselects and types; a press off `data-selection-surface` deselects. **A
  duplicate shares no label or `^id`** (`withoutOwnIds`).
- **A drag from the left margin, a gutter strip or between blocks draws a box**
  (`useMarqueeSelect`, `marqueeRun`); Escape restores, its release clicks nothing. From
  text or right of a line (`besideLine`), it is text. `marquee-select.spec.ts`.
- **The grip's click opens `BlockMenu` on its run** or text's lines (`gripSelection`;
  right-click, Shift+F10); the gutter picks one. `block-menu-run.spec.ts`.
- **Arrows stop on a divider, image or embed, enter every block with a field**; deletion
  steps over code.
- **A caret taken back never scrolls** (`preventScroll`). `caret-navigation.spec.ts`.

## Embeds: read-only copies

- **An embed is drawn by `ReadOnlyBlocks`**, found as its
  link's click finds it (`embedTarget`); a link inside reads as in its source; a self-embed is said.
- **The copy is fenced by the selection, never the target**:
  `useEmbedFence` cancels an edit in it and its chip says where to edit.
- **A click opens its `![[…]]` underneath** (keys: Edit link), saved once; closing leaves it picked. `embeds.spec.ts`.

## Paste and copy

- **A block holding text never changes type on paste.** Plain lines stay soft breaks; a blank
  line starts a block; only an empty block is taken over by structure. Gboard's clipboard is a
  paste (`typedPaste`).
- **Files, pasted or dropped, go through one ordered loop** (`saveAndInsertFiles`); an app's
  picture of copied text yields to it (`pasteIsText`). `file-drop.spec.ts`.
- **Copy**: structure travels only for whole blocks (`fullBlock`); a partial selection writes
  visible text and inline HTML. `copy-clipboard.spec.ts`.
- **A multi-line rich paste is read as Markdown first** (`richPaste.ts`) unless it has no
  semantic formatting or comes from a code editor. `rich-paste.spec.ts`.
- **The DOM read-back is verbatim; only marked scaffolding is dropped** (`walkNode`). A typed
  U+00A0 is a space unless the block held one (`settleTypedSpaces`); Chromium's copied styling
  is unwrapped (`shedStyleResidue`). `domRoundTrip.test.js`, `typed-spaces.spec.ts`,
  `style-residue.spec.ts`.
