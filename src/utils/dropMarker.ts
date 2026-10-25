/**
 * The insertion marker the block drag and a file drop share
 * (`.block-drop-marker`, on `<body>`): a line across the column in the gap
 * where the drop lands.
 */

/** How far outside the first or last block the marker sits when there is no neighbour. */
export const EDGE_GAP = 4;

/**
 * The gap's middle in viewport pixels: between the block above (`after`) and
 * the one below (`before`), or just outside the one there is; null with neither.
 */
export function gapY(before: Element | null, after: Element | null): number | null {
  if (before && after)
    return (after.getBoundingClientRect().bottom + before.getBoundingClientRect().top) / 2;
  if (before) return before.getBoundingClientRect().top - EDGE_GAP;
  if (after) return after.getBoundingClientRect().bottom + EDGE_GAP;
  return null;
}

/**
 * Lay the marker across `col` centred on `y`. Both are measured in viewport
 * pixels and styled inside the UI scale's zoom, so they are divided by it;
 * `offsetHeight` is already CSS pixels.
 */
export function placeMarker(marker: HTMLElement, col: DOMRect, y: number, zoom: number) {
  Object.assign(marker.style, {
    left: `${col.left / zoom}px`,
    width: `${col.width / zoom}px`,
    top: `${y / zoom - marker.offsetHeight / 2}px`,
  });
}
