import { useRef, useEffect } from "react";
import { useTheme } from "./useTheme";
import { runAutoScroll, suppressNextClick } from "../utils/domHelpers";

const LIFT_MS = 120;
const SETTLE_MS = 200;
/**
 * A pointer drag starts once the press has travelled this far, as in Finder,
 * Notion and Obsidian (2026-09-24). Before, a mouse press had to be held still
 * for HOLD_MS and any movement first cancelled it, so a quick grab-and-move did
 * nothing and a slow click was swallowed. A click's jitter stays under it.
 */
const DRAG_THRESHOLD = 5;
/** Touch keeps the hold: a finger that moves without holding first is scrolling. */
const HOLD_MS = 400;

/**
 * Drag of a note or folder row (by the mouse, once it has moved
 * DRAG_THRESHOLD; by touch, after a HOLD_MS hold) onto a folder row (or, in the
 * sidebar, onto the Notes row or the empty space under the tree for the
 * root). The sidebar's scroller is the default; a row inside an element
 * carrying `data-drag-scroller` drags within that element instead (the
 * path's folder popup, 2026-09-20), which is then what auto-scrolls and where
 * the targets are looked for. `data-drag-scroller="folders"` says folder rows
 * are the only targets there, plus the one row carrying `data-drop-scope`
 * (the popup's head row: the folder whose contents are shown, `""` for the
 * root), which means "into that folder": no implicit root, a release
 * anywhere else flies the pill back. A drop from such a scroller asks the
 * move to reveal where the thing landed (`{ reveal: true }`), since the
 * sidebar, if it is showing, was not where the drop happened.
 *
 * `moveNotes(ids, folder, { reveal })` and `moveFolder(path, parent,
 * { reveal })` make the move; both are the app's, so a drop and Move to…
 * end in the same place.
 */
