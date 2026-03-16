import { useRef, useEffect } from "react";
import { isNative } from "../utils/platform";
import { getAPI } from "../services/apiProvider";
import { runAutoScroll } from "../utils/domHelpers";
import {
  findTabBarUnderCursor,
  computeInsertionIndex,
  getInsertionLinePosition,
} from "../utils/tabBarHitTest";

export function useSidebarDrag({
  noteDataRef,
  setNoteData,
  expanded,
  setExpanded,
  sidebarOrder,
  setSidebarOrder,
  customFolders,
  sidebarScrollRef,
  accentColor,
  chromeBg,
  setDragTooltip,
  dragTooltipCount,
  selectedNotesRef,
  clearSelectionRef,
  // Split view support
  splitStateRef,
  splitPaneWithNote,
  openNoteInPane,
  insertTabInPane,
}) {
  const sidebarDrag = useRef({
    active: false,
    type: null,
    id: null,
    draggedIds: [],
    cloneEl: null,
    holdTimer: null,
    startX: 0,
    startY: 0,
    dropTarget: null,
    dropIndicator: null,
    autoExpandTimer: null,
    scrollRAF: null,
    originalFolder: null,
  });

  const persistSidebarOrder = (folderPath, noteIds, folderIds) => {
    const meta = {};
    if (noteIds) meta.noteOrder = noteIds;
    if (folderIds) meta.folderOrder = folderIds;
    setSidebarOrder((prev) => ({
      ...prev,
      [folderPath]: { ...(prev[folderPath] || {}), ...meta },
    }));
    if (isNative && getAPI()?.writeMeta) {
      getAPI().writeMeta(folderPath, { ...(sidebarOrder[folderPath] || {}), ...meta });
    }
  };

  const activateSidebarDrag = (type, id, el, pointerY) => {
    const sd = sidebarDrag.current;
    sd.active = true;
    sd.type = type;
    sd.id = id;

    // Determine dragged IDs for multi-drag
    const sel = selectedNotesRef?.current;
    const clearSel = clearSelectionRef?.current;
    if (type === "note" && sel && sel.size > 1 && sel.has(id)) {
      sd.draggedIds = [...sel];
    } else {
      sd.draggedIds = [id];
      if (clearSel) clearSel();
    }

    const rect = el.getBoundingClientRect();

    // Build compact pill ghost instead of cloned DOM element
    const noteTitle =
      (type === "note" && noteDataRef.current[id]?.title) || el.textContent?.trim() || "Untitled";
    const pill = document.createElement("div");
    Object.assign(pill.style, {
      position: "fixed",
      left: rect.left + "px",
      top: rect.top + "px",
      maxWidth: "200px",
      padding: "4px 12px",
      borderRadius: "12px",
      zIndex: "1000",
      pointerEvents: "none",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      opacity: "0.9",
      background: chromeBg,
      transition: "none",
      display: "flex",
      alignItems: "center",
      gap: "5px",
      fontSize: "12px",
      fontWeight: "500",
      color: "inherit",
      fontFamily: "inherit",
      whiteSpace: "nowrap",
      overflow: "hidden",
    });
    // File icon
    const icon = document.createElement("span");
    icon.textContent = type === "folder" ? "\uD83D\uDCC1" : "\uD83D\uDCC4";
    icon.style.flexShrink = "0";
    pill.appendChild(icon);
    // Title (truncated)
    const titleSpan = document.createElement("span");
    titleSpan.textContent = noteTitle;
    Object.assign(titleSpan.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    pill.appendChild(titleSpan);
    // Count badge for multi-drag
    if (type === "note" && sd.draggedIds.length > 1) {
      const badge = document.createElement("div");
      Object.assign(badge.style, {
        position: "absolute",
        top: "-6px",
        right: "-6px",
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        background: accentColor,
        color: "#fff",
        fontSize: "11px",
        fontWeight: "600",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
      });
      badge.textContent = String(sd.draggedIds.length);
      pill.style.overflow = "visible";
      pill.appendChild(badge);
    }
    document.body.appendChild(pill);
    sd.cloneEl = pill;
    sd.startY = pointerY;
    sd.offsetY = pointerY - rect.top;
    sd.offsetX = sd.startX - rect.left;

    if (type === "note") {
      sd.originalFolder = noteDataRef.current[id]?.folder || null;
    }

    const indicator = document.createElement("div");
    Object.assign(indicator.style, {
      position: "fixed",
      height: "2px",
      background: accentColor,
      borderRadius: "1px",
      zIndex: "999",
      pointerEvents: "none",
      display: "none",
      transition: "top 50ms ease, left 50ms ease",
    });
    document.body.appendChild(indicator);
    sd.dropIndicator = indicator;

    // Escape handler to cancel drag
    const escHandler = (e) => {
      if (e.key === "Escape") {
        cancelSidebarDrag();
      }
    };
    window.addEventListener("keydown", escHandler);
    sd.escHandler = escHandler;

    document.body.classList.add("block-dragging");

    const scrollEl = sidebarScrollRef.current;
    let lastPointerY = pointerY;
    const scrollLoop = () => {
      if (!sd.active) return;
      runAutoScroll(scrollEl, lastPointerY);
      sd.scrollRAF = requestAnimationFrame(scrollLoop);
    };
    sd.scrollRAF = requestAnimationFrame(scrollLoop);
    sd._updatePointerY = (y) => {
      lastPointerY = y;
    };
  };

  const updateSidebarDropTarget = (pointerX, pointerY) => {
    const sd = sidebarDrag.current;
    if (!sd.active) return;
    const scrollEl = sidebarScrollRef.current;
    if (!scrollEl) return;
    const scrollRect = scrollEl.getBoundingClientRect();

    if (
      pointerX < scrollRect.left ||
      pointerX > scrollRect.right ||
      pointerY < scrollRect.top ||
      pointerY > scrollRect.bottom
    ) {
      if (sd.dropIndicator) sd.dropIndicator.style.display = "none";
      scrollEl
        .querySelectorAll("[data-folder-path]")
        .forEach((el) => (el.style.background = "none"));

      // Check if over a tab bar for insertion
      if (sd.type === "note" && insertTabInPane) {
        const tabBarHit = findTabBarUnderCursor(pointerX, pointerY);
        if (tabBarHit) {
          const idx = computeInsertionIndex(tabBarHit.tabBarEl, pointerX);
          const pos = getInsertionLinePosition(tabBarHit.tabBarEl, idx);

          // Show vertical insertion line
          if (!sd.tabInsertLine) {
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
            sd.tabInsertLine = line;
          }
          Object.assign(sd.tabInsertLine.style, {
            display: "block",
            left: pos.x - 1 + "px",
            top: pos.top + "px",
            height: pos.height + "px",
          });

          // Hide sidebar indicator and editor overlay
          if (sd.dropIndicator) sd.dropIndicator.style.display = "none";
          if (sd.editorOverlay) sd.editorOverlay.style.display = "none";

          sd.dropTarget = { type: "tab-bar-insert", paneId: tabBarHit.paneId, insertIndex: idx };
          return;
        }
        // Not over tab bar — hide insertion line
        if (sd.tabInsertLine) sd.tabInsertLine.style.display = "none";
      }

      // Check if over the editor area for split-drop
      if (sd.type === "note" && splitPaneWithNote) {
        const editorArea =
          document.querySelector("[data-split-container]") ||
          document.querySelector(".editor-scroll")?.parentElement;
        if (editorArea) {
          const editorRect = editorArea.getBoundingClientRect();
          if (
            pointerX >= editorRect.left &&
            pointerX <= editorRect.right &&
            pointerY >= editorRect.top &&
            pointerY <= editorRect.bottom
          ) {
            const relX = (pointerX - editorRect.left) / editorRect.width;
            const relY = (pointerY - editorRect.top) / editorRect.height;
            const EDGE = 0.2;
            let editorZone = null;
            if (relX < EDGE) editorZone = { direction: "vertical", side: "left" };
            else if (relX > 1 - EDGE) editorZone = { direction: "vertical", side: "right" };
            else if (relY < EDGE) editorZone = { direction: "horizontal", side: "top" };
            else if (relY > 1 - EDGE) editorZone = { direction: "horizontal", side: "bottom" };

            sd.dropTarget = editorZone
              ? { type: "editor-split", zone: editorZone, rect: editorRect }
              : { type: "editor-open", rect: editorRect };

            // Show overlay for edge zones
            if (editorZone && !splitStateRef?.current?.splitMode) {
              if (!sd.editorOverlay) {
                const overlay = document.createElement("div");
                Object.assign(overlay.style, {
                  position: "fixed",
                  zIndex: "998",
                  pointerEvents: "none",
                  transition: "all 0.15s ease",
                  borderRadius: "4px",
                });
                document.body.appendChild(overlay);
                sd.editorOverlay = overlay;
              }
              const half = { width: editorRect.width / 2, height: editorRect.height / 2 };
              let s;
              switch (editorZone.side) {
                case "left":
                  s = {
                    top: editorRect.top,
                    left: editorRect.left,
                    width: half.width,
                    height: editorRect.height,
                  };
                  break;
                case "right":
                  s = {
                    top: editorRect.top,
                    left: editorRect.left + half.width,
                    width: half.width,
                    height: editorRect.height,
                  };
                  break;
                case "top":
                  s = {
                    top: editorRect.top,
                    left: editorRect.left,
                    width: editorRect.width,
                    height: half.height,
                  };
                  break;
                case "bottom":
                  s = {
                    top: editorRect.top + half.height,
                    left: editorRect.left,
                    width: editorRect.width,
                    height: half.height,
                  };
                  break;
              }
              Object.assign(sd.editorOverlay.style, {
                display: "block",
                top: s.top + "px",
                left: s.left + "px",
                width: s.width + "px",
                height: s.height + "px",
                background: `${accentColor}15`,
                border: `2px solid ${accentColor}40`,
              });
            } else if (sd.editorOverlay) {
              sd.editorOverlay.style.display = "none";
            }
            return;
          }
        }
      }

      // Hide editor overlay when not over editor
      if (sd.editorOverlay) sd.editorOverlay.style.display = "none";
      sd.dropTarget = null;
      return;
    }
    // Hide editor overlay when back in sidebar
    if (sd.editorOverlay) sd.editorOverlay.style.display = "none";

    let target = null;
    const noteEls = scrollEl.querySelectorAll("[data-note-id]");
    const folderEls = scrollEl.querySelectorAll("[data-folder-path]");

    folderEls.forEach((el) => (el.style.background = "none"));

    for (const el of folderEls) {
      const rect = el.getBoundingClientRect();
      if (pointerY >= rect.top && pointerY <= rect.bottom) {
        const folderPath = el.dataset.folderPath;
        if (sd.type === "folder" && (folderPath === sd.id || folderPath.startsWith(sd.id + "/")))
          continue;
        const third = rect.height / 3;
        if (pointerY < rect.top + third) {
          target = { type: "folder", id: folderPath, zone: "above", rect };
        } else if (pointerY > rect.bottom - third) {
          target = { type: "folder", id: folderPath, zone: "below", rect };
        } else {
          target = { type: "folder", id: folderPath, zone: "into", rect };
        }
        break;
      }
    }
    if (!target) {
      for (const el of noteEls) {
        const rect = el.getBoundingClientRect();
        if (pointerY >= rect.top && pointerY <= rect.bottom) {
          const noteId = el.dataset.noteId;
          if (noteId === sd.id) continue;
          const half = rect.height / 2;
          target = {
            type: "note",
            id: noteId,
            zone: pointerY < rect.top + half ? "above" : "below",
            rect,
          };
          break;
        }
      }
    }

    sd.dropTarget = target;

    if (!target) {
      if (sd.dropIndicator) sd.dropIndicator.style.display = "none";
      return;
    }

    if (target.zone === "into") {
      const folderEl = scrollEl.querySelector(`[data-folder-path="${target.id}"]`);
      if (folderEl) folderEl.style.background = `${accentColor}25`;
      if (sd.dropIndicator) sd.dropIndicator.style.display = "none";
      if (!expanded[target.id]) {
        if (!sd.autoExpandTimer) {
          sd.autoExpandTimer = setTimeout(() => {
            setExpanded((prev) => ({ ...prev, [target.id]: true }));
            sd.autoExpandTimer = null;
          }, 500);
        }
      }
    } else {
      if (sd.autoExpandTimer) {
        clearTimeout(sd.autoExpandTimer);
        sd.autoExpandTimer = null;
      }
      const lineY = target.zone === "above" ? target.rect.top : target.rect.bottom;
      if (sd.dropIndicator) {
        Object.assign(sd.dropIndicator.style, {
          display: "block",
          top: lineY - 1 + "px",
          left: target.rect.left + 4 + "px",
          width: target.rect.width - 8 + "px",
        });
      }
    }
  };

  const finalizeSidebarDrag = () => {
    const sd = sidebarDrag.current;
    if (!sd.active) return;
    const target = sd.dropTarget;

    if (target) {
      // Handle tab bar insertion drops
      if (target.type === "tab-bar-insert" && sd.type === "note" && insertTabInPane) {
        const ids = sd.draggedIds && sd.draggedIds.length > 0 ? sd.draggedIds : [sd.id];
        for (let i = 0; i < ids.length; i++) {
          insertTabInPane(target.paneId, ids[i], target.insertIndex + i);
        }
        cleanupSidebarDrag();
        return;
      }
      // Handle editor split/open drops
      if (target.type === "editor-split" && target.zone && sd.type === "note") {
        const noteId = sd.id;
        if (!splitStateRef?.current?.splitMode && splitPaneWithNote) {
          splitPaneWithNote(target.zone.direction, noteId);
        } else if (splitStateRef?.current?.splitMode && openNoteInPane) {
          // Already split — determine which pane from cursor position
          const paneIds =
            splitStateRef.current.splitMode === "vertical" ? ["left", "right"] : ["top", "bottom"];
          const targetPaneId =
            target.zone.side === "right" || target.zone.side === "bottom" ? paneIds[1] : paneIds[0];
          openNoteInPane(noteId, targetPaneId);
        }
        cleanupSidebarDrag();
        return;
      }
      if (target.type === "editor-open" && sd.type === "note") {
        // Dropped in center of editor — open as tab in active pane
        if (openNoteInPane) openNoteInPane(sd.id);
        cleanupSidebarDrag();
        return;
      }

      const ids = sd.draggedIds && sd.draggedIds.length > 0 ? sd.draggedIds : [sd.id];
      if (sd.type === "note" && target.zone === "into" && target.type === "folder") {
        const targetFolder = target.id;
        setNoteData((prev) => {
          const next = { ...prev };
          for (const noteId of ids) {
            if (next[noteId]) next[noteId] = { ...next[noteId], folder: targetFolder };
          }
          return next;
        });
      } else if (sd.type === "note") {
        const draggedNote = noteDataRef.current[sd.id];
        const draggedFolder = draggedNote?.folder || "";
        let targetFolder = "";
        if (target.type === "note") {
          targetFolder = noteDataRef.current[target.id]?.folder || "";
        } else if (target.type === "folder") {
          const parts = target.id.split("/");
          targetFolder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
        }

        if (draggedFolder === targetFolder) {
          const folderKey = draggedFolder;
          const noteIds = Object.entries(noteDataRef.current)
            .filter(([, n]) => (n.folder || "") === folderKey)
            .map(([id]) => id);
          const currentOrder = sidebarOrder[folderKey]?.noteOrder || noteIds;
          const ordered = [...currentOrder];
          for (const id of noteIds) {
            if (!ordered.includes(id)) ordered.push(id);
          }
          const filtered = ordered.filter((id) => noteIds.includes(id));
          // Remove all dragged IDs from order
          const dragSet = new Set(ids);
          const withoutDragged = filtered.filter((id) => !dragSet.has(id));
          let toIdx = withoutDragged.length;
          if (target.type === "note") {
            const tIdx = withoutDragged.indexOf(target.id);
            toIdx = target.zone === "above" ? tIdx : tIdx + 1;
          }
          // Insert all dragged IDs as a group at drop position
          withoutDragged.splice(Math.max(0, toIdx), 0, ...ids);
          persistSidebarOrder(folderKey, withoutDragged, null);
        } else {
          setNoteData((prev) => {
            const next = { ...prev };
            for (const noteId of ids) {
              if (next[noteId]) next[noteId] = { ...next[noteId], folder: targetFolder || null };
            }
            return next;
          });
        }
      } else if (sd.type === "folder") {
        const parts = sd.id.split("/");
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
        const targetParts = target.id.split("/");
        const targetParent = targetParts.length > 1 ? targetParts.slice(0, -1).join("/") : "";

        if (parentPath === targetParent && target.zone !== "into") {
          const parentKey = parentPath;

          // Discover sibling folder names from the rendered DOM
          const scrollEl = sidebarScrollRef.current;
          const allFolderEls = scrollEl ? scrollEl.querySelectorAll("[data-folder-path]") : [];
          const folderNames = [];
          for (const el of allFolderEls) {
            const p = el.dataset.folderPath;
            const isDirectChild =
              parentPath === ""
                ? !p.includes("/")
                : p.startsWith(parentPath + "/") && !p.slice(parentPath.length + 1).includes("/");
            if (isDirectChild) {
              const name = parentPath === "" ? p : p.slice(parentPath.length + 1);
              if (!folderNames.includes(name)) folderNames.push(name);
            }
          }

          const currentOrder = sidebarOrder[parentKey]?.folderOrder || folderNames;
          const ordered = [...currentOrder];
          for (const n of folderNames) {
            if (!ordered.includes(n)) ordered.push(n);
          }
          const filtered = ordered.filter((n) => folderNames.includes(n));
          const dragName = parts[parts.length - 1];
          const fromIdx = filtered.indexOf(dragName);
          if (fromIdx !== -1) filtered.splice(fromIdx, 1);
          let toIdx = filtered.length;
          if (target.type === "folder") {
            const tName = targetParts[targetParts.length - 1];
            const tIdx = filtered.indexOf(tName);
            toIdx = target.zone === "above" ? tIdx : tIdx + 1;
          }
          filtered.splice(Math.max(0, toIdx), 0, dragName);
          persistSidebarOrder(parentKey, null, filtered);
        }
      }
    }

    cleanupSidebarDrag();
  };

  const cleanupSidebarDrag = () => {
    const sd = sidebarDrag.current;
    if (sd.cloneEl && sd.cloneEl.parentNode) sd.cloneEl.parentNode.removeChild(sd.cloneEl);
    if (sd.dropIndicator && sd.dropIndicator.parentNode)
      sd.dropIndicator.parentNode.removeChild(sd.dropIndicator);
    if (sd.editorOverlay && sd.editorOverlay.parentNode)
      sd.editorOverlay.parentNode.removeChild(sd.editorOverlay);
    sd.editorOverlay = null;
    if (sd.tabInsertLine && sd.tabInsertLine.parentNode)
      sd.tabInsertLine.parentNode.removeChild(sd.tabInsertLine);
    sd.tabInsertLine = null;
    if (sd.escHandler) {
      window.removeEventListener("keydown", sd.escHandler);
      sd.escHandler = null;
    }
    if (sd.scrollRAF) {
      cancelAnimationFrame(sd.scrollRAF);
      sd.scrollRAF = null;
    }
    if (sd.autoExpandTimer) {
      clearTimeout(sd.autoExpandTimer);
      sd.autoExpandTimer = null;
    }
    if (sidebarScrollRef.current) {
      sidebarScrollRef.current
        .querySelectorAll("[data-folder-path]")
        .forEach((el) => (el.style.background = "none"));
    }
    document.body.classList.remove("block-dragging");
    sd.active = false;
    sd.type = null;
    sd.id = null;
    sd.draggedIds = [];
    sd.cloneEl = null;
    sd.holdTimer = null;
    sd.dropTarget = null;
    sd.dropIndicator = null;
    sd.originalFolder = null;
    sd._updatePointerY = null;
    if (sd.moveHandler) window.removeEventListener("pointermove", sd.moveHandler);
    if (sd.upHandler) window.removeEventListener("pointerup", sd.upHandler);
    sd.moveHandler = null;
    sd.upHandler = null;
  };

  const cancelSidebarDrag = () => {
    const sd = sidebarDrag.current;
    if (sd.holdTimer) {
      clearTimeout(sd.holdTimer);
      sd.holdTimer = null;
    }
    if (!sd.active) {
      cleanupSidebarDrag();
      return;
    }
    if (sd.type === "note" && sd.originalFolder !== undefined) {
      const noteId = sd.id;
      const origFolder = sd.originalFolder;
      setNoteData((prev) => {
        if (prev[noteId]?.folder !== origFolder) {
          const next = { ...prev };
          next[noteId] = { ...next[noteId], folder: origFolder };
          return next;
        }
        return prev;
      });
    }
    cleanupSidebarDrag();
  };

  const handleSidebarPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".delete-btn, input")) return;

    const noteEl = e.target.closest("[data-note-id]");
    const folderEl = e.target.closest("[data-folder-path]");
    if (!noteEl && !folderEl) return;

    if (!localStorage.getItem("boojy-drag-tooltip-sidebar")) {
      dragTooltipCount.current.sidebar++;
      if (dragTooltipCount.current.sidebar === 3) {
        localStorage.setItem("boojy-drag-tooltip-sidebar", "1");
        setDragTooltip({ x: e.clientX, y: e.clientY - 40, text: "Hold and drag to reorder" });
        setTimeout(() => setDragTooltip(null), 3000);
      }
    }

    const type = noteEl ? "note" : "folder";
    const id = noteEl ? noteEl.dataset.noteId : folderEl.dataset.folderPath;
    const targetEl = noteEl || folderEl;

    const sd = sidebarDrag.current;
    sd.startX = e.clientX;
    sd.startY = e.clientY;

    const pY = e.clientY;
    sd.holdTimer = setTimeout(() => {
      activateSidebarDrag(type, id, targetEl, pY);
    }, 400);

    const onMove = (ev) => {
      if (sd.holdTimer && !sd.active) {
        const dx = ev.clientX - sd.startX;
        const dy = ev.clientY - sd.startY;
        if (Math.hypot(dx, dy) > 5) {
          clearTimeout(sd.holdTimer);
          sd.holdTimer = null;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        }
        return;
      }
      if (sd.active) {
        if (sd.cloneEl) {
          sd.cloneEl.style.top = ev.clientY - sd.offsetY + "px";
          sd.cloneEl.style.left = ev.clientX - sd.offsetX + "px";
        }
        if (sd._updatePointerY) sd._updatePointerY(ev.clientY);
        updateSidebarDropTarget(ev.clientX, ev.clientY);
      }
    };
    const onUp = () => {
      if (sd.holdTimer) {
        clearTimeout(sd.holdTimer);
        sd.holdTimer = null;
      }
      if (sd.active) finalizeSidebarDrag();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    sd.moveHandler = onMove;
    sd.upHandler = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => () => cleanupSidebarDrag(), []);

  return { sidebarDrag, handleSidebarPointerDown, cancelSidebarDrag, persistSidebarOrder };
}
