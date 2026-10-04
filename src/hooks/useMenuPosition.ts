import { type RefObject, useLayoutEffect, useState } from "react";
import { positionMenu, restingSize } from "../utils/menuPosition";

/**
 * Measures a fixed-position menu after render and returns a viewport-clamped
 * `{ left, top }` via positionMenu(). Render the menu at the anchor first —
 * the layout effect corrects the position before paint, so there is no
 * visible jump.
 *
 * `opts.align` — which edge meets the anchor's (`positionMenu`).
 * `opts.reflowKey` — pass anything that changes the menu's size (item count,
 * an open submenu) so the position is recomputed.
 */
interface Anchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface MenuPositionOpts {
  margin?: number;
  gapY?: number;
  align?: "start" | "end";
  reflowKey?: unknown;
}

export function useMenuPosition(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  anchor: Anchor | null | undefined,
  opts: MenuPositionOpts = {},
): { left: number; top: number } | null {
  const { margin, gapY, align, reflowKey } = opts;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor || !ref.current) {
      setPos(null);
      return;
    }
    // Measured as it rests, not a frame into its grow-in (`restingSize`).
    const next = positionMenu(anchor, restingSize(ref.current), { margin, gapY, align });
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
