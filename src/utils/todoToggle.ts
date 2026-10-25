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

/**
 * The blocks a text selection covers for ⌘Enter, first to last. An end that
 * rests before a block's first character (Shift+↓ from a line's start) selects
 * nothing of that block, so it is left out. The key, Check Off and the menu's
 * state read this one rule.
 */
export function selectedTodoTargets(blocks: Block[], sel: Selection | null): string[] {
  if (!sel?.rangeCount) return [];
  const range = sel.getRangeAt(0);
  const blockOf = (node: Node | null) => {
    const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
    return el?.closest?.("[data-editor] [data-block-id]") ?? null;
  };
  const indexOf = (el: Element | null) =>
    el ? blocks.findIndex((b) => b.id === el.getAttribute("data-block-id")) : -1;
  const endEl = blockOf(range.endContainer);
  const from = indexOf(blockOf(range.startContainer));
  let to = indexOf(endEl);
  if (from < 0 || to < 0) return [];
  if (to > from && endEl) {
    const before = document.createRange();
    before.selectNodeContents(endEl);
    before.setEnd(range.endContainer, range.endOffset);
    if (before.toString().replace(/\u200b/g, "") === "") to--;
  }
  return blocks.slice(from, to + 1).map((b) => b.id);
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
