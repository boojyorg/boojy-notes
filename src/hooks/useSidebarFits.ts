import { useState, useEffect } from "react";

/**
 * Narrowest editor we're willing to leave beside an in-flow sidebar. Below
 * this the prose column is fighting for room it hasn't got, and handing the
 * sidebar's space back (as an overlay) is worth more than keeping it in view.
 */
export const MIN_EDITOR_WIDTH = 560;

/**
 * Extra width required to bring the sidebar *back* into the layout, on top of
 * the width at which it left. Without this band, parking a window edge exactly
 * on the threshold makes the sidebar flip in and out on every pixel of drag.
 */
export const FIT_HYSTERESIS = 40;

/**
 * Does the sidebar physically fit beside a usable editor?
 *
 * Deliberately arithmetic rather than a breakpoint: the sidebar is
 * user-resizable 200–400px, so any fixed number would be wrong for everyone
 * who dragged it. At the 220px default the sidebar leaves at 780px and returns
 * at 820px; at 400px those become 960 and 1000.
 *
 * This answers only the geometry question. Whether the sidebar is *open* stays
 * the user's business (`collapsed`), and whether this is a touch device is
 * `useIsMobile`. Keeping the three apart is the point of the whole exercise.
 */
export function useSidebarFits(sidebarWidth: number): boolean {
  const [fits, setFits] = useState(() => window.innerWidth >= sidebarWidth + MIN_EDITOR_WIDTH);

  useEffect(() => {
    const measure = () => {
      const threshold = sidebarWidth + MIN_EDITOR_WIDTH;
      setFits((prev) =>
        prev ? window.innerWidth >= threshold : window.innerWidth >= threshold + FIT_HYSTERESIS,
      );
    };
    // Also runs when sidebarWidth changes: dragging the sidebar wider can push
    // the editor under the floor without the window moving at all.
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [sidebarWidth]);

  return fits;
}
