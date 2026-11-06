import type { Block } from "../types/notes";
import { reorderFloor } from "./blockOrder";
import { LIST_TYPES, MAX_INDENT } from "./blockKinds";

/**
 * A whole-block selection: the block it started on (`anchor`) and the block
 * Shift+Arrow or a Shift-click last reached (`head`). What it covers is the
 * run between them, and a list item always brings the items nested under it.
 */
export interface BlockSelection {
  anchor: string;
  head: string;
  /** The block whose grip made it (that grip stays pressed); none from a list marker or the keys. */
  grip?: string;
}

/** A paragraph indented two spaces or a tab: under a footnote, another of its paragraphs. */
const CONTINUES_FOOTNOTE = /^(?: {2,}|\t)\S/;
const continuesFootnote = (b: Block | undefined) =>
  b?.type === "p" && CONTINUES_FOOTNOTE.test(b.text || "");
const blankRow = (b: Block | undefined) => b?.type === "p" && (b.text || "") === "";

/**
 * The last index of footnote `i`'s group: the indented paragraphs after it,
 * blank rows between them, which Markdown reads as more of the footnote.
 */
function footnoteEnd(blocks: readonly Block[], i: number): number {
  let end = i;
  for (let k = i + 1; k < blocks.length; k++) {
    if (continuesFootnote(blocks[k])) end = k;
    else if (!blankRow(blocks[k])) break;
  }
  return end;
}

/** Whether block `k` is inside a footnote's group, after the definition itself. */
export function inFootnoteGroup(blocks: readonly Block[], k: number): boolean {
  let j = k - 1;
  while (j >= 0 && (continuesFootnote(blocks[j]) || blankRow(blocks[j]))) j--;
  return j >= 0 && blocks[j].type === "footnote" && footnoteEnd(blocks, j) >= k;
}

/**
 * Where a dropped run goes for boundary `target`: never inside a footnote's
 * group, where it would part the footnote from its later paragraphs (and they
 * would join the dropped block), but after the group.
 */
export function dropBoundary(blocks: readonly Block[], target: number): number {
  let t = target;
  while (t > 0 && t < blocks.length && inFootnoteGroup(blocks, t)) t++;
  return t;
}

/**
 * The last index of block `i` and what is nested under it: the blocks that
 * follow a list item at a deeper indent, or a footnote's later paragraphs.
 * Anything else has no children (Markdown nests only under a list item or a
 * footnote), so it is its own end. The one rule shared by the selection, the
 * grip's drag and ⌘⇧↑/↓, so what is selected is what moves.
 */
export function subtreeEnd(blocks: readonly Block[], i: number): number {
  const block = blocks[i];
  if (block?.type === "footnote") return footnoteEnd(blocks, i);
  if (!block || !LIST_TYPES.has(block.type)) return i;
  const depth = block.indent || 0;
  let end = i;
  while (end + 1 < blocks.length && (blocks[end + 1].indent || 0) > depth) end++;
  return end;
}

/**
 * Cmd+Shift+↑/↓: block `i` with what is nested under it trades places with
 * its neighbour on that side, the neighbour's nested blocks included, so no
 * item changes parent. A nested item moves among its siblings only (Tab and
 * Shift+Tab change its level): at the first or last of them, and at the
 * frontmatter or the note's end, the new blocks are null.
 */
export function moveStep(blocks: readonly Block[], i: number, dir: 1 | -1): Block[] | null {
  const floor = reorderFloor(blocks);
  if (i < floor || i >= blocks.length) return null;
  // A footnote's later paragraphs stand one level in, as nested items do.
  const depth = (k: number) => (blocks[k].indent || 0) + (inFootnoteGroup(blocks, k) ? 1 : 0);
  const end = subtreeEnd(blocks, i);
  let from: number;
  let to: number;
  if (dir === 1) {
    from = end + 1;
    if (from >= blocks.length || depth(from) < depth(i)) return null;
    to = subtreeEnd(blocks, from);
  } else {
    to = i - 1;
    if (to < floor) return null;
    from = to;
    while (from > floor && depth(from) > depth(i)) from--;
    if (depth(from) < depth(i)) return null;
  }
  const [first, second] =
    dir === 1
      ? [
          [i, end],
          [from, to],
        ]
      : [
          [from, to],
          [i, end],
        ];
  return [
    ...blocks.slice(0, first[0]),
    ...blocks.slice(second[0], second[1] + 1),
    ...blocks.slice(first[0], first[1] + 1),
    ...blocks.slice(second[1] + 1),
  ];
}

/**
 * Where a block goes "under" block `i` without breaking a list apart: after
 * the top-level item that holds `i`, with everything nested under it.
 * Anywhere else, straight after `i`.
 */
