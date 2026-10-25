import type { Block } from "../types/notes";

/**
 * ⌘Enter on to-dos (Ctrl+Enter elsewhere), Notion's key: the to-dos among
 * the blocks the selection runs through, and the one way they all go. Ticked
 * if any is unticked, else unticked, so a mixed run is never turned inside
 * out. Other blocks are not touched; null when there is no to-do, and the key
 * stays the editor's.
 */
export function todoFlip(
  blocks: Block[],
  ids: string[],
): { ids: string[]; checked: boolean } | null {
  const todos = blocks.filter(
    (b): b is Extract<Block, { type: "checkbox" }> => b.type === "checkbox" && ids.includes(b.id),
  );
  if (todos.length === 0) return null;
  return { ids: todos.map((b) => b.id), checked: todos.some((b) => !b.checked) };
}

export function isTodoKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;
}
