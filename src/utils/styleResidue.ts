import { caretOffsetAt, caretRangeAt } from "./domHelpers";

/**
 * What Chromium leaves when the last character of an inline element it has
 * no command for (a code span) is deleted and typing goes on: the element's
 * look, copied onto the new text as `<font face>` and a `<span style>`. The
 * renderer writes neither inside a text root or a field (its spans carry a
 * class), and the walker reads them as plain text, so the file was right
 * while the screen showed code. A sealed element's inside (a formula KaTeX
 * drew, whose spans are class-less and styled) is never the editor's text.
 */
const RESIDUE = "font, span[style]:not([class])";

/**
 * Unwrap Chromium's style residue inside `root` (a surface from
 * `editedSurface`, whose content only the renderer writes), keeping the text and the
 * selection where they are (as visible-character offsets: moving a text node
 * out of its wrapper would drop a selection inside it). Says whether anything
 * was unwrapped.
 */
export function shedStyleResidue(root: Element | null): boolean {
  if (!root) return false;
  // Descendants only, and none inside a sealed element *within* the root (a
  // table's own wrapper above a cell is sealed and is not the cell's text).
  const sealed = (el: Element) => {
    for (let n = el.parentElement; n && n !== root; n = n.parentElement) {
      if (n.getAttribute("contenteditable") === "false") return true;
    }
    return false;
  };
  const residue = [...root.querySelectorAll(RESIDUE)].filter((el) => el !== root && !sealed(el));
  if (!residue.length) return false;
  const sel = window.getSelection();
  const inside = !!sel?.rangeCount && root.contains(sel.anchorNode) && root.contains(sel.focusNode);
  const anchor = inside && sel ? caretOffsetAt(root, sel.anchorNode, sel.anchorOffset) : -1;
  const focus = inside && sel ? caretOffsetAt(root, sel.focusNode, sel.focusOffset) : -1;
  // Innermost first, so a wrapper's children are already its text.
  for (const el of residue.reverse()) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
  }
  if (sel && anchor >= 0 && focus >= 0) {
    const a = caretRangeAt(root, anchor);
    const f = caretRangeAt(root, focus);
    if (a && f)
      sel.setBaseAndExtent(a.startContainer, a.startOffset, f.startContainer, f.startOffset);
  }
  return true;
}

/**
 * The element an input edited whose content is the renderer's alone: a field
 * that owns its text (a cell, a callout's body), else the text root of a block
 * that holds text (`textRootOf`: the block's registered element). Only what is
 * *inside* it is ever unwrapped: the root itself is React's, and a quote's root
 * is a `<span style>` with no class, which the residue rule would match.
 */
export function editedSurface(
  node: Node | null,
  textRootOf: (blockEl: Element) => Element | null,
): Element | null {
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  if (!el) return null;
  const field = el.closest("[data-inline-field]");
  if (field) return field;
  const block = el.closest("[data-block-id]");
  const root = block ? textRootOf(block) : null;
  return root?.contains(el) ? root : null;
}
