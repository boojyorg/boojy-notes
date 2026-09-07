/**
 * One edit, one block root.
 *
 * The editor is a single contentEditable wrapping every block root, so
 * Chromium is willing to merge, split or format across two React-owned
 * roots. Any edit whose reach is not confined to one editable block root is
 * the app's to make, through state; Chromium never mutates across roots.
 * This module holds the shape arithmetic for that rule: which roots a range
 * touches, what a native input type means, and what the blocks become.
 * The hook that enforces it (`useCrossBlockEdit`) owns the DOM and the
 * commit; nothing here mutates anything.
 */
import type { Block } from "../types/notes";
import { getBlockFromNode, isEditableBlock, isSelectableBlock } from "./domHelpers";
import { htmlToInlineMarkdown, sanitizeInlineHtml } from "./inlineFormatting";

/** Blocks whose Markdown may span lines, so Shift+Enter puts a soft break inside them. */
export const SOFT_BREAK_TYPES = new Set(["p", "bullet", "numbered", "checkbox", "blockquote"]);

/** Blocks that Enter continues as another of their kind rather than a paragraph. */
export const LIST_TYPES = new Set(["bullet", "numbered", "checkbox", "blockquote"]);

export interface BlockPoint {
  blockIndex: number;
  blockId: string;
  /** The editable element, registered only for text blocks. */
  el: HTMLElement | undefined;
}

/** The two ends of a range, as seen by the editor. */
export interface RangePoints {
  startContainer: Node;
  startOffset: number;
  endContainer: Node;
  endOffset: number;
}

/**
 * Which block roots a range touches.
 *   block:   both ends in the same root (the root may be a table or callout
 *            whose inner field holds the selection).
 *   cross:   the ends are in two different roots, start before end.
 *   outside: at least one end is in no root at all (the editor element
 *            itself, an orphan node), or the ends are in the wrong order.
 */
export type RangeScope =
  | { kind: "block"; start: BlockPoint; end: BlockPoint }
  | { kind: "cross"; start: BlockPoint; end: BlockPoint }
  | { kind: "outside"; start: BlockPoint | null; end: BlockPoint | null };

export function rangeScope(
  range: RangePoints,
  editorEl: HTMLElement | null,
  blocks: Block[] | undefined,
  blockRefs: Record<string, HTMLElement | undefined>,
): RangeScope {
  const at = (container: Node, offset: number, side: "start" | "end"): BlockPoint | null => {
    if (!editorEl || !blocks) return null;
    // A point on the editor element itself addresses one of its children:
    // the child at the offset for a start, the child before it for an end.
    const node =
      container === editorEl
        ? editorEl.childNodes[side === "start" ? offset : offset - 1]
        : container;
    if (!node) return null;
    return getBlockFromNode(node, editorEl, blocks, blockRefs);
  };
  const start = at(range.startContainer, range.startOffset, "start");
  const end = at(range.endContainer, range.endOffset, "end");
  if (!start || !end || start.blockIndex > end.blockIndex) return { kind: "outside", start, end };
  if (start.blockIndex === end.blockIndex) return { kind: "block", start, end };
  return { kind: "cross", start, end };
}

/** What a native edit means, in the terms the block model can apply. */
export type EditIntent =
  | { kind: "delete" }
  | { kind: "insertText"; text: string }
  | { kind: "insertParagraph" }
  | { kind: "insertLineBreak" };

const TEXT_INPUT_TYPES = new Set([
  "insertText",
  "insertReplacementText",
  "insertTranspose",
  "insertFromPaste",
  "insertFromYank",
]);

/**
 * The intent behind a `beforeinput` type, or null for one the app refuses
 * across roots: formatting, history, composition, and `deleteByDrag`, which
 * is refused so a text drag across blocks copies rather than losing the
 * text between the owned delete and Chromium's own insertion.
 */
