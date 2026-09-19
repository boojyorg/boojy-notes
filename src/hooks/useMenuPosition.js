import { useLayoutEffect, useState } from "react";
import { positionMenu } from "../utils/menuPosition";

/**
 * Measures a fixed-position menu after render and returns a viewport-clamped
 * `{ left, top }` via positionMenu(). Render the menu at the anchor first —
 * the layout effect corrects the position before paint, so there is no
 * visible jump.
 *
 * @param {{ current: HTMLElement | null }} ref The menu element.
 * @param {boolean} open Whether the menu is showing.
 * @param {{ top: number, bottom: number, left: number, right: number } | null} anchor
 * @param {{ margin?: number, gapY?: number, align?: "start" | "end", reflowKey?: unknown }} [opts]
 *   `align` — which edge meets the anchor's (`positionMenu`).
 *   `reflowKey` — pass anything that changes the menu's size (item count,
 *   an open submenu) so the position is recomputed.
 */
export function useMenuPosition(ref, open, anchor, opts = {}) {
  const { margin, gapY, align, reflowKey } = opts;
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) {
      setPos(null);
      return;
    }
    const { width, height } = ref.current.getBoundingClientRect();
    const next = positionMenu(anchor, { width, height }, { margin, gapY, align });
    setPos((prev) => (prev && prev.left === next.left && prev.top === next.top ? prev : next));
  }, [
    ref,
    open,
    anchor?.top,
    anchor?.bottom,
    anchor?.left,
    anchor?.right,
    margin,
    gapY,
    align,
    reflowKey,
  ]);

  return pos;
}
