// Pure DOM utility functions for the block editor.

/**
 * Walk up DOM from a node to find the nearest ancestor with [data-block-id].
 * @param {Node} node - Starting DOM node
 * @param {HTMLElement} editorEl - The editor container element
 * @param {Array} blocks - Current blocks array
 * @param {Object} blockRefs - Map of blockId → DOM element
 * @returns {{ el, blockIndex, blockId } | null}
 */
export function getBlockFromNode(node, editorEl, blocks, blockRefs) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== editorEl) {
    if (el.dataset && el.dataset.blockId) {
      const blockId = el.dataset.blockId;
      if (!blocks) return null;
      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return null;
      return { el: blockRefs[blockId], blockIndex, blockId };
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Remove child nodes from editor that don't have a data-block-id attribute.
 */
export function cleanOrphanNodes(editorEl) {
  if (!editorEl) return;
  for (const child of Array.from(editorEl.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && child.dataset?.blockId) continue;
    editorEl.removeChild(child);
  }
}

/**
 * Find the nearest block to the current cursor position.
 */
export function findNearestBlock(sel, blocks, blockRefs) {
  if (!blocks || blocks.length === 0) return null;
  const range = sel.getRangeAt(0);
  const cursorRect = range.getBoundingClientRect();
  if (cursorRect.top === 0 && cursorRect.bottom === 0) {
    const lastIdx = blocks.length - 1;
    return { blockIndex: lastIdx, blockId: blocks[lastIdx].id };
  }
  let closestIdx = blocks.length - 1;
  let closestDist = Infinity;
  for (let i = 0; i < blocks.length; i++) {
    const el = blockRefs[blocks[i].id];
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    const blockCenter = (rect.top + rect.bottom) / 2;
    const dist = Math.abs(cursorRect.top - blockCenter);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }
  return { blockIndex: closestIdx, blockId: blocks[closestIdx].id };
}

/**
 * What a single-line contentEditable field (the note title) says. An emptied
 * field keeps a `<br>` for the caret, which `innerText` reads as "\n"; taken
 * literally that became a title of "\n" and a file called `_.md`. Trailing
 * line breaks are the field's, not the title's. Falls back to `textContent`
 * where `innerText` is not implemented (jsdom).
 */
export function titleFieldText(el) {
  const raw = typeof el.innerText === "string" ? el.innerText : (el.textContent ?? "");
  return raw.replace(/\n+$/, "");
}

/**
 * The zero-width space that holds the caret just outside a link. Chromium
 * canonicalises a caret at the edge of an inline element to *inside* it, so
 * text typed after a rendered `[[wikilink]]` or `<a>` went into the link and
 * rewrote its alias; a boundary between a link and a following text node is
 * canonicalised the same way. A zero-width space is the one anchor Chromium
 * honours. It is transient DOM: both DOM→Markdown walkers drop it, the caret
 * arithmetic here ignores it, and the next repaint from state wipes it.
 */
export const CARET_ANCHOR = "\u200B";
const ANCHOR_RE = /\u200B/g;
const LINK_SELECTOR = "a, .wikilink";

const isIcon = (textNode) => textNode.parentElement?.classList?.contains("external-link-icon");

/**
 * A block's final <br> is Chromium's way of keeping an empty last line
 * visible (or an artifact after a delete); it stands for no character. Every
 * other <br> is a soft break and counts as the "\n" in the block's text.
 */
const isTrailingBr = (br, el) => br === el.lastChild;

const isBr = (node) => node.nodeType === Node.ELEMENT_NODE && node.nodeName === "BR";

/**
 * How many caret positions a block holds: its text (icons and caret anchors
 * aside) plus one per soft-break <br>. This is the length of the block's
 * Markdown text, which is what the caret arithmetic is measured in.
 */
export function caretLength(el) {
  if (!el) return 0;
  let n = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!isIcon(node)) n += node.data.replace(ANCHOR_RE, "").length;
    } else if (isBr(node) && !isTrailingBr(node, el)) {
      n++;
    }
  }
  return n;
}

/** The link (`<a>` or wikilink span) inside `el` that `node` sits in, if any. */
function enclosingLink(node, el) {
  const link = (node.nodeType === Node.TEXT_NODE ? node.parentElement : node)?.closest(
    LINK_SELECTOR,
  );
  return link && link !== el && el.contains(link) ? link : null;
}

/** Whether `textNode` is the last real text (icons aside) inside `link`. */
function isLastTextIn(link, textNode) {
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  let last = null;
  let n;
  while ((n = walker.nextNode())) if (!isIcon(n)) last = n;
  return last === textNode;
}

/**
 * Move `range` to just after `link`, on a caret anchor: reusing one already
 * there, else inserting one. A caret placed here stays outside the link.
 */
function anchorAfterLink(range, link) {
  const next = link.nextSibling;
  if (next?.nodeType === Node.TEXT_NODE && next.data.startsWith(CARET_ANCHOR)) {
    range.setStart(next, 1);
    return;
  }
  const anchor = document.createTextNode(CARET_ANCHOR);
  link.after(anchor);
  range.setStart(anchor, 1);
}

/** Raw index in `data` of the `visible`-th character, anchors not counted. */
function rawIndex(data, visible) {
  let seen = 0;
  for (let i = 0; i < data.length; i++) {
    if (seen === visible) return i;
    if (data[i] !== CARET_ANCHOR) seen++;
  }
  return data.length;
}

