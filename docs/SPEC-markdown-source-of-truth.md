# SPEC: Markdown is the source of truth

**Status:** binding constraint (adopted v0.5.0). This is an architectural rule, not a
feature request. It governs what blocks and interactions may exist in Boojy Notes, what the app
owes each piece of Markdown syntax it meets (the support levels below), and what that implies
for the UI. Feature plans, reviews and UI decisions are judged against this document; if a
proposal conflicts with it, the proposal changes.

---

## The rule, in one sentence

**A note *is* its markdown. Blocks are only an in-memory rendering of that markdown — never
the storage format.**

Every block must serialise back to clean, human-readable markdown *losslessly*. If a block,
or an interaction, can't round-trip to readable markdown, **we don't ship it.** The block
catalogue is *defined by* what markdown can represent. Three tests hold the contract: the
round-trip, the byte-preservation corpus, and the interoperability suite that asks what the
Markdown means to an independent parser.

This is what keeps a Boojy Notes note portable forever — openable in Obsidian, in a plain text
editor, in `cat`, in anything that reads text.

---

## Blocks are structure, not lines

A paragraph block holds every adjacent plain line of the paragraph, joined by soft breaks; a list
item holds its lazy continuation lines; one blank line between such a block and the paragraph or
divider after it is the separator and not a block, and every further blank line is an empty
paragraph block. Enter starts a paragraph, Shift+Enter a soft break. Nothing is recorded that the
file does not say, and reading a file never rewrites it. The exact rules live in the UI rule's
paragraph-model section.

An empty list item or heading is the block its marker says: `- `, `1. `, `- [ ] `, `# ` (what
the app writes for one left empty) and the bare `-`, `1.`, `- [ ]`, `#` other editors write all
read back as that block with no text, never as a paragraph. A bare marker is remembered on the
block (`bare`) and written back without the space until text is typed, so the file's bytes stay
its own. An empty item takes no lazy continuation line.

## The enforceable core: the round-trip rule

> Every block MUST losslessly round-trip: **block → markdown → block**, producing an identical
> block (modulo its `id`).

This is enforced at **block design time**, on **every platform**, by an automated test:

- `tests/utils/markdown.test.js` — runs `markdownToBlocks(blocksToMarkdown(b))` for one
  representative of every block type and asserts deep-equality. (Mirrored from the Electron
  side by `tests/electron/markdown.test.js`.)
- Any new block type, or any change to a serializer/parser, that breaks the round-trip turns
  this test **red**. That red is the gate. **Do not lower it; fix the block.**

The converters that define the contract live in `src/utils/markdown.js`
(`blocksToMarkdown` / `markdownToBlocks`) — a single source of truth shared by the browser
renderer and the Electron main process.

---

## Storage truth, stated honestly per platform

The *round-trip rule* above is universal. The *literal storage* is not, and this spec states
that plainly rather than pretending otherwise.

- **Desktop (Electron) is the product, and markdown is the literal source of truth.** Notes
  are real `.md` files in the vault: `electron/noteFileManager.js` writes via `blocksToMarkdown`
  and reads via `markdownToBlocks`. An index in Electron's userData maps note IDs to paths; the
  vault itself is never written except through the user's own edits.
- **The web build is a development target, outside the product promise.** It persists block
  JSON in `localStorage` (`boojy-notes-v1`). Those blocks are provably round-trippable, but
  the web build does not "store markdown", and nothing in the UI, docs or marketing should
  imply it does. Whether web persistence ever changes is a decision for the day web becomes a
  product again; no migration is committed.

---

## Allowed block catalogue

Allowed *because markdown can express them*:

- All current block types: `p`, `h1`–`h3`, `bullet`, `numbered`, `checkbox`, `blockquote`,
  `code`, `callout`, `table`, `image`, `file`, `embed`, `spacer`, `frontmatter`.
- **Block reorder** — dragging a block up/down = reordering lines in the `.md` file.
  (`blocksToMarkdown` walks the array in order, so reordering re-serialises cleanly for free.)
- **List indent / outdent** — markdown nested-list syntax (a `- nested` line indented by two
  spaces). **List types only** (`bullet`/`numbered`/`checkbox`) — see "Removed" below.
- Obsidian-flavoured-but-still-text marks already in use: `==highlight==`, `[[wikilinks]]`.

## Forbidden — do not build (breaks portability)

- **Block nesting / re-parenting** into structures markdown can't express.
- **Columns / side-by-side layouts.**
- **Any block that serialises to JSON-in-a-codeblock or hidden metadata.**

If a feature request implies any of the above, the answer is no — point back to this spec.

---

## Removed by this rule (v0.5.0)