export function useSidebarDrag({
  noteDataRef,
  moveNotes,
  sidebarScrollRef,
  selectedNotesRef,
  clearSelectionRef,
  moveFolder,
}) {
  // Read through a ref at paint time, never from the render that made the
  // handler: a drag paints from inside listeners registered at pointer-down,
  // and a theme switched after mount left the drop target on Light's #ECECEC
  // over the dark sidebar (seen 2026-09-14).
  const { theme: renderTheme } = useTheme();
  const themeRef = useRef(renderTheme);
  themeRef.current = renderTheme;
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
      background: themeRef.current.BG.elevated,
      color: themeRef.current.TEXT.primary,
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
        background: themeRef.current.ACCENT.primary,
        color: themeRef.current.ACCENT.onAccent,
        fontSize: "11px",
        fontWeight: "600",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: themeRef.current.dragShadow,
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
        boxShadow: themeRef.current.dragShadow,
        opacity: "0.96",
      });
    });

    document.body.classList.add("block-dragging");

    // Escape cancels a live drag: the pill flies back and nothing moves. On
    // the document in the capture phase, so the surface the drag started in
    // (the popup closes itself on Escape) never sees the key.
    sd.keyHandler = (ev) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      cancelSidebarDrag();
    };
    document.addEventListener("keydown", sd.keyHandler, true);

    const scrollEl = sd.scrollEl;
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
  // One target is painted at a time, and what it held before is put back when
  // the pointer leaves it: clearing the inline background to "" instead left a
  // folder row (a <button>) on the UA's buttonface, #EFEFEF, so after the first
  // drag every folder lit up white in Dark (Tyr, 2026-09-14).
  const paintDropTarget = (el) => {
    const sd = sidebarDrag.current;
    if (sd.painted?.el === el) return;
    clearDropHighlights();
    sd.painted = { el, background: el.style.background, boxShadow: el.style.boxShadow };
    el.style.background = themeRef.current.BG.hover;
    el.style.boxShadow = `inset 0 0 0 1px ${themeRef.current.TEXT.muted}`;
  };

  const clearDropHighlights = () => {
    const sd = sidebarDrag.current;
    const p = sd.painted;
    if (!p) return;
    p.el.style.background = p.background;
    p.el.style.boxShadow = p.boxShadow;
    sd.painted = null;
  };

  const updateSidebarDropTarget = (pointerX, pointerY) => {
    const sd = sidebarDrag.current;
    if (!sd.active) return;
    const scrollEl = sd.scrollEl;
    if (!scrollEl) return;
    const scrollRect = scrollEl.getBoundingClientRect();

    if (
      pointerX < scrollRect.left ||
      pointerX > scrollRect.right ||
      pointerY < scrollRect.top ||
      pointerY > scrollRect.bottom
    ) {
      clearDropHighlights();
      // Outside the sidebar there is no target. Dropping here cancels: drag
      // changes where a note lives, it never navigates (dropping over the
      // editor used to open the note — removed 2026-09-03).
      sd.dropTarget = null;
      return;
    }

    // Containers only. A folder row means "move into this folder" across its whole
    // height, and the vault header (plus the empty space under the trees) means
    // "move to root". There are no above/below insertion zones any more: drag
    // changes a note's location, the sort preference decides display order.
    let target = null;
    const folderEls = scrollEl.querySelectorAll("[data-folder-path]");

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

    if (!target && sd.foldersOnly) {
      // The popup: folder rows, its head row (the scope; "" is the root), or
      // nothing. The pointer between rows, or on a note row, is over no
      // target, and a release there cancels.
      const scopeEl = scrollEl.querySelector("[data-drop-scope]");
      if (scopeEl) {
        const scope = scopeEl.dataset.dropScope;
        const rect = scopeEl.getBoundingClientRect();
        const ownTree =
          sd.type === "folder" && scope && (scope === sd.id || scope.startsWith(`${sd.id}/`));
        if (pointerY >= rect.top && pointerY <= rect.bottom && !ownTree) {
          sd.dropTarget = scope
            ? { type: "folder", id: scope, el: scopeEl }
            : { type: "root", el: scopeEl };
          paintDropTarget(scopeEl);
          return;
        }
      }
      sd.dropTarget = null;
      clearDropHighlights();
      return;
    }

    if (!target) {
      // Explicit root target: the vault header.
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
      // vault header (when there is one) is what makes this legible.
      const rootEl = scrollEl.querySelector("[data-drop-root]");
      target = { type: "root", el: rootEl || null };
    }

    sd.dropTarget = target;
    if (target.el) paintDropTarget(target.el);
    else clearDropHighlights();
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

    // A drop in the sidebar lands where the eye already is; one made in the
    // popup asks the sidebar (if it is showing) to reveal the destination.
    const reveal = sd.scrollEl !== sidebarScrollRef.current;
    if (sd.type === "note") {
      // The only remaining outcome: move the note's real file. `folder: null`
      // is root; anything else is that folder. write-note relocates the .md on
      // disk (new file written before the old one is unlinked). A location is
      // a change of record, not an edit: no undo entry, and undo never moves
      // a file back.
      const targetFolder = target.type === "folder" ? target.id : null;
      const ids = sd.draggedIds && sd.draggedIds.length > 0 ? sd.draggedIds : [sd.id];
      moveNotes(ids, targetFolder, { reveal });
    } else if (sd.type === "folder" && moveFolder) {
      // Folders are directories: the move is one directory rename on disk,
      // into the target folder or back to the root. Never a reorder.
      moveFolder(sd.id, target.type === "folder" ? target.id : null, { reveal });
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
    clearDropHighlights();
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
    if (sd.cloneEl?.parentNode) sd.cloneEl.parentNode.removeChild(sd.cloneEl);
    if (sd.scrollRAF) {
      cancelAnimationFrame(sd.scrollRAF);
      sd.scrollRAF = null;
    }
    clearDropHighlights();
    if (sd._scrollEl) {
      sd._scrollEl.style.touchAction = "";
      sd._scrollEl = null;
    }
    document.body.classList.remove("block-dragging");
    if (sd.keyHandler) document.removeEventListener("keydown", sd.keyHandler, true);
    sd.keyHandler = null;
    sd.scrollEl = null;
    sd.foldersOnly = false;
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

    const type = rowEl.dataset.noteId ? "note" : "folder";
    const id = type === "note" ? rowEl.dataset.noteId : rowEl.dataset.folderPath;
    const targetEl = rowEl;

    const sd = sidebarDrag.current;
    // The scroller the drag lives in: the row's own, or the sidebar's.
    const own = rowEl.closest("[data-drag-scroller]");
    sd.scrollEl = own || sidebarScrollRef.current;
    sd.foldersOnly = own?.dataset.dragScroller === "folders";
    sd.startX = e.clientX;
    sd.startY = e.clientY;

    const touch = e.pointerType === "touch";
    if (touch) {
      const pY = e.clientY;
      sd.holdTimer = setTimeout(() => {
        sd.holdTimer = null;
        activateSidebarDrag(type, id, targetEl, pY);
      }, HOLD_MS);
    }
    let pending = !touch;

    const follow = (ev) => {
      if (sd.cloneEl) {
        sd.cloneEl.style.top = ev.clientY - sd.offsetY + "px";
        sd.cloneEl.style.left = ev.clientX - sd.offsetX + "px";
      }
      if (sd._updatePointerY) sd._updatePointerY(ev.clientY);
      updateSidebarDropTarget(ev.clientX, ev.clientY);
    };

    const onMove = (ev) => {
      const travelled = Math.hypot(ev.clientX - sd.startX, ev.clientY - sd.startY);
      if (pending) {
        // A mouse press becomes a drag once it has travelled; the pill is
        // lifted from where the press began, then follows at once.
        if (travelled <= DRAG_THRESHOLD) return;
        pending = false;
        activateSidebarDrag(type, id, targetEl, sd.startY);
        follow(ev);
        return;
      }
      if (sd.holdTimer && !sd.active) {
        // Touch: moving before the hold completes is a scroll, not a drag.
        if (travelled > DRAG_THRESHOLD) {
          clearTimeout(sd.holdTimer);
          sd.holdTimer = null;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        }
        return;
      }
      if (sd.active) follow(ev);
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

  // Deps deliberately not exhaustive: cleanupSidebarDrag is stable (no deps), safe to omit
  useEffect(() => () => cleanupSidebarDrag(), []);

  return { sidebarDrag, handleSidebarPointerDown, cancelSidebarDrag };
}
