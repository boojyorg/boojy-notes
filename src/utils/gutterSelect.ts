import { cssZoom } from "./domHelpers";

/**
 * The block whose gutter strip holds the point: the space between the grip
 * and where the block's content starts. A paragraph's or heading's first
 * letter, a list item's text (so its dot or number is in the strip), a
 * to-do's box (which keeps its tick), the edge of anything else. A press
 * there selects the block (EditorArea), one rule for every kind. A table's
 * edge is its row grips', so a table has no strip. Null when the point is in
 * no strip. `gap` is the grip's distance from the block, in CSS pixels.
 */
export function gutterBlockAt(
  editor: HTMLElement,
  textRoots: Record<string, HTMLElement | null | undefined>,
  x: number,
  y: number,
  gap: number,
): string | null {
  const els = Array.from(editor.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && !!el.dataset.blockId && el.dataset.blockType !== "frontmatter",
  );
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const r = el.getBoundingClientRect();
    const bottom = i + 1 < els.length ? els[i + 1].getBoundingClientRect().top : r.bottom;
    if (y < r.top || y >= bottom) continue;
    if (el.dataset.blockType === "table") return null;
    const zoom = cssZoom(el);
    const start = r.left - gap * zoom;
    return x >= start && x < contentLeft(el, textRoots[el.dataset.blockId ?? ""], r, zoom)
      ? (el.dataset.blockId ?? null)
      : null;
  }
  return null;
}

/** Where a block's content starts, in viewport pixels. */
function contentLeft(
  el: HTMLElement,
  text: HTMLElement | null | undefined,
  r: DOMRect,
  zoom: number,
): number {
  if (el.dataset.blockType === "checkbox") {
    const box = el.querySelector(".checkbox-hit");
    if (box) return box.getBoundingClientRect().left;
  }
  // A list item's or quote's text sits inside its row, after the marker.
  if (text && text !== el && el.contains(text)) return text.getBoundingClientRect().left;
  // A paragraph or heading is its own text: it starts after its indent.
  return r.left + (Number.parseFloat(getComputedStyle(el).paddingLeft) || 0) * zoom;
}
