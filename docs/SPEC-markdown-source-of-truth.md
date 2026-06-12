# SPEC: Markdown is the source of truth

**Status:** binding constraint (adopted v0.5.0). This is an architectural rule, not a
feature request. It governs what blocks and interactions may exist in Boojy Notes.

---

## The rule, in one sentence

**A note *is* its markdown. Blocks are only an in-memory rendering of that markdown — never
the storage format.**

Every block must serialise back to clean, human-readable markdown *losslessly*. If a block,
or an interaction, can't round-trip to readable markdown, **we don't ship it.** The block
catalogue is *defined by* what markdown can represent.

This is what keeps a Boojy note portable forever — openable in Obsidian, in a plain text
editor, in `cat`, in anything that reads text.

---

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

The *round-trip rule* above is universal. The *literal storage* is not yet — and this spec
states that plainly rather than pretending otherwise.

| Platform | What is on disk / in storage | Is markdown the literal source of truth? |
|----------|------------------------------|------------------------------------------|
| **Desktop (Electron)** | Real `.md` files in the vault (`electron/noteFileManager.js` writes via `blocksToMarkdown`, reads via `markdownToBlocks`). An index maps note IDs → paths. | **Yes — already true today.** |
| **Web** | Block JSON in `localStorage` (`boojy-notes-v1`); becomes markdown only at the sync boundary (R2 stores markdown + frontmatter). | **No — temporary divergence.** |

So on web we claim only that blocks are **provably round-trippable** (the round-trip test
guarantees it), *not* that web "stores markdown." Do not write or imply otherwise in UI,
docs, or marketing.

### Committed direction (NOT a current milestone)

Migrate web persistence to store **markdown strings directly** (not block JSON), so "markdown
is the stored format" becomes literally true on every platform. The round-trip test is the
gate that makes that migration safe — when web starts storing markdown, the same lossless
contract already holds, so no note can be corrupted by the switch.

---

## Allowed block catalogue

Allowed *because markdown can express them*:

- All current block types: `p`, `h1`–`h3`, `bullet`, `numbered`, `checkbox`, `blockquote`,
  `code`, `callout`, `table`, `image`, `file`, `embed`, `spacer`, `frontmatter`.
- **Block reorder** — dragging a block up/down = reordering lines in the `.md` file.
  (`blocksToMarkdown` walks the array in order, so reordering re-serialises cleanly for free.)
- **List indent / outdent** — markdown nested-list syntax (`  - nested`). **List types only**
  (`bullet`/`numbered`/`checkbox`) — see "Removed" below.
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

These are the *only* sanctioned losses. Anything else that fails the round-trip is a bug.

---

## How to use this spec

- **Reviewing a new block idea?** Ask: "Does it round-trip to clean markdown?" If no → reject
  or redesign. Add a fixture to `tests/utils/markdown.test.js` proving the round-trip before
  the block ships.
- **Touching `markdown.js`?** Run the round-trip test. A red test means you broke the
  contract — fix the converter, don't weaken the test.
- **Asked to add nesting/columns/metadata-blocks?** Decline and link here.