- **Paragraph / heading / blockquote indent.** Tab used to indent these and they rendered
  with padding, but `blocksToMarkdown` never serialised that indent — it was **silently lost
  on save** (a round-trip data-loss bug). Markdown has no clean paragraph-indent, so by the
  rule we don't offer it. Indent is now list-only (`src/hooks/editor/useKeyboardHandlers.js`).
  The round-trip test prevents this class of bug from returning.

---

## Known intrinsic losses (documented, not hidden)

Markdown's `![[...]]` wikilink syntax genuinely cannot store everything. Where a loss is
*intrinsic to the format*, we **assert the lossy behaviour explicitly** in the round-trip
test rather than letting it pass as if lossless:

- **`file` block byte `size`** — no slot in `![[file.pdf]]`; round-trips to `size: null`.
- **`image` custom `alt` (wikilink syntax only)** — `![[photo.png]]` re-derives `alt` from the
  filename, so a custom caption (`alt ≠ filename`) is lost. Standard markdown images
  (`![alt](url)`, `format: "md"` on the block) keep their syntax and alt text losslessly.
- **First-position `spacer`** — a leading `---` is always frontmatter, so a `spacer` must
  never be the first block.
- **A `---` tight under a paragraph line** — `hello` / `---` is a setext heading underline to
  every conventional reader, and a divider to Boojy Notes, which has always read it so. The
  first save writes the separator blank before the `---`, so the file comes to mean what the
  editor showed. Whether to read the tight form as a heading instead is an open decision in
  `docs/BACKLOG.md`.

These are the *only* sanctioned losses. Anything else that fails the round-trip is a bug.

---

## The other direction: preservation

The round-trip rule protects the app's own blocks. The **preservation promise** protects
everyone else's Markdown: **editing one part of a file must not unexpectedly rewrite the rest
of it.** Syntax Boojy Notes doesn't understand is preserved, never "cleaned up". This is a
product requirement, not an implementation detail; it is what makes it safe to point the app at
a folder of Markdown you care about.

Enforcement: `tests/utils/preservation.test.js` runs a corpus of deliberately awkward files
(`tests/fixtures/preservation/`) through the real load→save path. Known failures are marked in
the suite, never omitted; the suite is the honest record of how far the promise currently holds.

On Obsidian: Boojy Notes does **not** promise vault feature parity. The promise is narrower
and stronger: it can work directly with the Markdown files in an Obsidian vault without damaging
syntax it doesn't understand. Plugins, Canvas, `.obsidian` config and the rest of the workspace
are out of scope.

## Support levels

Every piece of Markdown syntax Boojy Notes encounters sits at exactly one level. An Obsidian
feature does not need to be a Boojy Notes feature just because the app can parse its syntax.

| Level | Meaning | Examples |
| --- | --- | --- |
| **Native** | Boojy Notes creates, edits, and renders it as a first-class feature | headings, lists, checkboxes, tables, images, code, quotes |
| **Compatible** | The app understands and renders it, but keeps the UI quiet: no permanent chrome, no promotion in menus | `[[wikilinks]]`, `#tags`, callouts, frontmatter |
| **Preserved** | The app may not render it meaningfully, but must never destroy or rewrite it | plugin syntax, block refs `^id`, `%%comments%%`, unknown YAML |
| **Out of scope** | No dedicated Boojy Notes feature or UI, until argued otherwise | graph view, canvas, databases, plugins, AI |

Moving something *up* a level (promoting a Compatible feature to Native UI) is a product
decision, and the question it must answer is: *does a first-time user's five minutes get
better or busier?*

### Consequences for UI

- The default surface stays small: folders, search, notes, one editor. Power lives behind
  typing (`/`, `[[`, `#`) and search, not behind permanent panels.
- A feature that demands a permanent sidebar, header control, or panel starts from
  "probably no".
- Opening a note replaces the current note. Tabs, split view, and workspace machinery earn UI
  again only if simplicity survives the argument.

---

## How to use this spec

- **Reviewing a new block idea?** Ask: "Does it round-trip to clean markdown?" If no → reject
  or redesign. Add a fixture to `tests/utils/markdown.test.js` proving the round-trip before
  the block ships.
- **Touching `markdown.js`?** Run the three contracts: round-trip (`tests/utils/markdown.test.js`),
  byte preservation (`preservation.test.js` over `tests/fixtures/preservation/`) and conventional
  meaning (`markdownInterop.test.js`, judged by an independent CommonMark parser against
  `tests/fixtures/interop/`). A red test means you broke a contract — fix the converter, don't
  weaken the test; a known gap is a narrow `it.fails`, never a deleted fixture.
- **Asked to add nesting/columns/metadata-blocks?** Decline and link here.
