/**
 * The tag being edited is the one the selection is in: no mode to keep, so
 * Edit tag and arrowing in are the same, and leaving it any way ends it.
 * While a tag is being edited a click on it places the caret (any other tag's
 * click still searches), it wears a ring, and Enter finishes it.
 */

const tagOf = (node: Node) =>
  (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest(
    ".inline-tag",
  ) ?? null;

/** The `.inline-tag` in `root` that holds the whole selection, past its `#`; else null. */
export function editingTag(root: Element | null | undefined): Element | null {
  const sel = window.getSelection();
  if (!root || !sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const tag = tagOf(range.startContainer);
  if (!tag || !root.contains(tag) || tagOf(range.endContainer) !== tag) return null;
  // A caret before the `#` is before the tag, not in it.
  const before = document.createRange();
  before.setStart(tag, 0);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString() === "" && range.collapsed ? null : tag;
}

/**
 * Whether the editor's Enter would split `tag`: the caret inside it before its
 * end, or a selection in it. At its end the tag is whole either side, so
 * Enter there stays the editor's (a new paragraph after a typed tag).
 */
export function enterWouldSplit(tag: Element): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return true;
  const after = document.createRange();
  after.setStart(range.endContainer, range.endOffset);
  after.setEnd(tag, tag.childNodes.length);
  return after.toString().replace(/\u200B/g, "") !== "";
}