/**
 * Character offset of the caret inside `el`, counted the way `placeCaret`
 * counts (text nodes in document order, decorative link icons and caret
 * anchors skipped), or -1 when the selection is collapsed somewhere else or
 * absent. `placeCaret(el, getCaretOffset(el))` is the identity, which is what
 * lets a block repaint its innerHTML without losing the caret.
 */
export function getCaretOffset(el) {
  if (!el) return -1;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return -1;
  const { anchorNode, anchorOffset } = sel;
  if (!anchorNode || !el.contains(anchorNode)) return -1;
  try {
    const range = document.createRange();
    range.setStart(el, 0);
    range.setEnd(anchorNode, anchorOffset);
    let offset = range.toString().replace(ANCHOR_RE, "").length;
    // placeCaret never counts the ↗ inside external links; neither do we.
    for (const icon of el.querySelectorAll(".external-link-icon")) {
      if (range.intersectsNode(icon)) offset -= icon.textContent.length;
    }
    // A soft-break <br> before the caret is one character of the text.
    for (const br of el.querySelectorAll("br")) {
      if (!isTrailingBr(br, el) && range.comparePoint(br, 0) <= 0) offset++;
    }
    return Math.max(0, offset);
  } catch {
    return -1;
  }
}

/**
 * Place cursor at character offset inside a contentEditable element.
 * IMPORTANT: This must be a pure selection operation — no DOM mutations
 * except adding a text node for caret anchoring (empty at the start of an
 * empty element, a CARET_ANCHOR after a link).
 *
 * A position at the very end of a link's text is placed just *after* the
 * link, on an anchor, so that typing there continues as prose. Other inline
 * formatting (bold, italic) keeps the browser's own behaviour: typing at the
 * end of bold text extends the bold, as in every editor.
 */
export function placeCaret(el, pos = 0) {
  if (!el || !el.isConnected) return false;
  try {
    let ancestor = el.parentElement;
    while (ancestor && ancestor.contentEditable !== "true") ancestor = ancestor.parentElement;
    if (ancestor) ancestor.focus();
    const range = document.createRange();
    const sel = window.getSelection();
    if (el.childNodes.length === 0) {
      el.appendChild(document.createTextNode(""));
      range.setStart(el.firstChild, 0);
    } else if (el.childNodes.length === 1 && el.firstChild.nodeName === "BR") {
      range.setStart(el, 0);
    } else if (pos === 0) {
      range.setStart(el.firstChild, 0);
    } else {
      let remaining = pos;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let textNode,
        placed = false;
      while ((textNode = walker.nextNode())) {
        if (textNode.nodeType === Node.ELEMENT_NODE) {
          // A soft-break <br> is one character; landing on it puts the caret
          // just after it, at the start of the next line.
          if (isBr(textNode) && !isTrailingBr(textNode, el)) {
            if (remaining <= 1) {
              range.setStartAfter(textNode);
              placed = true;
              break;
            }
            remaining--;
          }
          continue;
        }
        // Skip decorative icon text nodes (↗ inside links)
        if (isIcon(textNode)) continue;
        const visibleLength = textNode.data.replace(ANCHOR_RE, "").length;
        if (remaining <= visibleLength) {
          const link = enclosingLink(textNode, el);
          if (remaining === visibleLength && link && isLastTextIn(link, textNode)) {
            anchorAfterLink(range, link);
          } else {
            range.setStart(textNode, rawIndex(textNode.data, remaining));
          }
          placed = true;
          break;
        }
        remaining -= visibleLength;
      }
      if (!placed) {
        const last = el.lastChild;
        const link = last?.nodeType === Node.ELEMENT_NODE ? enclosingLink(last, el) : null;
        if (link) {
          anchorAfterLink(range, link);
        } else {
          range.selectNodeContents(el);
          range.collapse(false);
        }
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    try {
      let ancestor = el.parentElement;
      while (ancestor && ancestor.contentEditable !== "true") ancestor = ancestor.parentElement;
      if (ancestor) ancestor.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(el, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Auto-scroll a container when pointer is near its edges.
 */
export function runAutoScroll(scrollEl, pointerY) {
  if (!scrollEl) return;
  const rect = scrollEl.getBoundingClientRect();
  const edgeZone = 60,
    maxSpeed = 12;
  if (pointerY < rect.top + edgeZone) {
    const factor = Math.max(0, 1 - (pointerY - rect.top) / edgeZone);
    scrollEl.scrollTop -= maxSpeed * factor;
  } else if (pointerY > rect.bottom - edgeZone) {
    const factor = Math.max(0, 1 - (rect.bottom - pointerY) / edgeZone);
    scrollEl.scrollTop += maxSpeed * factor;
  }
}

/**
 * Swallow the synthetic `click` the browser fires after a pointerup that ended
 * a drag. Without this, releasing a dragged sidebar note over its own row opens
 * it, and releasing a block ghost re-places the caret under the pointer. One
 * shot: the listener removes itself on the first click or after `ttl` ms.
 */
export function suppressNextClick(ttl = 200) {
  const onClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    window.removeEventListener("click", onClick, true);
  };
  window.addEventListener("click", onClick, true);
  setTimeout(() => window.removeEventListener("click", onClick, true), ttl);
}

/**
 * Check if a block type is editable (has text content).
 */
export function isEditableBlock(b) {
  return (
    b.type !== "spacer" &&
    b.type !== "image" &&
    b.type !== "file" &&
    b.type !== "code" &&
    b.type !== "table" &&
    b.type !== "callout" &&
    b.type !== "frontmatter"
  );
}
