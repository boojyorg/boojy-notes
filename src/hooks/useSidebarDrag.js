import { useRef, useEffect } from "react";
import { useTheme } from "./useTheme";
import { isNative } from "../utils/platform";
import { getAPI } from "../services/apiProvider";
import { runAutoScroll } from "../utils/domHelpers";

export function useSidebarDrag({
  noteDataRef,
  setNoteData,
  customFolders: _customFolders,
  sidebarScrollRef,
  accentColor,
  chromeBg,
  setDragTooltip,
  dragTooltipCount,
  selectedNotesRef,
  clearSelectionRef,
  openNote,
}) {
  const { theme } = useTheme();
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
    scrollRAF: null,
  });

  const activateSidebarDrag = (type, id, el, pointerY) => {
    const sd = sidebarDrag.current;
    sd.active = true;
    sd.type = type;
    sd.id = id;

    // Prevent browser scroll during touch drag
    const treeEl = el.closest("[role='tree']");
    if (treeEl) treeEl.style.touchAction = "none";
    sd._scrollEl = treeEl;

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
        color: theme.ACCENT.onAccent,
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

  // Drop feedback is neutral by rule — the accent is identity, not a surface.
  // A row/header fills to BG.hover (the same tone selection uses) with a 1px
  // muted ring so the target reads as chosen rather than merely hovered.
  const paintDropTarget = (el) => {
    el.style.background = theme.BG.hover;
    el.style.boxShadow = `inset 0 0 0 1px ${theme.TEXT.muted}`;
  };

  const clearDropHighlights = (scrollEl) => {
    if (!scrollEl) return;
    scrollEl.querySelectorAll("[data-folder-path], [data-drop-root]").forEach((el) => {
      el.style.background = "";
      el.style.boxShadow = "";
    });
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
      clearDropHighlights(scrollEl);

      // Dropping a note anywhere over the editor opens it
      if (sd.type === "note" && openNote) {
        const editorArea = document.querySelector(".editor-scroll")?.parentElement;
        if (editorArea) {
          const editorRect = editorArea.getBoundingClientRect();
          if (
            pointerX >= editorRect.left &&
            pointerX <= editorRect.right &&
            pointerY >= editorRect.top &&
            pointerY <= editorRect.bottom
          ) {
            sd.dropTarget = { type: "editor-open", rect: editorRect };
            return;
          }
        }
      }

      sd.dropTarget = null;
      return;
    }

    // Containers only. A folder row means "move into this folder" across its whole
    // height, and the Notes section (plus the empty space under the trees) means
    // "move to root". There are no above/below insertion zones any more: drag
    // changes a note's location, the sort preference decides display order.
    let target = null;
    const folderEls = scrollEl.querySelectorAll("[data-folder-path]");

    clearDropHighlights(scrollEl);

    for (const el of folderEls) {
      const rect = el.getBoundingClientRect();
      if (pointerY >= rect.top && pointerY <= rect.bottom) {
        target = { type: "folder", id: el.dataset.folderPath, el };
        break;
      }
    }

    if (!target) {
      // Explicit root target: the `Notes` section header.
      const rootEl = scrollEl.querySelector("[data-drop-root]");
      if (rootEl) {
        const rect = rootEl.getBoundingClientRect();
        if (pointerY >= rect.top && pointerY <= rect.bottom) {
          target = { type: "root", el: rootEl };
        }
      }
    }

    if (!target) {
      // Implicit root target: anywhere in the scroller that isn't a folder row —
      // a root note row, or the empty space below every tree. Highlighting the
      // `Notes` header (when there is one) is what makes this legible.
      const rootEl = scrollEl.querySelector("[data-drop-root]");
      target = { type: "root", el: rootEl || null };
    }

    sd.dropTarget = target;
    if (target.el) paintDropTarget(target.el);
  };

  const finalizeSidebarDrag = () => {
    const sd = sidebarDrag.current;
    if (!sd.active) return;
    const target = sd.dropTarget;

    if (target && sd.type === "note") {
      if (target.type === "editor-open") {
        // Dropped over the editor — open the note
        if (openNote) openNote(sd.id);
        cleanupSidebarDrag();
        return;
      }

      // The only remaining outcome: move the note's real file. `folder: null`
      // is root; anything else is that folder. write-note relocates the .md on
      // disk (new file written before the old one is unlinked).
      const targetFolder = target.type === "folder" ? target.id : null;
      const ids = sd.draggedIds && sd.draggedIds.length > 0 ? sd.draggedIds : [sd.id];
      setNoteData((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const noteId of ids) {
          if (!next[noteId]) continue;
          if ((next[noteId].folder || null) === targetFolder) continue;
          next[noteId] = { ...next[noteId], folder: targetFolder };
          changed = true;
        }
        return changed ? next : prev;
      });
    }

    cleanupSidebarDrag();
  };

  const cleanupSidebarDrag = () => {
    const sd = sidebarDrag.current;
    if (sd.cloneEl && sd.cloneEl.parentNode) sd.cloneEl.parentNode.removeChild(sd.cloneEl);
    if (sd.escHandler) {
      window.removeEventListener("keydown", sd.escHandler);
      sd.escHandler = null;
    }
    if (sd.scrollRAF) {
      cancelAnimationFrame(sd.scrollRAF);
      sd.scrollRAF = null;
    }
    clearDropHighlights(sidebarScrollRef.current);
    if (sd._scrollEl) {
      sd._scrollEl.style.touchAction = "";
      sd._scrollEl = null;
    }
    document.body.classList.remove("block-dragging");
    sd.active = false;
    sd.type = null;
    sd.id = null;
    sd.draggedIds = [];
    sd.cloneEl = null;
    sd.holdTimer = null;
    sd.dropTarget = null;
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
    cleanupSidebarDrag();
  };

  const handleSidebarPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".delete-btn, input")) return;

    // Notes only. Folder dragging is gone: its sibling-reorder half is retired
    // with the rest of manual ordering, and its nest/reparent half never existed
    // — dropping a folder on a folder highlighted the target, then silently did
    // nothing. Removing the affordance beats keeping a promise the app can't keep.
    const noteEl = e.target.closest("[data-note-id]");
    if (!noteEl) return;

    // Prevent browser scroll takeover on touch devices
    if (e.pointerType === "touch") e.preventDefault();

    if (!localStorage.getItem("boojy-drag-tooltip-sidebar")) {
      dragTooltipCount.current.sidebar++;
      if (dragTooltipCount.current.sidebar === 3) {
        localStorage.setItem("boojy-drag-tooltip-sidebar", "1");
        setDragTooltip({
          x: e.clientX,
          y: e.clientY - 40,
          text: "Hold and drag to move into a folder",
        });
        setTimeout(() => setDragTooltip(null), 3000);
      }
    }

    const type = "note";
    const id = noteEl.dataset.noteId;
    const targetEl = noteEl;

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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanupSidebarDrag is stable (no deps), safe to omit
  useEffect(() => () => cleanupSidebarDrag(), []);

  return { sidebarDrag, handleSidebarPointerDown, cancelSidebarDrag };
}
