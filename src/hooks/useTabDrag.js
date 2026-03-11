import { useRef, useEffect, useCallback } from "react";
import { findTabBarUnderCursor, computeInsertionIndex, getInsertionLinePosition } from "../utils/tabBarHitTest";

const HOLD_DELAY = 200;
const EDGE_ZONE = 0.2; // 20% of editor area

export function useTabDrag({
  splitState,
  splitPaneWithNote,
  moveTabToPane,
  moveTabToPaneAtIndex,
  duplicateTabToPane,
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
    // New fields for insertion line
    tabInsertLine: null,
    targetPaneId: null,
    insertIndex: null,
    escHandler: null,
    isOptionHeld: false,
  });

  const cleanup = useCallback(() => {
    const d = drag.current;
    if (d.cloneEl?.parentNode) d.cloneEl.parentNode.removeChild(d.cloneEl);
    if (d.overlay?.parentNode) d.overlay.parentNode.removeChild(d.overlay);
    if (d.tabInsertLine?.parentNode) d.tabInsertLine.parentNode.removeChild(d.tabInsertLine);
    if (d.holdTimer) clearTimeout(d.holdTimer);
    document.body.classList.remove("block-dragging");
    if (d.moveHandler) window.removeEventListener("pointermove", d.moveHandler);
    if (d.upHandler) window.removeEventListener("pointerup", d.upHandler);
    if (d.escHandler) window.removeEventListener("keydown", d.escHandler);
    d.active = false;
    d.noteId = null;
    d.sourcePaneId = null;
    d.cloneEl = null;
    d.holdTimer = null;
    d.overlay = null;
    d.moveHandler = null;
    d.upHandler = null;
    d.tabInsertLine = null;
    d.targetPaneId = null;
    d.insertIndex = null;
    d.escHandler = null;
    d.isOptionHeld = false;
  }, []);

  const getDropZone = useCallback((clientX, clientY) => {
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

    // Create floating ghost (tab rectangle)
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

    // Create vertical insertion line element
    const line = document.createElement("div");
    Object.assign(line.style, {
      position: "fixed",
      width: "2px",
      zIndex: "999",
      pointerEvents: "none",
      display: "none",
      borderRadius: "1px",
      background: accentColor,
      transition: "left 50ms ease, top 50ms ease",
    });
    document.body.appendChild(line);
    d.tabInsertLine = line;

    // Escape handler
    const escHandler = (e) => {
      if (e.key === "Escape") {
        cleanup();
      }
    };
    window.addEventListener("keydown", escHandler);
    d.escHandler = escHandler;

    document.body.classList.add("block-dragging");
  }, [chromeBg, accentColor, cleanup]);

  const handleTabPointerDown = useCallback((e, noteId, sourcePaneId) => {
    if (e.button !== 0) return;
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
          activateDrag(noteId, sourcePaneId, tabEl, pY);
        }
      }
      if (d.active && d.cloneEl) {
        d.cloneEl.style.left = ev.clientX - (d.cloneEl.offsetWidth / 2) + "px";
        d.cloneEl.style.top = ev.clientY - d.offsetY + "px";

        // Track Option key
        d.isOptionHeld = ev.altKey;

        // Check tab bar hit first
        const tabBarHit = findTabBarUnderCursor(ev.clientX, ev.clientY);
        if (tabBarHit) {
          const idx = computeInsertionIndex(tabBarHit.tabBarEl, ev.clientX);
          const pos = getInsertionLinePosition(tabBarHit.tabBarEl, idx);

          // Show insertion line
          if (d.tabInsertLine) {
            Object.assign(d.tabInsertLine.style, {
              display: "block",
              left: pos.x - 1 + "px",
              top: pos.top + "px",
              height: pos.height + "px",
            });
          }

          // Hide split overlay
          showOverlay(null);

          d.targetPaneId = tabBarHit.paneId;
          d.insertIndex = idx;
          return;
        }

        // Not over tab bar — hide insertion line
        if (d.tabInsertLine) d.tabInsertLine.style.display = "none";
        d.targetPaneId = null;
        d.insertIndex = null;

        // Fall through to existing split overlay logic
        const zone = getDropZone(ev.clientX, ev.clientY);

        if (splitState.splitMode && zone && zone.side !== "center") {
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
        // Tab bar insertion drop
        if (d.targetPaneId != null && d.insertIndex != null) {
          if (d.targetPaneId === sourcePaneId) {
            // Same pane — reorder
            moveTabToPaneAtIndex(noteId, sourcePaneId, sourcePaneId, d.insertIndex);
          } else if (d.isOptionHeld) {
            // Option+drag — duplicate
            duplicateTabToPane(noteId, d.targetPaneId, d.insertIndex);
          } else {
            // Cross-pane move at index
            moveTabToPaneAtIndex(noteId, sourcePaneId, d.targetPaneId, d.insertIndex);
            setTimeout(() => closePaneIfEmpty(sourcePaneId), 50);
          }
          cleanup();
          return;
        }

        // Existing edge-zone / cross-pane logic
        const zone = getDropZone(ev.clientX, ev.clientY);

        if (zone && !splitState.splitMode) {
          if (zone.side !== "center" && zone.direction) {
            splitPaneWithNote(zone.direction, noteId);
            if (sourcePaneId) {
              setTabsForPane(sourcePaneId, (prev) => prev.filter((t) => t !== noteId));
              setTimeout(() => closePaneIfEmpty(sourcePaneId), 50);
            }
          }
        } else if (zone && splitState.splitMode) {
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
      moveTabToPaneAtIndex, duplicateTabToPane, setTabsForPane, closePaneIfEmpty, cleanup]);

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup]);

  return { handleTabPointerDown, tabDrag: drag };
}
