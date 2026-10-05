import type { Block } from "../types/notes";

/**
 * The first index a reorder may touch. Frontmatter is the file's head, not a
 * block of the body: its `---` must stay on line 1 or every reader, this one
 * included, takes the properties for a paragraph, a setext heading and a
 * divider. So nothing is moved above it and it is never lifted itself. Both
 * reorder paths read this one rule: Cmd+Shift+Arrow through `moveBlock`,
 * and the gutter grip through `useBlockDrag` (the target index, the grabbed
 * block and a selection run alike); `BlockDragHandle` shows no grip over it.
 * The parser makes frontmatter only at index 0, so only the head is asked.
 */
export function reorderFloor(blocks: readonly Block[]): number {
  return blocks[0]?.type === "frontmatter" ? 1 : 0;
}

/**
 * A reorder keeps the file's gaps where they were. `tightAbove` and
 * `looseAbove` record how the file spelled the gap above a position (no blank
 * line, or one between list items); they belong to the place, not the block,
 * so a commit that only reorders blocks leaves each position's spelling as it
 * was and a moved block takes the gap it lands in. An embed's indent (`lead`)
 * puts it under the block above it, so it goes once that block is another:
 * kept, a tab after a blank line would make the embed a code block elsewhere.
 * Anything else is returned as it is.
 */
export function keepGapsInPlace(before: readonly Block[], after: Block[]): Block[] {
  if (before.length !== after.length || before.length < 2) return after;
  let reordered = false;
  const above = new Map<string, string | undefined>();
  for (let i = 0; i < before.length; i++) {
    above.set(before[i].id, before[i - 1]?.id);
    if (before[i].id !== after[i].id) reordered = true;
  }
  if (!reordered || !after.every((b) => above.has(b.id))) return after;
  let changed = false;
  const out = after.map((block, i) => {
    const { tightAbove, looseAbove } = before[i];
    const leadGoes = block.lead !== undefined && above.get(block.id) !== after[i - 1]?.id;
    if (block.tightAbove === tightAbove && block.looseAbove === looseAbove && !leadGoes) {
      return block;
    }
    changed = true;
    const next: Block = { ...block };
    delete next.tightAbove;
    delete next.looseAbove;
    if (tightAbove) next.tightAbove = true;
    if (looseAbove) next.looseAbove = true;
    if (leadGoes) delete next.lead;
    return next;
  });
  return changed ? out : after;
}
