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
    // Only a block that can hold a caret is a landing spot; a divider is in the
    // ref map for the gutter grip, not for the caret.
    if (!isEditableBlock(blocks[i])) continue;
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
 * The caret anchor: a `<span class="caret-anchor">` holding one zero-width
 * space, placed just after a link (or a completed tag) for the caret to rest
 * on. Chromium canonicalises a caret at the edge of an inline element to
 * *inside* it, so text typed after a rendered `[[wikilink]]` or `<a>` went into
 * the link and rewrote its alias; a boundary between a link and a following
 * text node is canonicalised the same way. A zero-width space is the one
 * anchor Chromium honours, and the element around it is what tells the
 * scaffolding from note text: a file's own U+200B is content and is kept,
 * the anchor's is dropped by the DOM→Markdown walker and the sanitiser,
 * ignored by the caret arithmetic here, and wiped by the next repaint from
 * state. Text typed on
 * the anchor lands inside the span, which the walkers read as prose.
 */
export const CARET_ANCHOR = "\u200B";
export const CARET_ANCHOR_CLASS = "caret-anchor";
const ANCHOR_RE = /\u200B/g;
const LINK_SELECTOR = "a, .wikilink";

/** A fresh anchor element, its zero-width space inside. */
export function makeCaretAnchor() {
  const span = document.createElement("span");
  span.className = CARET_ANCHOR_CLASS;
  span.appendChild(document.createTextNode(CARET_ANCHOR));
  return span;
}

/** Whether `node` is a caret anchor element. */
export const isCaretAnchor = (node) =>
  node?.nodeType === Node.ELEMENT_NODE && node.classList.contains(CARET_ANCHOR_CLASS);

/** Whether `textNode` sits inside a caret anchor, where its U+200B is scaffolding. */
const inAnchor = (textNode) => !!textNode.parentElement?.closest(`.${CARET_ANCHOR_CLASS}`);

/** A text node's characters as the block's text counts them. */
const visibleText = (textNode) =>
  inAnchor(textNode) ? textNode.data.replace(ANCHOR_RE, "") : textNode.data;

/**
 * A link's own text: what `[text](url)` holds between the brackets, the
 * decorative ↗ icon left out. A ↗ typed into the text is text.
 */
export function linkText(link) {
  let s = "";
  for (const n of link.childNodes)
    if (!(n.nodeType === Node.ELEMENT_NODE && n.classList.contains("external-link-icon")))
      s += n.textContent;
  return s;
}

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
      if (!isIcon(node)) n += visibleText(node).length;
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

/** Whether `textNode` is the first real text (icons aside) inside `link`. */
function isFirstTextIn(link, textNode) {
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) if (!isIcon(n)) return n === textNode;
  return false;
}

/**
 * The link a caret at offset 0 of `el` would land inside: the one holding
 * the block's first character. An empty anchor before it is scaffolding and
 * does not count; text typed on one does, and is prose outside any link.
 */
function leadingLink(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (isIcon(n) || (inAnchor(n) && visibleText(n).length === 0)) continue;
    return enclosingLink(n, el);
  }
  return null;
}

/**
 * Move `range` to just after `link`, on a caret anchor: reusing one already
 * there, else inserting one. A caret placed here stays outside the link.
 */
function anchorAfterLink(range, link) {
  let anchor = link.nextSibling;
  if (!isCaretAnchor(anchor)) {
    anchor = makeCaretAnchor();
    link.after(anchor);
  }
  range.setStart(anchorSpace(anchor), 1);
}

/**
 * The mirror at the link's start: move `range` to just before `link`, on a
 * caret anchor. Chromium canonicalises a caret at offset 0 of a block's
 * first text node to inside the link that holds it, where a typed character
 * became the alias's first; after the anchor's zero-width space it stays put.
 */
function anchorBeforeLink(range, link) {
  let anchor = link.previousSibling;
  if (!isCaretAnchor(anchor)) {
    anchor = makeCaretAnchor();
    link.before(anchor);
  }
  range.setStart(anchorSpace(anchor), 1);
}

/** The anchor's zero-width-space text node, put back if it was deleted out from under the span. */
function anchorSpace(anchor) {
  let text = anchor.firstChild;
  if (text?.nodeType !== Node.TEXT_NODE || !text.data.startsWith(CARET_ANCHOR)) {
    text = document.createTextNode(CARET_ANCHOR);
    anchor.prepend(text);
  }
  return text;
}