export function intentOf(inputType: string, text: string | null): EditIntent | null {
  if (inputType === "deleteByDrag") return null;
  if (inputType.startsWith("delete")) return { kind: "delete" };
  if (TEXT_INPUT_TYPES.has(inputType)) return { kind: "insertText", text: text ?? "" };
  if (inputType === "insertParagraph") return { kind: "insertParagraph" };
  if (inputType === "insertLineBreak") return { kind: "insertLineBreak" };
  return null;
}

export interface EditResult {
  blocks: Block[];
  focusId: string;
  focusPos: number;
}

/**
 * Apply an intent over the run of blocks from `startIdx` to `endIdx`, where
 * `before` is the start block's Markdown before the range and `after` the
 * end block's Markdown after it. Every block strictly between is removed:
 * the user selected across it. Null when either end is not a text block;
 * the app then refuses the edit rather than guessing.
 */
export function applyAcrossBlocks(
  blocks: Block[],
  startIdx: number,
  endIdx: number,
  before: string,
  after: string,
  intent: EditIntent,
  genId: () => string,
): EditResult | null {
  const start = blocks[startIdx];
  const end = blocks[endIdx];
  if (!start || !end || !isEditableBlock(start) || !isEditableBlock(end)) return null;
  const next = [...blocks];
  const removed = endIdx - startIdx;

  if (intent.kind === "insertLineBreak" && !SOFT_BREAK_TYPES.has(start.type)) {
    intent = { kind: "insertParagraph" };
  }
  if (intent.kind === "insertParagraph") {
    const list = LIST_TYPES.has(start.type);
    const fresh: Block = { id: genId(), type: list ? start.type : "p", text: after } as Block;
    if (start.type === "checkbox") (fresh as { checked?: boolean }).checked = false;
    if (list && start.indent) fresh.indent = start.indent;
    next[startIdx] = { ...start, text: before };
    next.splice(startIdx + 1, removed, fresh);
    return { blocks: next, focusId: fresh.id, focusPos: 0 };
  }

  const middle =
    intent.kind === "insertText" ? intent.text : intent.kind === "insertLineBreak" ? "\n" : "";
  next[startIdx] = { ...start, text: before + middle + after };
  next.splice(startIdx + 1, removed);
  return { blocks: next, focusId: start.id, focusPos: before.length + middle.length };
}

/**
 * A Delete or Backspace with a collapsed caret whose reach Chromium extends
 * into a neighbouring root (forward Delete at the end of a block, Backspace
 * beside a block that owns itself). Only the adjacent block counts: a text
 * block merges, a divider or image is selected instead (the next key removes
 * it), and anything else refuses, so a code block or table beside the caret
 * is never swallowed. Chromium's own reach skips non-editable roots, which
 * is why `farIdx` may be further away than the neighbour.
 */
export function reachAcross(
  blocks: Block[],
  caretIdx: number,
  farIdx: number,
):
  | { kind: "merge"; startIdx: number; endIdx: number }
  | { kind: "select"; blockId: string }
  | null {
  if (farIdx === caretIdx) return null;
  const step = farIdx > caretIdx ? 1 : -1;
  const adjacent = blocks[caretIdx + step];
  if (!adjacent) return null;
  if (isSelectableBlock(adjacent)) return { kind: "select", blockId: adjacent.id };
  if (!isEditableBlock(adjacent) || farIdx !== caretIdx + step) return null;
  return {
    kind: "merge",
    startIdx: Math.min(caretIdx, farIdx),
    endIdx: Math.max(caretIdx, farIdx),
  };
}

/** The Markdown of `el`'s content before the point (`container`, `offset`). */
export function markdownBefore(el: HTMLElement, container: Node, offset: number): string {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.setEnd(container, offset);
  return markdownOf(range);
}

/** The Markdown of `el`'s content after the point (`container`, `offset`). */
export function markdownAfter(el: HTMLElement, container: Node, offset: number): string {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.setStart(container, offset);
  return markdownOf(range);
}

function markdownOf(range: Range): string {
  const div = document.createElement("div");
  div.appendChild(range.cloneContents());
  return htmlToInlineMarkdown(sanitizeInlineHtml(div.innerHTML));
}
