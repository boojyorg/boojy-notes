import type { Block } from "../types/notes";

/**
 * The blocks a text selection covers, first to last, for every command that
 * acts on lines: ⌘0–9, Check Off and ⌘Enter, Tab, Escape, a grip drag. An end
 * that rests before a text block's first character (Shift+↓ from a line's
 * start ends at the next line's start) selects nothing of that block, so it is
 * left out. A block with no text of its own (an image, a divider) is kept: a
 * range can only end on it whole.
 */
export function selectedLines(blocks: Block[], range: Range | null): string[] {
  if (!range) return [];
  const blockOf = (node: Node | null | undefined) => {
    const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
    return el?.closest?.("[data-editor] [data-block-id]") ?? null;
  };
  // A point between blocks (on the editor itself, as Select All can leave
  // one) addresses the block after it for a start, the one before for an end,
  // as `rangeScope` reads it.
  const at = (container: Node, offset: number, side: "start" | "end") =>
    blockOf(container) ?? blockOf(container.childNodes[side === "start" ? offset : offset - 1]);
  const indexOf = (el: Element | null) =>
    el ? blocks.findIndex((b) => b.id === el.getAttribute("data-block-id")) : -1;
  const endEl = at(range.endContainer, range.endOffset, "end");
  const from = indexOf(at(range.startContainer, range.startOffset, "start"));
  let to = indexOf(endEl);
  if (from < 0 || to < from) return [];
  // Only an end inside a text block can fall before its first character. A
  // row's marker (a list number, a task's box: not editable) and the app's own
  // caret anchors (U+200B at a link's edge) are not its text.
  const endInside = !!endEl && endEl.contains(range.endContainer);
  if (to > from && endInside && typeof (blocks[to] as { text?: unknown }).text === "string") {
    const before = document.createRange();
    before.selectNodeContents(endEl);
    before.setEnd(range.endContainer, range.endOffset);
    const held = before.cloneContents();
    for (const el of held.querySelectorAll('.caret-anchor, [contenteditable="false"]')) el.remove();
    if (held.textContent === "") to--;
  }
  return blocks.slice(from, to + 1).map((b) => b.id);
}

/** `selectedLines` of the document's selection. */
export function selectedLinesOf(blocks: Block[], sel: Selection | null): string[] {
  return selectedLines(blocks, sel?.rangeCount ? sel.getRangeAt(0) : null);
}
