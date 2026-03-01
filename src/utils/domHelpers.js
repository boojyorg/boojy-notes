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
      const blockIndex = blocks.findIndex(b => b.id === blockId);
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
 * Place cursor at character offset inside a contentEditable element.
 * IMPORTANT: This must be a pure selection operation — no DOM mutations
 * except adding an empty text node for caret anchoring.
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
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let textNode, placed = false;
      while (textNode = walker.nextNode()) {
        if (remaining <= textNode.length) {
          range.setStart(textNode, remaining);
          placed = true;
          break;
        }
        remaining -= textNode.length;
      }
      if (!placed) { range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range); return true; }
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch (_) {
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
    } catch (__) {
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
  const edgeZone = 60, maxSpeed = 12;
  if (pointerY < rect.top + edgeZone) {
    const factor = Math.max(0, 1 - (pointerY - rect.top) / edgeZone);
    scrollEl.scrollTop -= maxSpeed * factor;
  } else if (pointerY > rect.bottom - edgeZone) {
    const factor = Math.max(0, 1 - (rect.bottom - pointerY) / edgeZone);
    scrollEl.scrollTop += maxSpeed * factor;
  }
}

/**
 * Check if a block type is editable (has text content).
 */
export function isEditableBlock(b) {
  return b.type !== "spacer" && b.type !== "image";
}
