import { useRef, useCallback } from "react";
import { SIDEBAR_MIN_W, SIDEBAR_MAX_W } from "../constants/layout";

export function usePanelResize({ sidebarHandles, setSidebarWidth, handleActiveBg }) {
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
        setSidebarWidth(Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, ev.clientX)));
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
    [setSidebarWidth, sidebarHandles, handleActiveBg],
  );

  return { isDragging, startDrag };
}
