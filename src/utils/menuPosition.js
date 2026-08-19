// @ts-check

/**
 * Shared viewport-aware placement for fixed-position menus (the note-actions
 * ··· menu, the slash menu, and any future popover). One rule set:
 *
 *   1. honour the anchor position where possible
 *   2. keep a small margin from every viewport edge
 *   3. flip to the anchor's other side when the preferred side overflows
 *   4. clamp as the final fallback
 *
 * Interactive menu content must never render outside the viewport.
 *
 * @param {{ top: number, bottom: number, left: number, right: number }} anchor
 *   The anchor's viewport rect. A point anchor (e.g. a right-click position)
 *   passes the same value for top/bottom and left/right.
 * @param {{ width: number, height: number }} size The menu's rendered size.
 * @param {{ margin?: number, gapY?: number, viewport?: { width: number, height: number } }} [opts]
 *   `margin` — minimum distance from the viewport edges (default 8).
 *   `gapY` — vertical gap between anchor and menu (default 0).
 *   `viewport` — injectable for tests; defaults to the window size.
 * @returns {{ left: number, top: number }}
 */
export function positionMenu(anchor, size, opts = {}) {
  const { margin = 8, gapY = 0 } = opts;
  const vw = opts.viewport?.width ?? window.innerWidth;
  const vh = opts.viewport?.height ?? window.innerHeight;

  const clamp = (value, max) => Math.min(Math.max(value, margin), Math.max(margin, max));

  // Horizontal: prefer left-aligned to the anchor; flip to right-aligned when
  // that overflows the right edge, then clamp.
  let left = anchor.left;
  if (left + size.width > vw - margin) {
    left = anchor.right - size.width;
  }
  left = clamp(left, vw - size.width - margin);

  // Vertical: prefer below the anchor; flip above when that overflows and
  // there is room, then clamp.
  let top = anchor.bottom + gapY;
  if (top + size.height > vh - margin) {
    const above = anchor.top - gapY - size.height;
    if (above >= margin) top = above;
  }
  top = clamp(top, vh - size.height - margin);

  return { left, top };
}
