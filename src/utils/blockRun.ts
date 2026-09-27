import type { Block } from "../types/notes";
import { reorderFloor } from "./blockOrder";

/**
 * A whole-block selection: the block it started on (`anchor`) and the block
 * Shift+Arrow or a Shift-click last reached (`head`). What it covers is the
 * run between them, and a list item always brings the items nested under it.
 */
export interface BlockSelection {
  anchor: string;
  head: string;
  /** Made on the grip (its face stays pressed), not a list marker or the keys. */
  grip?: boolean;
}

const LIST_KINDS = new Set(["bullet", "numbered", "checkbox"]);

/**
 * The last index of block `i` and what is nested under it: the blocks that
 * follow a list item at a deeper indent. Anything else has no children
 * (Markdown nests only under a list item), so it is its own end. The one rule
 * shared by the selection and the grip's drag, so what is selected is what
 * moves.
 */
export function subtreeEnd(blocks: readonly Block[], i: number): number {
  const block = blocks[i];
  if (!block || !LIST_KINDS.has(block.type)) return i;
  const depth = block.indent || 0;
  let end = i;
  while (end + 1 < blocks.length && (blocks[end + 1].indent || 0) > depth) end++;
  return end;
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
