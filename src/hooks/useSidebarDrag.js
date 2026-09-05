import { useRef, useEffect } from "react";
import { useTheme } from "./useTheme";
import { isNative } from "../utils/platform";
import { getAPI } from "../services/apiProvider";
import { runAutoScroll, suppressNextClick } from "../utils/domHelpers";

const LIFT_MS = 120;
const SETTLE_MS = 200;

export function useSidebarDrag({
  noteDataRef,
  setNoteData,
  customFolders: _customFolders,
  sidebarScrollRef,
  accentColor,
  chromeBg: _chromeBg,
  setDragTooltip,
  dragTooltipCount,
  selectedNotesRef,
  clearSelectionRef,
  moveFolder,
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

    // Ghost: a compact pill carrying just the title — note rows carry no glyph
    // at rest, so neither does the thing you lift off them. Born flat over the
    // row and lifted over LIFT_MS so the hand knows it has it.
    const noteTitle =
      (type === "note" && noteDataRef.current[id]?.title) || el.textContent?.trim() || "Untitled";
    const pill = document.createElement("div");
    Object.assign(pill.style, {
      position: "fixed",
      left: rect.left + "px",
      top: rect.top + "px",
      maxWidth: "220px",
      height: rect.height + "px",
      padding: "0 12px",
      borderRadius: "12px",
      zIndex: "1000",
      pointerEvents: "none",
      background: theme.BG.elevated,
      color: theme.TEXT.primary,
      boxShadow: "none",
      opacity: "1",
      transform: "scale(1)",
      transition: "none",
      display: "flex",
      alignItems: "center",
      fontSize: "13px",
      fontWeight: "500",
      // On <body> "inherit" is the browser default face; take the row's.
      fontFamily: getComputedStyle(el).fontFamily,
      whiteSpace: "nowrap",
      overflow: "hidden",
      willChange: "transform, top, left",
    });
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
        boxShadow: theme.dragShadow,
      });
      badge.textContent = String(sd.draggedIds.length);
      pill.style.overflow = "visible";
      pill.appendChild(badge);
    }
    document.body.appendChild(pill);
    sd.cloneEl = pill;
    sd.originRect = rect;
    sd.startY = pointerY;
    sd.offsetY = pointerY - rect.top;
    sd.offsetX = sd.startX - rect.left;
    requestAnimationFrame(() => {
      if (sd.cloneEl !== pill) return;
      Object.assign(pill.style, {
        transition: `transform ${LIFT_MS}ms ease, box-shadow ${LIFT_MS}ms ease, opacity ${LIFT_MS}ms ease`,
        transform: "scale(1.02)",
        boxShadow: theme.dragShadow,
        opacity: "0.96",
      });
    });

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
      // Outside the sidebar there is no target. Dropping here cancels: drag
      // changes where a note lives, it never navigates (dropping over the
      // editor used to open the note — removed 2026-09-03).
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
      const folderPath = el.dataset.folderPath;
      // A folder cannot be dropped into itself or its own subtree; those rows
      // are not targets, so the pointer falls through to the root.
      if (sd.type === "folder" && (folderPath === sd.id || folderPath.startsWith(`${sd.id}/`)))
        continue;
      const rect = el.getBoundingClientRect();
      if (pointerY >= rect.top && pointerY <= rect.bottom) {
        target = { type: "folder", id: folderPath, el };
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
    // The pointerup that ends a drag is followed by a click on whatever is
    // under the pointer — very often the row we lifted from. Swallow it.
    suppressNextClick();

    if (!target) {
      flyBack();
      return;
    }

    if (sd.type === "note") {
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
    } else if (sd.type === "folder" && moveFolder) {
      // Folders are directories: the move is one directory rename on disk,
      // into the target folder or back to the root. Never a reorder.
      moveFolder(sd.id, target.type === "folder" ? target.id : null);
    }

    cleanupSidebarDrag();
  };

  /** No valid target: the pill returns to the row it came from, then everything resets. */
  const flyBack = () => {
    const sd = sidebarDrag.current;
    const pill = sd.cloneEl;
    const origin = sd.originRect;
    if (!pill || !origin) {
      cleanupSidebarDrag();
      return;
    }
    if (sd.scrollRAF) {
      cancelAnimationFrame(sd.scrollRAF);
      sd.scrollRAF = null;
    }
    clearDropHighlights(sidebarScrollRef.current);
    Object.assign(pill.style, {
      transition: `top ${SETTLE_MS}ms ease, left ${SETTLE_MS}ms ease, opacity ${SETTLE_MS}ms ease, transform ${SETTLE_MS}ms ease, box-shadow ${SETTLE_MS}ms ease`,
      top: origin.top + "px",
      left: origin.left + "px",
      transform: "scale(1)",
      boxShadow: "none",
      opacity: "0",
    });
    // Detach the pill from the drag record so cleanup can run now (listeners,
    // classes, state) while the pill finishes its flight on its own.
    sd.cloneEl = null;
    setTimeout(() => pill.parentNode?.removeChild(pill), SETTLE_MS);
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
    sd.originRect = null;
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
    if (sd.active) {
      suppressNextClick();
      flyBack();
      return;
    }
    cleanupSidebarDrag();
  };

  const handleSidebarPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".delete-btn, input")) return;

    // Notes and folders both drag, and both mean location: a note's file moves
    // into the target folder, a folder's directory moves into it (or out to the
    // root). There is no reorder; the sort preference decides display order. A
    // folder row is a button beside its children, so a press on a nested note
    // resolves to the note, never to the folder above it.
    const rowEl = e.target.closest("[data-note-id], [data-folder-path]");
    if (!rowEl) return;

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

    const type = rowEl.dataset.noteId ? "note" : "folder";
    const id = type === "note" ? rowEl.dataset.noteId : rowEl.dataset.folderPath;
    const targetEl = rowEl;

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
