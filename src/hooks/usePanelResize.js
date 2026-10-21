import { useRef, useCallback } from "react";
import { SIDEBAR_MIN_W, SIDEBAR_MAX_W } from "../constants/layout";

/**
 * Paint the divider's pieces. Held or hovered, the line is 2px, centred: half
 * a pixel of shadow each side (a device pixel on Retina), so nothing in the
 * layout moves and the sidebar's scrollbar keeps most of its gap. The colour is set, never cleared: React
 * would not repaint a style prop it thinks unchanged, and the line would vanish.
 */
export function paintHandles(handles, colour, wide) {
  for (const handle of handles) {
    if (!handle) continue;
    handle.style.background = colour;
    handle.style.boxShadow = wide ? `-0.5px 0 0 ${colour}, 0.5px 0 0 ${colour}` : "";
  }
}

/**
 * `maxWidth` is the widest the divider may be dragged to right now: the
 * sidebar's own maximum, or less when the window cannot hold that beside an
 * editor at its floor (LayoutContext computes it). Without it a drag could
 * set a preference the window then capped, and the divider would stop
 * following the pointer with no sign of why.
 */
export function usePanelResize({
  sidebarHandles,
  setSidebarWidth,
  maxWidth = SIDEBAR_MAX_W,
  handleActiveBg,
  handleHoverBg,
  handleRestBg,
  sidebarWidth,
}) {
  const isDragging = useRef(false);

  const startDrag = useCallback(
    (e) => {
      e.preventDefault();
      isDragging.current = true;
      // The grab area is wider than the line, so keep where in it the press
      // landed: else a press beside the line makes the divider jump to it.
      const grab = sidebarWidth == null ? 0 : Math.round(e.clientX - sidebarWidth);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.documentElement.classList.add("sidebar-dragging");
      // Held state: one step stronger than hover, still neutral.
      if (handleActiveBg) paintHandles(sidebarHandles.current, handleActiveBg, true);
      const onMove = (ev) => {
        if (!isDragging.current) return;
        setSidebarWidth(Math.min(maxWidth, Math.max(SIDEBAR_MIN_W, ev.clientX - grab)));
      };
      const onUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.documentElement.classList.remove("sidebar-dragging");
        // Hover if the pointer stayed on the line.
        const hovered = sidebarHandles.current.some((h) => h?.matches(":hover"));
        paintHandles(sidebarHandles.current, hovered ? handleHoverBg : handleRestBg, hovered);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [
      setSidebarWidth,
      sidebarHandles,
      maxWidth,
      handleActiveBg,
      handleHoverBg,
      handleRestBg,
      sidebarWidth,
    ],
  );

  return { isDragging, startDrag };
}
