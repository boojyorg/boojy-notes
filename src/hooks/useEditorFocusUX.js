import { useEffect, useLayoutEffect } from "react";
import { cleanOrphanNodes, getBlockFromNode, placeCaret } from "../utils/domHelpers";

/**
 * Editor focus/caret UX, single-pane only. Two effects, no return value:
 *   1. selectionchange → position the floating formatting toolbar over the selection
 *      (rAF-debounced; clears the toolbar when the selection leaves the editor).
 *   2. a layout effect that, when a focus target is queued (focusBlockId/focusCursorPos),
 *      places the caret in that block, re-asserts it after the next frame if the DOM
 *      moved, and scrolls the block into view if it landed near the bottom.
 *
 * Extracted from BoojyNotes. Both effects are guarded off in split mode, matching
 * the original inline behaviour. The layout effect intentionally has no dependency
 * array (runs every render) — preserved verbatim.
 */
export function useEditorFocusUX({
  splitState,
  splitStateRef,
  activeNote,
  editorRef,
  editorScrollRef,
  blockRefs,
  focusBlockId,
  focusCursorPos,
  noteDataRef,
  setToolbarState,
}) {
  // Selection change → floating toolbar (only in single-pane mode)
  useEffect(() => {
    if (splitStateRef.current.splitMode) return;
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) {
        setToolbarState(null);
        return;
      }
      if (!editorRef.current) {
        setToolbarState(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const startBlock =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer;
      if (!editorRef.current.contains(startBlock)) {
        setToolbarState(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const editorRect = editorRef.current.getBoundingClientRect();
      let el = startBlock;
      while (el && el !== editorRef.current) {
        if (el.dataset && el.dataset.blockId) break;
        el = el.parentElement;
      }
      if (!el || el === editorRef.current) {
        setToolbarState(null);
        return;
      }
      setToolbarState({
        top: rect.top - editorRect.top - 44,
        left: rect.left - editorRect.left + rect.width / 2,
      });
    };
    let rafId = null;
    const debouncedSelChange = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        onSelChange();
      });
    };
    document.addEventListener("selectionchange", debouncedSelChange);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("selectionchange", debouncedSelChange);
    };
  }, [activeNote, splitState.splitMode]); // eslint-disable-line react-hooks/exhaustive-deps -- splitStateRef is a stable ref

  // Focus block layout effect (only in single-pane mode)
  useLayoutEffect(() => {
    if (splitState.splitMode) return;
    if (focusBlockId.current) {
      cleanOrphanNodes(editorRef.current);
      const targetId = focusBlockId.current;
      const targetPos = focusCursorPos.current ?? 0;
      focusBlockId.current = null;
      focusCursorPos.current = null;
      const el = blockRefs.current[targetId];
      placeCaret(el, targetPos);
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        const blocks = noteDataRef.current[activeNote]?.content?.blocks;
        if (
          sel.rangeCount &&
          getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)
        )
          return;
        const freshEl = blockRefs.current[targetId];
        if (freshEl) placeCaret(freshEl, targetPos);
      });
      setTimeout(() => {
        const scrollEl = editorScrollRef.current;
        if (!scrollEl) return;
        const blockEl = blockRefs.current[targetId];
        if (!blockEl) return;
        const blockRect = blockEl.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        if (blockRect.bottom === 0) return;
        const threshold = scrollRect.top + scrollRect.height * 0.8;
        if (blockRect.bottom > threshold) {
          const overshoot = blockRect.bottom - threshold;
          scrollEl.scrollBy({ top: overshoot + 40, behavior: "smooth" });
        }
      }, 50);
    }
  });
}
