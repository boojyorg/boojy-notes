import { type RefObject, useLayoutEffect, useState } from "react";
import { cssZoom } from "../utils/domHelpers";
import { positionMenu, restingSize } from "../utils/menuPosition";

/**
 * Measures a fixed-position menu after render and returns a viewport-clamped
 * `{ left, top }` via positionMenu(), ready to use as its style: under the
 * anchor until measured, the layout effect correcting it before paint, so
 * there is no visible jump. Divided by the UI scale here, for every menu: the
 * anchor and the menu are measured under the CSS zoom on <html>, and a
 * `top`/`left` written inside it is scaled again on paint (the slash menu,
 * dividing for itself, once didn't). Null without an anchor.
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

  if (!anchor) return null;
  const zoom = cssZoom(document.documentElement) || 1;
  return {
    top: (pos?.top ?? anchor.bottom + (gapY ?? 0)) / zoom,
    left: (pos?.left ?? anchor.left) / zoom,
  };
}
