import { useRef, useCallback } from "react";
import { SIDEBAR_MIN_W, SIDEBAR_MAX_W } from "../constants/layout";

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
      if (handleActiveBg) {
        for (const handle of sidebarHandles.current) {
          if (handle) handle.style.background = handleActiveBg;
        }
      }
      const onMove = (ev) => {
        if (!isDragging.current) return;
        setSidebarWidth(Math.min(maxWidth, Math.max(SIDEBAR_MIN_W, ev.clientX - grab)));
      };
      const onUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.documentElement.classList.remove("sidebar-dragging");
        // Set, never cleared: React would not repaint a style prop it thinks
        // unchanged, and the line would vanish. Hover if the pointer stayed.
        const hovered = sidebarHandles.current.some((h) => h?.matches(":hover"));
        for (const handle of sidebarHandles.current) {
          if (handle) handle.style.background = hovered ? handleHoverBg : handleRestBg;
        }
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
