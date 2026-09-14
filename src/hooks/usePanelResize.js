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
}) {
  const isDragging = useRef(false);

  const startDrag = useCallback(
    (e) => {
      e.preventDefault();
      isDragging.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.documentElement.classList.add("sidebar-dragging");
      // Held state: one step stronger than hover, still neutral. Cleared to ""
      // in onUp so the React style prop takes the handle back over.
      if (handleActiveBg) {
        for (const handle of sidebarHandles.current) {
          if (handle) handle.style.background = handleActiveBg;
        }
      }
      const onMove = (ev) => {
        if (!isDragging.current) return;
        setSidebarWidth(Math.min(maxWidth, Math.max(SIDEBAR_MIN_W, ev.clientX)));
      };
      const onUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.documentElement.classList.remove("sidebar-dragging");
        for (const handle of sidebarHandles.current) {
          if (handle) handle.style.background = "";
        }
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setSidebarWidth, sidebarHandles, maxWidth, handleActiveBg],
  );

  return { isDragging, startDrag };
}
