import { useRef, useCallback, useEffect } from "react";
import { useTheme } from "../hooks/useTheme";

const MIN_PX = 250;
const MIN_SECONDARY_PX = 150;

export default function SplitDivider({
  splitMode,
  dividerPosition: _dividerPosition,
  setDividerPosition,
  onSnapClose,
  containerRef,
}) {
  const { theme } = useTheme();
  const dragging = useRef(false);
  const dividerRef = useRef(null);
  const cleanupRef = useRef(null);

  // Clean up window listeners if component unmounts mid-drag
  useEffect(
    () => () => {
      if (cleanupRef.current) cleanupRef.current();
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      dragging.current = true;
      const container = containerRef?.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerSize = splitMode === "vertical" ? containerRect.width : containerRect.height;
      const containerStart = splitMode === "vertical" ? containerRect.left : containerRect.top;

      document.body.style.cursor = splitMode === "vertical" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev) => {
        const pos = splitMode === "vertical" ? ev.clientX : ev.clientY;
        const offset = pos - containerStart;
        let pct = (offset / containerSize) * 100;

        // Min constraints
        const minPct = (MIN_PX / containerSize) * 100;
        const maxPct = 100 - (MIN_SECONDARY_PX / containerSize) * 100;

        // Snap-close detection: if dragged past minimum, close pane
        if (pct < minPct * 0.5) {
          onSnapClose?.("left");
          cleanup();
          return;
        }
        if (pct > 100 - minPct * 0.5) {
          onSnapClose?.("right");
          cleanup();
          return;
        }

        pct = Math.max(minPct, Math.min(maxPct, pct));
        setDividerPosition(pct);
      };

      const cleanup = () => {
        dragging.current = false;
        cleanupRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      cleanupRef.current = cleanup;

      const onUp = () => cleanup();

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [splitMode, setDividerPosition, onSnapClose, containerRef],
  );

  const handleDoubleClick = useCallback(() => {
    setDividerPosition(50);
  }, [setDividerPosition]);

  return (
    <div
      ref={dividerRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      style={{
        width: splitMode === "vertical" ? 4 : "100%",
        height: splitMode === "vertical" ? "100%" : 4,
        cursor: splitMode === "vertical" ? "col-resize" : "row-resize",
        background: theme.BG.editor,
        borderRight: splitMode === "vertical" ? `1px solid ${theme.BG.divider}` : "none",
        borderBottom: splitMode === "horizontal" ? `1px solid ${theme.BG.divider}` : "none",
        boxSizing: "border-box",
        flexShrink: 0,
        transition: dragging.current ? "none" : "background 0.15s, border-color 0.15s",
        zIndex: 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = theme.ACCENT.primary;
        e.currentTarget.style.borderColor = "transparent";
      }}
      onMouseLeave={(e) => {
        if (!dragging.current) {
          e.currentTarget.style.background = theme.BG.editor;
          e.currentTarget.style.borderColor = theme.BG.divider;
        }
      }}
    />
  );
}