export function belowItem(blocks: readonly Block[], i: number): number {
  let top = i;
  while (top > 0 && LIST_TYPES.has(blocks[top]?.type) && (blocks[top].indent || 0) > 0) top--;
  // A nested item with no item above it to belong to: under itself.
  if (!LIST_TYPES.has(blocks[top]?.type)) top = i;
  return subtreeEnd(blocks, top) + 1;
}

/**
 * The indices a selection covers, `from` to `to`, children included; null when
 * either end has left the note. Never above the frontmatter, which is the
 * file's head and not a block to act on.
 */
export function selectionRange(
  blocks: readonly Block[],
  sel: BlockSelection | null,
): { from: number; to: number } | null {
  if (!sel) return null;
  const a = blocks.findIndex((b) => b.id === sel.anchor);
  const h = blocks.findIndex((b) => b.id === sel.head);
  if (a < 0 || h < 0) return null;
  const from = Math.max(reorderFloor(blocks), Math.min(a, h));
  let to = Math.max(a, h);
  for (let k = from; k <= to; k++) to = Math.max(to, subtreeEnd(blocks, k));
  return from <= to ? { from, to } : null;
}

/** The ids a selection covers, in order. */
export function selectedIds(blocks: readonly Block[], sel: BlockSelection | null): string[] {
  const range = selectionRange(blocks, sel);
  return range ? blocks.slice(range.from, range.to + 1).map((b) => b.id) : [];
}

/**
 * What a grip's click (or right-click, or the phone's hold) selects: the run
 * it was pressed in, so the menu it opens acts on all of it; else the lines a
 * text selection runs through, when there are several and this is one of them
 * (the drag's rule); else the block alone. `grip` is the block pressed.
 */
export function gripSelection(
  blocks: readonly Block[],
  current: BlockSelection | null,
  lineIds: readonly string[],
  blockId: string,
): BlockSelection {
  if (selectedIds(blocks, current).includes(blockId) && current) {
    return { ...current, grip: blockId };
  }
  if (lineIds.length > 1 && lineIds.includes(blockId)) {
    return { anchor: lineIds[0], head: lineIds[lineIds.length - 1], grip: blockId };
  }
  return { anchor: blockId, head: blockId, grip: blockId };
}

/**
 * Shift+↑/↓: move the head one block and say what the selection is now. Down
 * past the anchor steps over the head's children (they are already selected);
 * a step that would change nothing (back up inside a child run) keeps going
 * until it does, so every press visibly grows or shrinks the selection. At the
 * note's edge the selection is returned unchanged.
 */
export function stepHead(
  blocks: readonly Block[],
  sel: BlockSelection,
  dir: 1 | -1,
): BlockSelection {
  const range = selectionRange(blocks, sel);
  const a = blocks.findIndex((b) => b.id === sel.anchor);
  let h = blocks.findIndex((b) => b.id === sel.head);
  if (!range || a < 0 || h < 0) return sel;
  const floor = reorderFloor(blocks);
  for (;;) {
    if (dir === 1) h = h >= a ? range.to + 1 : h + 1;
    else h -= 1;
    if (h < floor || h >= blocks.length) return sel;
    const next = { ...sel, head: blocks[h].id };
    const r = selectionRange(blocks, next);
    if (r && (r.from !== range.from || r.to !== range.to)) return next;
  }
}

const isBlank = (block: Block) => block.type === "p" && !(block.text || "").trim();

/**
 * Tab or Shift+Tab over blocks `from`–`to`: each list item among them, with
 * the items nested under it, one level in (`delta` 1) or out (-1). Anything
 * else in the run stays. In is all or nothing: every item that would lead a
 * nested run needs an item above it at least as deep (an empty row between
 * is no break, as on disk), else nothing moves and the list keeps its shape.
 * Out moves each item that can; one already at the edge stays, and so do its
 * children. The new blocks, or null when nothing would change.
 */
export function indentRun(
  blocks: readonly Block[],
  from: number,
  to: number,
  delta: 1 | -1,
): Block[] | null {
  const moving = new Set<number>();
  for (let i = from; i <= to; i++) {
    if (!LIST_TYPES.has(blocks[i]?.type) || moving.has(i)) continue;
    if (delta < 0 && !(blocks[i].indent || 0)) continue;
    for (let k = i; k <= subtreeEnd(blocks, i); k++) moving.add(k);
  }
  if (!moving.size) return null;
  if (delta > 0) {
    for (const k of moving) {
      if ((blocks[k].indent || 0) >= MAX_INDENT) return null;
      let above = k - 1;
      while (above >= 0 && isBlank(blocks[above])) above--;
      if (moving.has(above)) continue;
      const parent = blocks[above];
      if (!parent || !LIST_TYPES.has(parent.type)) return null;
      if ((parent.indent || 0) < (blocks[k].indent || 0)) return null;
    }
  }
  return blocks.map((block, i) =>
    moving.has(i) ? { ...block, indent: (block.indent || 0) + delta, indentStr: undefined } : block,
  );
}
