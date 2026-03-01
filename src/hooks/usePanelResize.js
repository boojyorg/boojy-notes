import { useRef } from "react";

export function usePanelResize({
  sidebarHandles, rightPanelHandles, setSidebarWidth, setRightPanelWidth, chromeBg,
}) {
  const isDragging = useRef(false);

  const startDrag = (e) => {
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
      sidebarHandles.current.forEach(h => h && (h.style.background = ""));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startRightDrag = (e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.documentElement.classList.add("sidebar-dragging");
    const onMove = (ev) => {
      if (!isDragging.current) return;
      setRightPanelWidth(Math.min(500, Math.max(140, window.innerWidth - ev.clientX)));
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.documentElement.classList.remove("sidebar-dragging");
      rightPanelHandles.current.forEach(h => h && (h.style.background = ""));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return { isDragging, startDrag, startRightDrag };
}
