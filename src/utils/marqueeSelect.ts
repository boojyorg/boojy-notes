/**
 * The box a drag from the margin draws (useMarqueeSelect): which blocks it
 * selects. Only its height counts: a block is touched when the box's span of
 * the page overlaps any part of the block's, so a drag straight down the
 * margin selects what it passes, and a block taller than the screen is
 * touched by any part of it. The run goes from the block where the drag
 * started to the one it reached, so Shift+Arrow afterwards grows from the
 * end the pointer is at. A list item touched brings its nested items (the
 * selection's own rule, `subtreeEnd`); a nested item touched alone never
 * brings its parent.
 */

export interface BlockSpan {
  id: string;
  top: number;
  bottom: number;
}

/** How far the pointer moves before a press in the margin becomes a box, in CSS pixels. */
export const MARQUEE_THRESHOLD = 4;

/**
 * The run the box from `startY` to `y` selects, its anchor at the start's
 * side, or null when it touches no block. Spans are in document order, all
 * in one coordinate space with the two heights.
 */
export function marqueeRun(
  spans: readonly BlockSpan[],
  startY: number,
  y: number,
): { anchor: string; head: string } | null {
  const top = Math.min(startY, y);
  const bottom = Math.max(startY, y);
  let first = -1;
  let last = -1;
  for (let i = 0; i < spans.length; i++) {
    if (spans[i].bottom < top || spans[i].top > bottom) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return null;
  const down = y >= startY;
  return {
    anchor: spans[down ? first : last].id,
    head: spans[down ? last : first].id,
  };
}

/** How far the page scrolls this frame with the pointer at `y` near a pane from `top` to `bottom`. */
export function autoScrollStep(y: number, top: number, bottom: number, edge = 48): number {
  if (y < top + edge) return -Math.ceil((top + edge - y) / 4);
  if (y > bottom - edge) return Math.ceil((y - (bottom - edge)) / 4);
  return 0;
}
