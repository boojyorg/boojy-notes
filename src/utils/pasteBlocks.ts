import type { Block, BlockType } from "../types/notes";
import { markdownToBlocks } from "./markdown";

/**
 * Block-level paste: where pasted blocks land around the caret, and when the
 * destination block keeps its own type.
 *
 * The rule, in one place for both internal (text/boojy-blocks) and external
 * multi-line paste:
 *
 * 1. The destination block never changes type while it holds text. Only an
 *    empty destination can be taken over, and only by a pasted block that
 *    carries structure of its own (a heading, a list item, a code block).
 * 2. A plain paragraph is text, not structure. Its text merges into the
 *    destination at the caret, so pasting a sentence into a checkbox, bullet
 *    or heading keeps it a checkbox, bullet or heading, with its checked state,
 *    indent and any other metadata intact.
 * 3. A structured first block pasted into a populated destination becomes its
 *    own block. At the start of the destination it goes in front of it; in the
 *    middle it splits the destination text around itself.
 * 4. Any further pasted blocks follow as new blocks. Text after the caret is
 *    appended to the last pasted block when that block is a paragraph or the
 *    same type as the destination, otherwise it becomes a new paragraph.
 *
 * This is deliberately scoped to the text-bearing block types. Code, media,
 * table, callout and other special blocks never merge; they always arrive as
 * their own blocks.
 */

const TEXT_BLOCK_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  "p",
  "h1",
  "h2",
  "h3",
  "bullet",
  "numbered",
  "checkbox",
  "blockquote",
]);

/** A pasted block as decoded from the clipboard: shaped like a block, without an id. */
export interface PastedBlock {
  type: BlockType;
  text?: string;
  checked?: boolean;
  indent?: number;
  /** Set by the internal copy path; never carried onto the note. */
  fullBlock?: boolean;
  [key: string]: unknown;
}

export interface PasteResult {
  /** The blocks that replace the destination block, in order. */
  blocks: Block[];
  /** Where the caret belongs after the paste: the end of the pasted content. */
  focusId: string;
  focusPos: number;
}

/** Whether a block's text lives in the editor's contentEditable. */
export function isTextBlockType(type: BlockType): boolean {
  return TEXT_BLOCK_TYPES.has(type);
}

/** Whether a pasted block is plain text with no structure of its own. */
export function isPlainPastedBlock(block: PastedBlock): boolean {
  return block.type === "p";
}

/**
 * Whether one line of clipboard text is itself a structured text block in
 * Markdown (a heading, list item, checkbox or quote). Such a line takes over
 * an empty destination the way a multi-line paste does; anywhere else a
 * single line pastes inline as text.
 */
export function isStructuredMarkdownLine(line: string): boolean {
  const blocks = markdownToBlocks(line) as PastedBlock[];
  return blocks.length === 1 && isTextBlockType(blocks[0].type) && !isPlainPastedBlock(blocks[0]);
}

/** Build a note block from a pasted block, dropping the clipboard-only flag. */
function materialise(pasted: PastedBlock, id: string): Block {
  if (isTextBlockType(pasted.type)) {
    const block = { id, type: pasted.type, text: pasted.text ?? "" } as Block;
    if (pasted.checked !== undefined) (block as { checked?: boolean }).checked = pasted.checked;
    if (pasted.indent) block.indent = pasted.indent;
    return block;
  }
  const { fullBlock: _fullBlock, ...rest } = pasted;
  return { ...rest, id } as Block;
}

/**
 * Compute the blocks that replace the destination block for a block-level
 * paste. `beforeText` / `afterText` are the destination's text either side of
 * the caret, read from the live DOM (state may lag it). `genId` mints ids for
 * blocks that don't reuse the destination's.
 */
export function buildPastedBlocks(
  currentBlock: Block,
  pastedBlocks: readonly PastedBlock[],
  beforeText: string,
  afterText: string,
  genId: () => string,
): PasteResult {
  const [first, ...rest] = pastedBlocks;
  const hasBefore = beforeText.trim() !== "";
  const hasAfter = afterText.trim() !== "";
  const destinationIsText = isTextBlockType(currentBlock.type);
  const blocks: Block[] = [];

  if (!hasBefore && !hasAfter) {
    // Rule 1 and 2: an empty destination keeps its type for plain text and
    // yields it to structure.
    if (destinationIsText && isPlainPastedBlock(first)) {
      blocks.push({ ...currentBlock, text: first.text ?? "" });
    } else {
      blocks.push(materialise(first, currentBlock.id));
    }
  } else if (destinationIsText && isPlainPastedBlock(first)) {
    // Rule 2: plain text merges at the caret.
    blocks.push({ ...currentBlock, text: beforeText + (first.text ?? "") });
  } else if (!hasBefore) {
    // Rule 3, caret at the start: the pasted blocks go in front, and the
    // destination keeps its whole text.
    blocks.push(materialise(first, genId()));
    for (const pasted of rest) blocks.push(materialise(pasted, genId()));
    blocks.push({ ...currentBlock, text: afterText });
    return { blocks, focusId: currentBlock.id, focusPos: 0 };
  } else {
    // Rule 3, caret in the middle: split the destination around the paste.
    blocks.push({ ...currentBlock, text: beforeText });
    blocks.push(materialise(first, genId()));
  }

  for (const pasted of rest) blocks.push(materialise(pasted, genId()));

  const last = blocks[blocks.length - 1];
  const focusId = last.id;
  const focusPos = (last.text ?? "").length;

  if (hasAfter) {
    // Rule 4: the text after the caret follows the pasted content.
    if (isTextBlockType(last.type) && (last.type === "p" || last.type === currentBlock.type)) {
      last.text = (last.text ?? "") + afterText;
    } else {
      blocks.push({ id: genId(), type: "p", text: afterText });
    }
  }

  return { blocks, focusId, focusPos };
}

/**
 * Drop exactly one terminal line ending from clipboard text. Copying a whole
 * line in most apps includes its line break; that break is incidental, so a
 * one-line copy should paste inline rather than split the block. Only one is
 * removed: a deliberately copied blank line still arrives as a block.
 */
export function stripIncidentalLineEnding(text: string): string {
  return text.replace(/\r?\n$/, "");
}
