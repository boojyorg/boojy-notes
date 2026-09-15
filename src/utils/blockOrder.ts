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
