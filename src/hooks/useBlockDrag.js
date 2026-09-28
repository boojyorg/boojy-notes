import { useRef, useEffect } from "react";
import { EASE_ENTER, currentSettleMs, prefersReducedMotion } from "../tokens/motion";
import { cssZoom, runAutoScroll, suppressNextClick } from "../utils/domHelpers";
import { reorderFloor } from "../utils/blockOrder";
import { selectedIds, subtreeEnd } from "../utils/blockRun";
import { measureBlockPlaces, settleBlocks } from "../utils/blockSettle";

/** Pointer travel from the grip that means "this is a drag, not a click". */
const DRAG_THRESHOLD = 3;
/** The copy that follows the pointer: a translucent print of the block, no card. */
const GHOST_OPACITY = 0.35;
/** Marker offset when the drop position has no neighbour on one side. */
const EDGE_GAP = 4;

/**
 * Block reorder by drag — started from the gutter grip (`BlockDragHandle`),
 * never from the block text. Text is for writing and selecting; the handle is
 * for moving. (Press-and-hold on the text was the previous model; it was
 * removed 2026-09-03 after a live comparison, because a hold timer makes every
 * pause-then-drag-to-select a race.) Keyboard reorder lives in
 * `useKeyboardHandlers` (Cmd/Ctrl+Shift+↑/↓) and is untouched by this.
 *
 * The drag commits on drop. Nothing in the note moves while the pointer is
 * down: a translucent copy of the block(s) follows the pointer, a thin
 * insertion marker shows where release would put them, and the reorder (plus
 * its single history entry) happens on release. Judged live 2026-09-03 against
 * the earlier live-reorder model, whose blocks shuffled under the pointer as
 * it crossed them; the page staying still until the hand lets go read as
 * calmer and more trustworthy. Escape, window blur, or releasing outside the
 * editor's scroll area cancel, and there is nothing to restore because nothing
 * was written.
 *
 * The motion is at the two ends: a drop settles the moved blocks into their
 * new places from where the copy was (utils/blockSettle), and a drag that
 * moves nothing sends its copy back to the block it came from.
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
  commitNoteData,
  blockRefs,
  editorRef,
  editorScrollRef,
  setToolbarState,
  blockSelectionRef,
}) {
  const fadeTimer = useRef(null);
  const blockDrag = useRef({
    active: false,
    // The note the drag started in. The drop writes to this note, never to
    // whichever note is active when the pointer is released.
    noteId: null,
    blockId: null,
    blockIds: [],
    cloneEl: null,
    markerEl: null,
    startX: 0,
    startY: 0,
    offsetY: 0,
    // CSS zoom (the UI scale) at drag start; viewport pixels ÷ this = CSS pixels.
    zoom: 1,
    startIndex: -1,
    targetIndex: -1,
    // The boundary the marker last stood at: a new one glides, the same one
    // follows auto-scroll at once.
    markerIndex: -1,
    outside: false,
    scrollRAF: null,
  });

  // The block's root, marker and indent included: a list item's ref is its
  // text span, and a copy of that was the words alone, without its bullet or
  // the depth that shows which items are nested.
  const rootOf = (id) => {
    const ref = blockRefs.current[id];
    return ref?.closest?.("[data-block-id]") ?? ref;
  };

  /** Move `dragIds` so they sit before original index `targetIndex`. */
  const reorderBlocks = (blks, dragIds, targetIndex) => {
    const dragged = dragIds.map((id) => blks.find((b) => b.id === id)).filter(Boolean);
    const remaining = blks.filter((b) => !dragIds.includes(b.id));
    let removedBefore = 0;
    for (let i = 0; i < blks.length && i < targetIndex; i++) {
      if (dragIds.includes(blks[i].id)) removedBefore++;
    }
    const insertAt = Math.min(targetIndex - removedBefore, remaining.length);
    remaining.splice(insertAt, 0, ...dragged);
    return remaining;
  };

  const activateBlockDrag = (blockInfo, pointerY) => {
    const bd = blockDrag.current;
    const noteId = activeNoteRef.current;
    const blocks = noteDataRef.current[noteId]?.content?.blocks;
    if (!blocks || blocks.length <= 1) return;

    const blockId = blockInfo.blockId;
    const blockIndex = blockInfo.blockIndex;
    const el = rootOf(blockId);
    if (!el) return;

    // What moves: the whole-block selection when the grabbed block is in it;
    // else a text selection spanning several blocks, one of them the grabbed
    // block; else the block with the items nested under it (utils/blockRun,
    // the rule the selection uses). A range that reaches the frontmatter root
    // takes the body alone (Chromium makes none today: Select All starts in
    // the first paragraph's text, probed 2026-09-15; the rule holds whatever a
    // range says).
    const run = selectedIds(blocks, blockSelectionRef?.current ?? null);
    let draggedIds = run.includes(blockId)
      ? run
      : blocks.slice(blockIndex, subtreeEnd(blocks, blockIndex) + 1).map((b) => b.id);
    const sel = window.getSelection();
    if (!run.includes(blockId) && sel.rangeCount && !sel.isCollapsed) {
      const floor = reorderFloor(blocks);
      const range = sel.getRangeAt(0);
      const multiIds = blocks
        .filter((b, i) => {
          if (i < floor) return false;
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

    bd.noteId = noteId;
    bd.blockId = blockId;
    bd.blockIds = draggedIds;
    bd.startIndex = blockIndex;
    bd.targetIndex = blockIndex;
    bd.markerIndex = -1;
    bd.outside = false;
    bd.active = true;

    const rect = el.getBoundingClientRect();
    bd.offsetY = pointerY - rect.top;
    // The ghost and the marker live on <body>, inside the UI scale's `zoom`:
    // pointer and rect values are viewport pixels, their styles are CSS pixels.
    const zoom = cssZoom(document.body);
    bd.zoom = zoom;

    // Ghost: a static, translucent print of the dragged block(s). No card, no
    // shadow, no lift — the page underneath stays exactly as it was and the
    // copy is the only thing that moves.
    const clone = document.createElement("div");
    for (const id of draggedIds) {
      const srcEl = rootOf(id);
      if (!srcEl) continue;
      const c = srcEl.cloneNode(true);
      c.removeAttribute("contenteditable");
      for (const e of c.querySelectorAll("[contenteditable]")) e.removeAttribute("contenteditable");
      clone.appendChild(c);
    }
    // The clone lives on <body>, so carry the editor's type with it or it
    // falls back to the browser default face.
    const src = getComputedStyle(el);
    Object.assign(clone.style, {
      fontFamily: src.fontFamily,
      color: src.color,
      position: "fixed",
      left: `${rect.left / zoom}px`,
      top: `${(pointerY - bd.offsetY) / zoom}px`,
      width: `${rect.width / zoom}px`,
      zIndex: "1000",
      pointerEvents: "none",
      opacity: String(GHOST_OPACITY),
      willChange: "top",
    });
    document.body.appendChild(clone);
    bd.cloneEl = clone;

    // Insertion marker: painted by positionMarker as the pointer moves.
    const marker = document.createElement("div");
    marker.className = "block-drop-marker";
    marker.style.display = "none";
    document.body.appendChild(marker);
    bd.markerEl = marker;

    document.body.classList.add("block-dragging");

    const scrollEl = editorScrollRef.current;
    let lastPointerY = pointerY;
    let lastPointerX = bd.startX;
    const scrollLoop = () => {
      if (!bd.active) return;
      runAutoScroll(scrollEl, lastPointerY);
      // The marker is fixed-positioned, so it must follow the blocks as
      // auto-scroll moves them under a stationary pointer.
      updateBlockDropTarget(lastPointerY, lastPointerX);
      bd.scrollRAF = requestAnimationFrame(scrollLoop);
    };
    bd.scrollRAF = requestAnimationFrame(scrollLoop);
    bd._updatePointer = (y, x) => {
      lastPointerY = y;
      if (x != null) lastPointerX = x;
    };
  };

  /** Paint the insertion marker for the boundary before original index `targetIndex`. */
  const positionMarker = (blocks, targetIndex) => {
    const bd = blockDrag.current;
    const marker = bd.markerEl;
    if (!marker) return;
    if (bd.outside) {
      marker.style.display = "none";
      return;
    }
    let before = null; // first non-dragged block at/after the boundary
    let after = null; // last non-dragged block before the boundary
    let firstDragged = -1;
    let lastDragged = -1;
    for (let i = 0; i < blocks.length; i++) {
      if (bd.blockIds.includes(blocks[i].id)) {
        if (firstDragged === -1) firstDragged = i;
        lastDragged = i;
        continue;
      }
      const el = blockRefs.current[blocks[i].id];
      if (!el) continue;
      if (i < targetIndex) after = el;
      else if (!before) before = el;
    }
    let y;
    const firstEl = blockRefs.current[blocks[firstDragged]?.id];
    const straddles = firstEl && targetIndex >= firstDragged && targetIndex <= lastDragged + 1;
    if (straddles) {
      // The boundary sits where the grabbed block(s) already are: dropping here
      // changes nothing. The gap between `after` and `before` is the grabbed run
      // itself, so its midpoint would cut through the text, and the gap just
      // below the run reads as "it will move down one" when it will not. So the
      // one no-op position is drawn ABOVE the run, always; the first real
      // boundary below appears once the pointer passes the next block's middle.
      const runTop = firstEl.getBoundingClientRect().top;
      y = after ? (after.getBoundingClientRect().bottom + runTop) / 2 : runTop - EDGE_GAP;
    } else if (before && after) {
      y = (after.getBoundingClientRect().bottom + before.getBoundingClientRect().top) / 2;
    } else if (before) {
      y = before.getBoundingClientRect().top - EDGE_GAP;
    } else if (after) {
      y = after.getBoundingClientRect().bottom + EDGE_GAP;
    } else {
      marker.style.display = "none";
      return;
    }
    const col = (editorRef.current || before || after).getBoundingClientRect();
    const zoom = bd.zoom || 1;
    Object.assign(marker.style, {
      transition: targetIndex === bd.markerIndex ? "none" : "",
      display: "block",
      left: `${col.left / zoom}px`,
      width: `${col.width / zoom}px`,
      // offsetHeight is already CSS pixels; only the measured y is scaled.
      top: `${y / zoom - marker.offsetHeight / 2}px`,
    });
    bd.markerIndex = targetIndex;
  };

  const updateBlockDropTarget = (pointerY, pointerX) => {
    const bd = blockDrag.current;
    if (!bd.active) return;
    const blocks = noteDataRef.current[bd.noteId]?.content?.blocks;
    if (!blocks) return;

    let targetIndex = bd.targetIndex;
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
    // Never above the frontmatter: the highest position is the gap under it.
    targetIndex = Math.max(reorderFloor(blocks), Math.min(targetIndex, blocks.length));

    // Releasing outside the editor's scroll area (over the sidebar, say) is a
    // cancel, so the marker disappears the moment the pointer crosses out.
    const scrollEl = editorScrollRef.current;
    if (scrollEl && pointerX != null) {
      const r = scrollEl.getBoundingClientRect();
      // A zero-size rect means the container has no layout yet; don't treat
      // every position as outside it.
      if (r.width && r.height) {
        bd.outside =
          pointerX < r.left || pointerX > r.right || pointerY < r.top || pointerY > r.bottom;
      }
    }
    bd.targetIndex = targetIndex;
    positionMarker(blocks, targetIndex);
  };

  const cleanupBlockDrag = () => {
    const bd = blockDrag.current;
    // The glide home's own timer calls this, and so does unmount: a timer left
    // over from a drop would tidy up again after the page was gone.
    clearTimeout(fadeTimer.current);
    fadeTimer.current = null;
    if (bd.cloneEl?.parentNode) bd.cloneEl.parentNode.removeChild(bd.cloneEl);
    if (bd.markerEl?.parentNode) bd.markerEl.parentNode.removeChild(bd.markerEl);
    document.body.classList.remove("block-dragging");
    if (bd.scrollRAF) {
      cancelAnimationFrame(bd.scrollRAF);
      bd.scrollRAF = null;
    }
    bd.active = false;
    bd.noteId = null;
    bd.blockId = null;
    bd.blockIds = [];
    bd.cloneEl = null;
    bd.markerEl = null;
    bd.startIndex = -1;
    bd.targetIndex = -1;
    bd.markerIndex = -1;
    bd.outside = false;
    bd._updatePointer = null;
    if (bd.moveHandler) window.removeEventListener("pointermove", bd.moveHandler);
    if (bd.upHandler) window.removeEventListener("pointerup", bd.upHandler);
    bd.moveHandler = null;
    bd.upHandler = null;
  };

  /**
   * A drag that moves nothing (dropped in place, outside the editor, Escape,
   * blur): the copy glides back to the block it came from and goes. It went
   * nowhere, and the motion says so; a fade where it stood read as it having
   * gone somewhere.
   */
  const returnHome = () => {
    const bd = blockDrag.current;
    if (bd.scrollRAF) {
      cancelAnimationFrame(bd.scrollRAF);
      bd.scrollRAF = null;
    }
    if (bd.markerEl) bd.markerEl.style.display = "none";
    // Detach the window listeners now; the DOM tidy-up waits for the glide.
    if (bd.moveHandler) window.removeEventListener("pointermove", bd.moveHandler);
    if (bd.upHandler) window.removeEventListener("pointerup", bd.upHandler);
    bd.moveHandler = null;
    bd.upHandler = null;
    bd.active = false;
    const home = rootOf(bd.blockIds[0]);
    if (!bd.cloneEl || !home || prefersReducedMotion()) {
      cleanupBlockDrag();
      return;
    }
    const ms = currentSettleMs();
    // Fading on ease-in keeps the copy visible until it is nearly home.
    Object.assign(bd.cloneEl.style, {
      transition: `top ${ms}ms ${EASE_ENTER}, opacity ${ms}ms ease-in`,
      top: `${home.getBoundingClientRect().top / (bd.zoom || 1)}px`,
      opacity: "0",
    });
    fadeTimer.current = setTimeout(() => cleanupBlockDrag(), ms);
  };

  const finalizeBlockDrag = () => {
    const bd = blockDrag.current;
    if (!bd.active) return;
    // The pointerup that ends a drag is followed by a click; don't let it
    // re-place the caret or hit whatever is under the pointer now.
    suppressNextClick();

    const noteId = bd.noteId;
    const blocks = noteDataRef.current[noteId]?.content?.blocks;
    const next =
      !bd.outside && blocks ? reorderBlocks([...blocks], bd.blockIds, bd.targetIndex) : null;
    // Dropping a block back where it was writes nothing.
    if (!next || next.every((b, i) => b.id === blocks[i].id)) {
      returnHome();
      return;
    }
    // The page as the eye has it at the drop: neighbours where they stand,
    // the moved blocks where their copy is, as translucent.
    const editor = editorRef.current;
    const places = measureBlockPlaces(editor);
    for (const copy of bd.cloneEl?.children ?? []) {
      const id = copy.getAttribute("data-block-id");
      if (id) places.set(id, { top: copy.getBoundingClientRect().top, opacity: GHOST_OPACITY });
    }
    // One history entry per drop that changed the order. The commit applies
    // on top of any text still inside the commit debounce, so a drop right
    // after a keystroke keeps both.
    commitNoteData((prev) => {
      // The note may have been deleted mid-drag; never conjure it back.
      if (!prev[noteId]) return prev;
      const out = { ...prev };
      const n = { ...out[noteId] };
      n.content = { ...n.content, blocks: next };
      out[noteId] = n;
      return out;
    });
    // The copy goes at once: the block itself now stands where it was.
    cleanupBlockDrag();
    settleBlocks(editor, places);
  };

  /** Escape, window blur, or any other abort. Nothing was written, so nothing to restore. */
  const cancelBlockDrag = () => {
    const bd = blockDrag.current;
    if (!bd.active) {
      // A press that never became a drag still holds window listeners.
      if (bd.moveHandler || bd.upHandler) cleanupBlockDrag();
      return;
    }
    returnHome();
  };

  /**
   * Press on the gutter grip for `blockId`. The drag lifts on the first real
   * movement — no timer — and a press released without moving is a click
   * (`onClick`: the grip selects its block).
   */
  const startHandleDrag = (blockId, e, onClick) => {
    if (e.button !== 0) return;
    const blocks = noteDataRef.current[activeNoteRef.current]?.content?.blocks;
    if (!blocks || blocks.length <= 1) return;
    const blockIndex = blocks.findIndex((b) => b.id === blockId);
    if (blockIndex < reorderFloor(blocks)) return; // -1, or the frontmatter
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
      if (bd.cloneEl) bd.cloneEl.style.top = `${(ev.clientY - bd.offsetY) / (bd.zoom || 1)}px`;
      if (bd._updatePointer) bd._updatePointer(ev.clientY, ev.clientX);
      updateBlockDropTarget(ev.clientY, ev.clientX);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      bd.moveHandler = null;
      bd.upHandler = null;
      if (bd.active) finalizeBlockDrag();
      else onClick?.();
    };
    bd.moveHandler = onMove;
    bd.upHandler = onUp;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Deps deliberately not exhaustive: cleanupBlockDrag is stable (no deps), safe to omit
  useEffect(() => () => cleanupBlockDrag(), []);

  return { blockDrag, startHandleDrag, cancelBlockDrag };
}
