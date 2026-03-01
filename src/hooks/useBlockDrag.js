import { useRef } from "react";
import { getBlockFromNode, runAutoScroll } from "../utils/domHelpers";

export function useBlockDrag({
  noteDataRef, activeNote, setNoteData, pushHistory, popHistory,
  blockRefs, editorRef, editorScrollRef,
  accentColor, editorBg,
  setDragTooltip, dragTooltipCount,
  setToolbarState,
}) {
  const blockDrag = useRef({
    active: false,
    blockId: null,
    blockIds: [],
    originalBlocks: null,
    cloneEl: null,
    startX: 0, startY: 0,
    offsetY: 0,
    startIndex: -1,
    currentIndex: -1,
    holdTimer: null,
    scrollRAF: null,
  });

  const activateBlockDrag = (blockInfo, pointerY) => {
    const bd = blockDrag.current;
    const blocks = noteDataRef.current[activeNote]?.content?.blocks;
    if (!blocks || blocks.length <= 1) return;

    const blockId = blockInfo.blockId;
    const blockIndex = blockInfo.blockIndex;
    const el = blockRefs.current[blockId];
    if (!el) return;

    pushHistory();

    let draggedIds = [blockId];
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const multiIds = blocks.filter((b) => {
        const bEl = blockRefs.current[b.id];
        return bEl && range.intersectsNode(bEl);
      }).map(b => b.id);
      if (multiIds.length > 1 && multiIds.includes(blockId)) {
        draggedIds = multiIds;
      }
    }

    if (editorRef.current) editorRef.current.blur();
    window.getSelection().removeAllRanges();
    setToolbarState(null);

    bd.originalBlocks = structuredClone(blocks);
    bd.blockId = blockId;
    bd.blockIds = draggedIds;
    bd.startIndex = blockIndex;
    bd.currentIndex = blockIndex;
    bd.active = true;

    const rect = el.getBoundingClientRect();
    bd.offsetY = pointerY - rect.top;

    const clone = document.createElement("div");
    if (draggedIds.length > 1) {
      for (const id of draggedIds) {
        const srcEl = blockRefs.current[id];
        if (srcEl) {
          const c = srcEl.cloneNode(true);
          c.removeAttribute("contenteditable");
          c.querySelectorAll("[contenteditable]").forEach(e => e.removeAttribute("contenteditable"));
          clone.appendChild(c);
        }
      }
    } else {
      const c = el.cloneNode(true);
      c.removeAttribute("contenteditable");
      c.querySelectorAll("[contenteditable]").forEach(e => e.removeAttribute("contenteditable"));
      clone.appendChild(c);
    }
    Object.assign(clone.style, {
      position: "fixed",
      left: rect.left + "px",
      top: (pointerY - bd.offsetY) + "px",
      width: rect.width + "px",
      zIndex: "1000",
      pointerEvents: "none",
      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      opacity: "0.85",
      transform: "scale(1.02)",
      background: editorBg,
      borderRadius: "6px",
      overflow: "hidden",
      transition: "none",
    });
    document.body.appendChild(clone);
    bd.cloneEl = clone;

    for (const id of draggedIds) {
      const slotEl = blockRefs.current[id];
      if (slotEl) {
        slotEl.dataset.dragSlot = "true";
        slotEl.style.opacity = "0.25";
        slotEl.style.outline = `2px dashed ${accentColor}40`;
        slotEl.style.outlineOffset = "-2px";
        slotEl.style.borderRadius = "4px";
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
    bd._updatePointerY = (y) => { lastPointerY = y; };
  };

  const updateBlockDropTarget = (pointerY) => {
    const bd = blockDrag.current;
    if (!bd.active) return;
    const blocks = noteDataRef.current[activeNote]?.content?.blocks;
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
    setNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[activeNote] };
      const blks = [...n.content.blocks];
      const dragged = dragIds.map(id => blks.find(b => b.id === id)).filter(Boolean);
      const remaining = blks.filter(b => !dragIds.includes(b.id));
      let insertAt = targetIndex;
      let removedBefore = 0;
      for (let i = 0; i < blks.length && i < targetIndex; i++) {
        if (dragIds.includes(blks[i].id)) removedBefore++;
      }
      insertAt = Math.min(targetIndex - removedBefore, remaining.length);
      remaining.splice(insertAt, 0, ...dragged);
      n.content = { ...n.content, blocks: remaining };
      next[activeNote] = n;
      return next;
    });
    bd.currentIndex = targetIndex;
  };

  const cleanupBlockDrag = () => {
    const bd = blockDrag.current;
    if (bd.cloneEl && bd.cloneEl.parentNode) {
      bd.cloneEl.parentNode.removeChild(bd.cloneEl);
    }
    for (const id of (bd.blockIds || [bd.blockId])) {
      const el = blockRefs.current[id];
      if (el) {
        delete el.dataset.dragSlot;
        el.style.opacity = "";
        el.style.outline = "";
        el.style.outlineOffset = "";
        el.style.borderRadius = "";
      }
    }
    document.body.classList.remove("block-dragging");
    if (bd.scrollRAF) { cancelAnimationFrame(bd.scrollRAF); bd.scrollRAF = null; }
    bd.active = false;
    bd.blockId = null;
    bd.blockIds = [];
    bd.originalBlocks = null;
    bd.cloneEl = null;
    bd.holdTimer = null;
    bd._updatePointerY = null;
  };

  const finalizeBlockDrag = () => {
    const bd = blockDrag.current;
    if (!bd.active) return;
    if (bd.scrollRAF) { cancelAnimationFrame(bd.scrollRAF); bd.scrollRAF = null; }

    const slotEl = blockRefs.current[bd.blockId];
    if (slotEl && bd.cloneEl) {
      const slotRect = slotEl.getBoundingClientRect();
      Object.assign(bd.cloneEl.style, {
        transition: "top 200ms ease, left 200ms ease, opacity 200ms ease, transform 200ms ease",
        top: slotRect.top + "px",
        left: slotRect.left + "px",
        transform: "scale(1)",
        opacity: "0",
      });
      setTimeout(() => cleanupBlockDrag(), 200);
    } else {
      cleanupBlockDrag();
    }
  };

  const cancelBlockDrag = () => {
    const bd = blockDrag.current;
    if (bd.holdTimer) { clearTimeout(bd.holdTimer); bd.holdTimer = null; }
    if (!bd.active) return;
    if (bd.originalBlocks) {
      setNoteData(prev => {
        const next = { ...prev };
        const n = { ...next[activeNote] };
        n.content = { ...n.content, blocks: bd.originalBlocks };
        next[activeNote] = n;
        return next;
      });
    }
    popHistory();
    cleanupBlockDrag();
  };

  const handleEditorPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".checkbox-box, button, img, .delete-btn")) return;
    const blocks = noteDataRef.current[activeNote]?.content?.blocks;
    const blockInfo = getBlockFromNode(e.target, editorRef.current, blocks, blockRefs.current);
    if (!blockInfo) return;
    if (!blocks || blocks.length <= 1) return;

    // One-time tooltip
    if (!localStorage.getItem("boojy-drag-tooltip-editor")) {
      dragTooltipCount.current.editor++;
      if (dragTooltipCount.current.editor === 3) {
        localStorage.setItem("boojy-drag-tooltip-editor", "1");
        setDragTooltip({ x: e.clientX, y: e.clientY - 40, text: "Hold and drag to reorder" });
        setTimeout(() => setDragTooltip(null), 3000);
      }
    }

    const bd = blockDrag.current;
    bd.startX = e.clientX;
    bd.startY = e.clientY;

    const pY = e.clientY;
    bd.holdTimer = setTimeout(() => {
      activateBlockDrag(blockInfo, pY);
    }, 400);

    const onMove = (ev) => {
      if (bd.holdTimer && !bd.active) {
        const dx = ev.clientX - bd.startX;
        const dy = ev.clientY - bd.startY;
        if (Math.hypot(dx, dy) > 5) {
          clearTimeout(bd.holdTimer);
          bd.holdTimer = null;
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        }
        return;
      }
      if (bd.active) {
        if (bd.cloneEl) {
          bd.cloneEl.style.top = (ev.clientY - bd.offsetY) + "px";
        }
        if (bd._updatePointerY) bd._updatePointerY(ev.clientY);
        updateBlockDropTarget(ev.clientY);
      }
    };
    const onUp = () => {
      if (bd.holdTimer) { clearTimeout(bd.holdTimer); bd.holdTimer = null; }
      if (bd.active) finalizeBlockDrag();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return { blockDrag, handleEditorPointerDown, cancelBlockDrag };
}