/** Raw index in an anchor's `data` of the `visible`-th character, its U+200B not counted. */
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
  return caretOffsetAt(el, sel.anchorNode, sel.anchorOffset);
}

/** `getCaretOffset` for any point (`node`, `offset`) inside `el`, not just the caret. */
export function caretOffsetAt(el, node, offset) {
  if (!el || !node || !el.contains(node)) return -1;
  try {
    const range = document.createRange();
    range.setStart(el, 0);
    range.setEnd(node, offset);
    let pos = range.toString().length;
    // placeCaret never counts the ↗ inside external links; neither do we.
    for (const icon of el.querySelectorAll(".external-link-icon")) {
      if (range.intersectsNode(icon)) pos -= icon.textContent.length;
    }
    // Nor an anchor's zero-width space that lies before the caret.
    for (const anchor of el.querySelectorAll(`.${CARET_ANCHOR_CLASS}`)) {
      for (const text of anchor.childNodes) {
        if (text.nodeType !== Node.TEXT_NODE) continue;
        for (let i = 0; i < text.data.length; i++) {
          if (text.data[i] === CARET_ANCHOR && range.comparePoint(text, i + 1) <= 0) pos--;
        }
      }
    }
    // A soft-break <br> before the caret is one character of the text.
    for (const br of el.querySelectorAll("br")) {
      if (!isTrailingBr(br, el) && range.comparePoint(br, 0) <= 0) pos++;
    }
    return Math.max(0, pos);
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
 * link, on an anchor, so that typing there continues as prose; offset 0 of a
 * block that begins with a link is placed just *before* it, the same way.
 * Other inline formatting (bold, italic) keeps the browser's own behaviour:
 * typing at the end of bold text extends the bold, as in every editor.
 */
export function placeCaret(el, pos = 0) {
  if (!el || !el.isConnected) return false;
  let ancestor = el.parentElement;
  while (ancestor && ancestor.contentEditable !== "true") ancestor = ancestor.parentElement;
  if (ancestor) ancestor.focus();
  const range = caretRangeAt(el, pos);
  if (!range) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

/**
 * The collapsed range `placeCaret` would select for character offset `pos`
 * inside `el`, or null when none can be made. Same arithmetic as
 * `caretOffsetAt`, in reverse, so the two round-trip.
 */
export function caretRangeAt(el, pos = 0) {
  if (!el) return null;
  try {
    const range = document.createRange();
    if (el.childNodes.length === 0) {
      el.appendChild(document.createTextNode(""));
      range.setStart(el.firstChild, 0);
    } else if (el.childNodes.length === 1 && el.firstChild.nodeName === "BR") {
      range.setStart(el, 0);
    } else if (pos === 0) {
      const link = leadingLink(el);
      if (link) anchorBeforeLink(range, link);
      else range.setStart(el.firstChild, 0);
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
        const visibleLength = visibleText(textNode).length;
        if (remaining <= visibleLength) {
          const link = enclosingLink(textNode, el);
          if (remaining === visibleLength && link && isLastTextIn(link, textNode)) {
            anchorAfterLink(range, link);
          } else {
            const raw = inAnchor(textNode) ? rawIndex(textNode.data, remaining) : remaining;
            range.setStart(textNode, raw);
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
          return range;
        }
      }
    }
    range.collapse(true);
    return range;
  } catch {
    try {
      const range = document.createRange();
      range.setStart(el, 0);
      range.collapse(true);
      return range;
    } catch {
      return null;
    }
  }
}

/**
 * Move a collapsed caret that Chromium has put at the very end of a link's
 * text (End, a click past the link or on its right edge, ArrowRight through
 * it) onto the anchor after the link, the position `placeCaret` would have
 * chosen. Called from the editor's `beforeinput` listener, so it runs only
 * when text is about to be inserted: caret movement, selection, deletion and
 * IME composition are never touched, and a caret anywhere short of the link's
 * last character (alias editing) is left where it is. Returns whether the
 * caret moved. Insertion then lands outside the link, so a typed continuation
 * is prose rather than a rewritten alias.
 */
export function caretOutOfLinkEnd(root) {
  const caret = collapsedTextCaret(root);
  if (!caret || caret.offset !== caret.node.data.length) return false;
  const link = enclosingLink(caret.node, root);
  if (!link || !isLastTextIn(link, caret.node)) return false;
  return selectAnchor(anchorAfterLink, link);
}

/**
 * The mirror of `caretOutOfLinkEnd` at a link's start: a collapsed caret at
 * offset 0 of a link's first text node (Home, or a click at the link's left
 * edge, when the link opens the block) is moved onto the anchor before the
 * link, so the insertion lands in front of it as prose rather than as the
 * first character of its alias. Called from the same `beforeinput` listener,
 * with the same limits: insertions only, a caret anywhere past the link's
 * first character is alias editing and is left alone.
 */
export function caretOutOfLinkStart(root) {
  const caret = collapsedTextCaret(root);
  if (!caret || caret.offset !== 0) return false;
  const link = enclosingLink(caret.node, root);
  if (!link || !isFirstTextIn(link, caret.node)) return false;
  return selectAnchor(anchorBeforeLink, link);
}

/** The collapsed caret inside `root`, when it rests in a text node that is not a link's icon. */
function collapsedTextCaret(root) {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const { anchorNode: node, anchorOffset: offset } = sel;
  if (node?.nodeType !== Node.TEXT_NODE || !root.contains(node) || isIcon(node)) return null;
  return { node, offset };
}

/** Select the anchor `place` makes beside `link`; whether the caret moved. */
function selectAnchor(place, link) {
  try {
    const range = document.createRange();
    place(range, link);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}

/**
 * The CSS zoom in effect on `el`: the factor between the viewport pixels that
 * `getBoundingClientRect()` and `clientX`/`clientY` report and the CSS pixels a
 * `top` or `left` written on `el` is read in. The app's UI scale is `zoom` on
 * `<html>` (SettingsContext), and Chromium 128+ and Firefox 126+ report
 * geometry already multiplied by it, so a distance measured between two rects
 * is divided by this before it becomes a style, or the style is scaled a
 * second time on paint (the block grip drifted down the note by the scale
 * factor at any setting but 100%, 2026-09-10). 1 where the browser has no
 * zoom, jsdom included.
 */
export function cssZoom(el) {
  const z = el?.currentCSSZoom;
  return typeof z === "number" && z > 0 ? z : 1;
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
 * The field a special block owns, for the caret: a code block's textarea, a
 * callout's title (its first field), a table's first cell. Found by the
 * block's wrapper, because a code block or callout registers no text root in
 * the block ref map, and a table registers its wrapper for the gutter grip
 * only (its fields are its own; see useOwnedField). `edge` is the side the
 * caret arrives from: `"end"` is the field a caret moving *up* into the block
 * should land in, which for a table is the first cell of its last row (the
 * arrows walk the grid; entering from below at the top would skip every row).
 * Every other block has one field to enter. Null for a text block, for a
 * block with no field (divider, image, file, embed) and for a block that is
 * not on screen.
 */
export function ownedField(editorEl, blockId, edge = "start") {
  const wrapper = editorEl?.querySelector?.(`[data-block-id="${blockId}"]`);
  if (!wrapper || wrapper.getAttribute("contenteditable") !== "false") return null;
  if (edge === "end" && wrapper.dataset.blockType === "table") {
    const rows = wrapper.querySelectorAll("tr");
    const last = rows[rows.length - 1]?.querySelector("[contenteditable='true']");
    if (last) return last;
  }
  return wrapper.querySelector("textarea, [contenteditable='true']");
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

/**
 * A block that is addressed as a whole: selected, a tinted band appears
 * around it, Backspace or Delete removes it, Enter opens a paragraph under it,
 * and a Backspace or forward Delete arriving from a neighbour selects it
 * rather than stepping over it. Dividers and images (a click selects them,
 * the arrows stop on them) and tables (Escape from a cell selects; the arrows
 * walk through the cells instead of stopping, see `ownedField`). Code,
 * callout and file blocks own their focus or carry their own controls and are
 * still skipped; the same rule reaches them once the table has been judged
 * live (2026-09-10).
 */
export function isSelectableBlock(b) {
  return b.type === "spacer" || b.type === "image" || b.type === "table";
}
