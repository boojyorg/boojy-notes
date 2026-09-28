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
    // A menu arrives growing (.motion-pop's `scale`), and a rect measured a
    // frame into that is 4% short: the flip and clamp would judge a menu
    // smaller than it rests at, and stay wrong. An `!important` declaration
    // outranks an animation, so the menu is measured at its resting scale.
    const el = ref.current;
    const scale = el.style.getPropertyValue("scale");
    const priority = el.style.getPropertyPriority("scale");
    el.style.setProperty("scale", "1", "important");
    const { width, height } = el.getBoundingClientRect();
    if (scale) el.style.setProperty("scale", scale, priority);
    else el.style.removeProperty("scale");
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
