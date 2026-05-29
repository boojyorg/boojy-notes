import { useRef, useCallback } from "react";

export function usePanelResize({ sidebarHandles, setSidebarWidth, chromeBg: _chromeBg }) {
  const isDragging = useRef(false);

  const startDrag = useCallback(
    (e) => {
      e.preventDefault();
      isDragging.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.documentElement.classList.add("sidebar-dragging");
      const onMove = (ev) => {
        if (!isDragging.current) return;
        setSidebarWidth(Math.min(400, Math.max(200, ev.clientX)));
      };
      const onUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.documentElement.classList.remove("sidebar-dragging");
        sidebarHandles.current.forEach((h) => h && (h.style.background = ""));
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [setSidebarWidth, sidebarHandles],
  );

  return { isDragging, startDrag };
}
