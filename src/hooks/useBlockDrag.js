import { useRef, useEffect } from "react";
import { runAutoScroll, suppressNextClick } from "../utils/domHelpers";

/** Pointer travel from the grip that means "this is a drag, not a click". */
const DRAG_THRESHOLD = 3;
const LIFT_MS = 120;
const SETTLE_MS = 200;

/**
 * Block reorder by drag — started from the gutter grip (`BlockDragHandle`),
 * never from the block text. Text is for writing and selecting; the handle is
 * for moving. (Press-and-hold on the text was the previous model; it was
 * removed 2026-09-03 after a live comparison, because a hold timer makes every
 * pause-then-drag-to-select a race.) Keyboard reorder lives in
 * `useKeyboardHandlers` (Cmd/Ctrl+Shift+↑/↓) and is untouched by this.
 *
 * `startHandleDrag` is handed to the handle through EditorContext, whose value
 * is frozen at mount (see EditorContext.jsx). So this hook must never read
 * `activeNote` as a value: it takes `activeNoteRef` and resolves the current
 * note when the press happens. Reading the value here is exactly the bug that
 * made drag work only on the note that was open when the app launched.
 */
export function useBlockDrag({
  noteDataRef,
  activeNoteRef,
  setNoteData,
  pushHistory,
  popHistory,
  blockRefs,
  editorRef,
  editorScrollRef,
  editorBg,
  dragShadow = "0 8px 24px rgba(0,0,0,0.18)",
  slotBg = "transparent",
  setToolbarState,
}) {
  const blockDrag = useRef({
    active: false,
    // The note the drag started in. Every write the drag makes (live reorder,
    // cancel-restore) is keyed by this, never by whichever note is active when
    // the write happens: cancel can arrive from a once-registered window
    // listener (Escape in useAppKeyboard, window blur in BoojyNotes) whose
    // closure may be stale, and restoring the dragged blocks into a different
    // note is data loss.
    noteId: null,
    blockId: null,
    blockIds: [],
    originalBlocks: null,
    cloneEl: null,
    startX: 0,
    startY: 0,
    offsetY: 0,
    startIndex: -1,
    currentIndex: -1,
    scrollRAF: null,
  });

  const activateBlockDrag = (blockInfo, pointerY) => {
    const bd = blockDrag.current;
    const noteId = activeNoteRef.current;
    const blocks = noteDataRef.current[noteId]?.content?.blocks;
    if (!blocks || blocks.length <= 1) return;

    const blockId = blockInfo.blockId;
    const blockIndex = blockInfo.blockIndex;
    const el = blockRefs.current[blockId];
    if (!el) return;

    pushHistory();

    // A selection spanning several blocks, one of them the grabbed block, drags
    // them all — the one multi-block gesture, and it costs no extra UI.
    let draggedIds = [blockId];
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const multiIds = blocks
        .filter((b) => {
          const bEl = blockRefs.current[b.id];
          return bEl && range.intersectsNode(bEl);
        })
        .map((b) => b.id);
      if (multiIds.length > 1 && multiIds.includes(blockId)) {
        draggedIds = multiIds;
      }
    }

    if (editorRef.current) editorRef.current.blur();
    window.getSelection().removeAllRanges();
    setToolbarState(null);

    bd.originalBlocks = [...blocks];
    bd.noteId = noteId;
    bd.blockId = blockId;
    bd.blockIds = draggedIds;
    bd.startIndex = blockIndex;
    bd.currentIndex = blockIndex;
    bd.active = true;

    const rect = el.getBoundingClientRect();
    bd.offsetY = pointerY - rect.top;

    // Ghost: a static clone of the dragged block(s). It is born flat on top of
    // the real block and *lifts* over LIFT_MS — that lift is the one moment
    // that tells the hand "you have it".
    const clone = document.createElement("div");
    for (const id of draggedIds) {
      const srcEl = blockRefs.current[id];
      if (!srcEl) continue;
      const c = srcEl.cloneNode(true);
      c.removeAttribute("contenteditable");
      c.querySelectorAll("[contenteditable]").forEach((e) => e.removeAttribute("contenteditable"));
      clone.appendChild(c);
    }
    // The clone lives on <body>, so carry the editor's type with it or it
    // falls back to the browser default face.
    const src = getComputedStyle(el);
    Object.assign(clone.style, {
      fontFamily: src.fontFamily,
      color: src.color,
      position: "fixed",
      left: rect.left + "px",
      top: pointerY - bd.offsetY + "px",
      width: rect.width + "px",
      zIndex: "1000",
      pointerEvents: "none",
      background: editorBg,
      borderRadius: "6px",
      overflow: "hidden",
      boxShadow: "none",
      opacity: "1",
      transform: "scale(1)",
      transition: "none",
      willChange: "transform, top",
    });
    document.body.appendChild(clone);
    bd.cloneEl = clone;
    requestAnimationFrame(() => {
      if (bd.cloneEl !== clone) return;
      Object.assign(clone.style, {
        transition: `transform ${LIFT_MS}ms ease, box-shadow ${LIFT_MS}ms ease, opacity ${LIFT_MS}ms ease`,
        transform: "scale(1.01)",
        boxShadow: dragShadow,
        opacity: "0.96",
      });
    });

    // Slot: the vacated position. Neutral content-hover surface, text faded to
    // a hint — enough to show where the block will land, no accent, no dashes.
    for (const id of draggedIds) {
      const slotEl = blockRefs.current[id];
      if (slotEl) {
        slotEl.dataset.dragSlot = "true";
        slotEl.style.opacity = "0.3";
        slotEl.style.background = slotBg;
        slotEl.style.borderRadius = "6px";
      }
    }

    document.body.classList.add("block-dragging");

    const scrollEl = editorScrollRef.current;
    let lastPointerY = pointerY;
    const scrollLoop = () => {
      if (!bd.active) return;
      runAutoScroll(scrollEl, lastPointerY);
      bd.scrollRAF = requestAnimationFrame(scrollLoop);
    };
    bd.scrollRAF = requestAnimationFrame(scrollLoop);
    bd._updatePointerY = (y) => {
      lastPointerY = y;
    };
  };

  const updateBlockDropTarget = (pointerY) => {
    const bd = blockDrag.current;
    if (!bd.active) return;
    const noteId = bd.noteId;
    const blocks = noteDataRef.current[noteId]?.content?.blocks;
    if (!blocks) return;

    let targetIndex = bd.currentIndex;
    for (let i = 0; i < blocks.length; i++) {
      if (bd.blockIds.includes(blocks[i].id)) continue;
      const el = blockRefs.current[blocks[i].id];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (pointerY < mid) {
        targetIndex = i;
        break;
      }
      targetIndex = i + 1;
    }

    targetIndex = Math.max(0, Math.min(targetIndex, blocks.length));
    if (targetIndex === bd.currentIndex) return;

    const dragIds = bd.blockIds;
    setNoteData((prev) => {
      if (!prev[noteId]) return prev;
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blks = [...n.content.blocks];
      const dragged = dragIds.map((id) => blks.find((b) => b.id === id)).filter(Boolean);
      const remaining = blks.filter((b) => !dragIds.includes(b.id));
      let insertAt = targetIndex;
      let removedBefore = 0;
      for (let i = 0; i < blks.length && i < targetIndex; i++) {
        if (dragIds.includes(blks[i].id)) removedBefore++;
      }
      insertAt = Math.min(targetIndex - removedBefore, remaining.length);
      remaining.splice(insertAt, 0, ...dragged);
      n.content = { ...n.content, blocks: remaining };
      next[noteId] = n;
      return next;
    });
    bd.currentIndex = targetIndex;
  };

  const cleanupBlockDrag = () => {
    const bd = blockDrag.current;
    if (bd.cloneEl && bd.cloneEl.parentNode) {
      bd.cloneEl.parentNode.removeChild(bd.cloneEl);
    }
    for (const id of bd.blockIds || [bd.blockId]) {
      const el = blockRefs.current[id];
      if (el) {
        delete el.dataset.dragSlot;
        el.style.opacity = "";
        el.style.background = "";
        el.style.borderRadius = "";
      }
    }
    document.body.classList.remove("block-dragging");
    if (bd.scrollRAF) {
      cancelAnimationFrame(bd.scrollRAF);
      bd.scrollRAF = null;
    }
    bd.active = false;
    bd.noteId = null;
    bd.blockId = null;
    bd.blockIds = [];
    bd.originalBlocks = null;
    bd.cloneEl = null;
    bd._updatePointerY = null;
    if (bd.moveHandler) window.removeEventListener("pointermove", bd.moveHandler);
    if (bd.upHandler) window.removeEventListener("pointerup", bd.upHandler);
    bd.moveHandler = null;
    bd.upHandler = null;
  };

  const finalizeBlockDrag = () => {
    const bd = blockDrag.current;
    if (!bd.active) return;
    if (bd.scrollRAF) {
      cancelAnimationFrame(bd.scrollRAF);
      bd.scrollRAF = null;
    }
    // The pointerup that ends a drag is followed by a click; don't let it
    // re-place the caret or hit whatever is under the pointer now.
    suppressNextClick();

    const slotEl = blockRefs.current[bd.blockId];
    if (slotEl && bd.cloneEl) {
      const slotRect = slotEl.getBoundingClientRect();
      Object.assign(bd.cloneEl.style, {
        transition: `top ${SETTLE_MS}ms ease, left ${SETTLE_MS}ms ease, opacity ${SETTLE_MS}ms ease, transform ${SETTLE_MS}ms ease, box-shadow ${SETTLE_MS}ms ease`,
        top: slotRect.top + "px",
        left: slotRect.left + "px",
        transform: "scale(1)",
        boxShadow: "none",
        opacity: "0",
      });
      setTimeout(() => cleanupBlockDrag(), SETTLE_MS);
    } else {
      cleanupBlockDrag();
    }
  };

  const cancelBlockDrag = () => {
    const bd = blockDrag.current;
    if (!bd.active) {
      // A press that never became a drag still holds window listeners.
      if (bd.moveHandler || bd.upHandler) cleanupBlockDrag();
      return;
    }
    const noteId = bd.noteId;
    const originalBlocks = bd.originalBlocks;
    if (originalBlocks && noteId) {
      setNoteData((prev) => {
        // The note may have been deleted mid-drag; never conjure it back.
        if (!prev[noteId]) return prev;
        const next = { ...prev };
        const n = { ...next[noteId] };
        n.content = { ...n.content, blocks: originalBlocks };
        next[noteId] = n;
        return next;
      });
    }
    popHistory();
    cleanupBlockDrag();
  };

  /**
   * Press on the gutter grip for `blockId`. The drag lifts on the first real
   * movement — no timer — and a press released without moving does nothing.
   */
  const startHandleDrag = (blockId, e) => {
    if (e.button !== 0) return;
    const blocks = noteDataRef.current[activeNoteRef.current]?.content?.blocks;
    if (!blocks || blocks.length <= 1) return;
    const blockIndex = blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) return;
    const blockInfo = { blockId, blockIndex };

    const bd = blockDrag.current;
    bd.startX = e.clientX;
    bd.startY = e.clientY;

    const onMove = (ev) => {
      if (!bd.active) {
        const dx = ev.clientX - bd.startX;
        const dy = ev.clientY - bd.startY;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) activateBlockDrag(blockInfo, ev.clientY);
        return;
      }
      if (bd.cloneEl) bd.cloneEl.style.top = ev.clientY - bd.offsetY + "px";
      if (bd._updatePointerY) bd._updatePointerY(ev.clientY);
      updateBlockDropTarget(ev.clientY);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      bd.moveHandler = null;
      bd.upHandler = null;
      if (bd.active) finalizeBlockDrag();
    };
    bd.moveHandler = onMove;
    bd.upHandler = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanupBlockDrag is stable (no deps), safe to omit
  useEffect(() => () => cleanupBlockDrag(), []);

  return { blockDrag, startHandleDrag, cancelBlockDrag };
}
