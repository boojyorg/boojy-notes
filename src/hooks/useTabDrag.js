import { useRef, useEffect, useCallback } from "react";

const HOLD_DELAY = 200;
const EDGE_ZONE = 0.1; // 10% of editor area

export function useTabDrag({
  splitState,
  splitPaneWithNote,
  moveTabToPane,
  openNoteInPane,
  setTabsForPane,
  closePaneIfEmpty,
  accentColor,
  chromeBg,
}) {
  const drag = useRef({
    active: false,
    noteId: null,
    sourcePaneId: null,
    cloneEl: null,
    holdTimer: null,
    startX: 0,
    startY: 0,
    overlay: null,
    moveHandler: null,
    upHandler: null,
  });

  const cleanup = useCallback(() => {
    const d = drag.current;
    if (d.cloneEl?.parentNode) d.cloneEl.parentNode.removeChild(d.cloneEl);
    if (d.overlay?.parentNode) d.overlay.parentNode.removeChild(d.overlay);
    if (d.holdTimer) clearTimeout(d.holdTimer);
    document.body.classList.remove("block-dragging");
    if (d.moveHandler) window.removeEventListener("pointermove", d.moveHandler);
    if (d.upHandler) window.removeEventListener("pointerup", d.upHandler);
    d.active = false;
    d.noteId = null;
    d.sourcePaneId = null;
    d.cloneEl = null;
    d.holdTimer = null;
    d.overlay = null;
    d.moveHandler = null;
    d.upHandler = null;
  }, []);

  const getDropZone = useCallback((clientX, clientY) => {
    // Find the editor area (the main area between sidebar and right panel)
    const editorArea = document.querySelector("[data-split-container]") ||
      document.querySelector(".editor-scroll");
    if (!editorArea) return null;

    const rect = editorArea.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right ||
        clientY < rect.top || clientY > rect.bottom) {
      return null;
    }

    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;

    if (relX < EDGE_ZONE) return { direction: "vertical", side: "left", rect };
    if (relX > 1 - EDGE_ZONE) return { direction: "vertical", side: "right", rect };
    if (relY < EDGE_ZONE) return { direction: "horizontal", side: "top", rect };
    if (relY > 1 - EDGE_ZONE) return { direction: "horizontal", side: "bottom", rect };
    return { direction: null, side: "center", rect };
  }, []);

  const showOverlay = useCallback((zone) => {
    const d = drag.current;
    if (!zone || zone.side === "center" || !zone.rect) {
      if (d.overlay) d.overlay.style.display = "none";
      return;
    }

    if (!d.overlay) {
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        zIndex: "998",
        pointerEvents: "none",
        transition: "all 0.15s ease",
        borderRadius: "4px",
      });
      document.body.appendChild(overlay);
      d.overlay = overlay;
    }

    const { rect, side } = zone;
    const half = { width: rect.width / 2, height: rect.height / 2 };

    let styles;
    switch (side) {
      case "left":
        styles = { top: rect.top, left: rect.left, width: half.width, height: rect.height };
        break;
      case "right":
        styles = { top: rect.top, left: rect.left + half.width, width: half.width, height: rect.height };
        break;
      case "top":
        styles = { top: rect.top, left: rect.left, width: rect.width, height: half.height };
        break;
      case "bottom":
        styles = { top: rect.top + half.height, left: rect.left, width: rect.width, height: half.height };
        break;
    }

    Object.assign(d.overlay.style, {
      display: "block",
      top: styles.top + "px",
      left: styles.left + "px",
      width: styles.width + "px",
      height: styles.height + "px",
      background: `${accentColor}15`,
      border: `2px solid ${accentColor}40`,
    });
  }, [accentColor]);

  const activateDrag = useCallback((noteId, sourcePaneId, tabEl, pointerY) => {
    const d = drag.current;
    d.active = true;
    d.noteId = noteId;
    d.sourcePaneId = sourcePaneId;

    // Create floating ghost
    const rect = tabEl.getBoundingClientRect();
    const clone = tabEl.cloneNode(true);
    Object.assign(clone.style, {
      position: "fixed",
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      height: rect.height + "px",
      zIndex: "1000",
      pointerEvents: "none",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      opacity: "0.75",
      transform: "scale(0.95)",
      background: chromeBg,
      borderRadius: "4px",
      transition: "none",
    });
    document.body.appendChild(clone);
    d.cloneEl = clone;
    d.offsetX = rect.left - d.startX + rect.width / 2;
    d.offsetY = pointerY - rect.top;

    document.body.classList.add("block-dragging");
  }, [chromeBg]);

  const handleTabPointerDown = useCallback((e, noteId, sourcePaneId) => {
    if (e.button !== 0) return;
    // Don't start drag on close button
    if (e.target.closest(".tab-close")) return;

    const d = drag.current;
    d.startX = e.clientX;
    d.startY = e.clientY;
    d.noteId = noteId;
    d.sourcePaneId = sourcePaneId;

    const tabEl = e.currentTarget;
    const pY = e.clientY;

    d.holdTimer = setTimeout(() => {
      activateDrag(noteId, sourcePaneId, tabEl, pY);
    }, HOLD_DELAY);

    const onMove = (ev) => {
      if (d.holdTimer && !d.active) {
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        if (Math.hypot(dx, dy) > 5) {
          clearTimeout(d.holdTimer);
          d.holdTimer = null;
          // Immediate drag on movement
          activateDrag(noteId, sourcePaneId, tabEl, pY);
        }
      }
      if (d.active && d.cloneEl) {
        d.cloneEl.style.left = ev.clientX - (d.cloneEl.offsetWidth / 2) + "px";
        d.cloneEl.style.top = ev.clientY - d.offsetY + "px";

        const zone = getDropZone(ev.clientX, ev.clientY);

        // If already split, disable edge zone drops (max 2 panes)
        if (splitState.splitMode && zone && zone.side !== "center") {
          // Instead of creating new split, check if over a specific pane's tab bar
          showOverlay(null);
        } else {
          showOverlay(zone);
        }
      }
    };

    const onUp = (ev) => {
      if (d.holdTimer) {
        clearTimeout(d.holdTimer);
        d.holdTimer = null;
      }

      if (d.active) {
        const zone = getDropZone(ev.clientX, ev.clientY);

        if (zone && !splitState.splitMode) {
          // Not yet split
          if (zone.side !== "center" && zone.direction) {
            // Create split in that direction, move tab to new pane
            splitPaneWithNote(zone.direction, noteId);
            // Remove from source pane if it had multiple tabs
            if (sourcePaneId) {
              setTabsForPane(sourcePaneId, (prev) => prev.filter((t) => t !== noteId));
              setTimeout(() => closePaneIfEmpty(sourcePaneId), 50);
            }
          }
        } else if (zone && splitState.splitMode) {
          // Already split — determine target pane from cursor position
          const paneIds = splitState.splitMode === "vertical" ? ["left", "right"] : ["top", "bottom"];
          const containerEl = document.querySelector("[data-split-container]");
          if (containerEl) {
            const containerRect = containerEl.getBoundingClientRect();
            let targetPaneId;
            if (splitState.splitMode === "vertical") {
              const splitX = containerRect.left + containerRect.width * (splitState.dividerPosition / 100);
              targetPaneId = ev.clientX < splitX ? paneIds[0] : paneIds[1];
            } else {
              const splitY = containerRect.top + containerRect.height * (splitState.dividerPosition / 100);
              targetPaneId = ev.clientY < splitY ? paneIds[0] : paneIds[1];
            }

            if (targetPaneId !== sourcePaneId) {
              moveTabToPane(noteId, sourcePaneId, targetPaneId);
              setTimeout(() => closePaneIfEmpty(sourcePaneId), 50);
            }
          }
        }
      }

      cleanup();
    };

    d.moveHandler = onMove;
    d.upHandler = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [splitState, activateDrag, getDropZone, showOverlay, splitPaneWithNote, moveTabToPane,
      setTabsForPane, closePaneIfEmpty, cleanup]);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  return { handleTabPointerDown, tabDrag: drag };
}
