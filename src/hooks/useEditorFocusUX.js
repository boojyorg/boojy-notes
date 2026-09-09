import { useEffect, useLayoutEffect } from "react";
import {
  caretOutOfLinkEnd,
  caretOutOfLinkStart,
  cleanOrphanNodes,
  getBlockFromNode,
  ownedField,
  placeCaret,
} from "../utils/domHelpers";

/**
 * Editor focus/caret UX. Three effects, no return value:
 *   1. selectionchange → position the floating formatting toolbar over the selection
 *      (rAF-debounced; clears the toolbar when the selection leaves the editor).
 *   2. beforeinput → a caret Chromium left at the end of a link's text (End, a click,
 *      ArrowRight) is moved onto the anchor after the link before the text lands, so
 *      typing continues as prose rather than rewriting the link's alias; one left at the
 *      start of a link's text (Home on a block that opens with a link) is moved onto the
 *      anchor before it, the same way. Only insertions outside an IME composition; caret
 *      movement and deletion are never touched.
 *   3. a layout effect that, when a focus target is queued (focusBlockId/focusCursorPos),
 *      places the caret in that block, re-asserts it after the next frame if the DOM
 *      moved, and scrolls the block into view if it landed near the bottom. A block
 *      with no text root (a code block, callout or table) has its own first field
 *      focused instead (`ownedField`), so the block the slash menu made owns the
 *      next keystroke (review 2026-09-07, §1.5).
 *
 * Extracted from BoojyNotes. The layout effect intentionally has no dependency
 * array (runs every render) — preserved verbatim.
 */
export function useEditorFocusUX({
  activeNote,
  editorRef,
  editorScrollRef,
  blockRefs,
  focusBlockId,
  focusCursorPos,
  noteDataRef,
  setToolbarState,
}) {
  // Selection change → floating toolbar
  useEffect(() => {
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
  }, [activeNote]);

  // Typing at the end of a link: move the caret outside first. A native
  // listener, because React's onBeforeInput is synthesised from other events
  // and can fire after the insertion has already happened.
  useEffect(() => {
    const onBeforeInput = (e) => {
      if (e.isComposing || !e.inputType?.startsWith("insert")) return;
      caretOutOfLinkEnd(editorRef.current) || caretOutOfLinkStart(editorRef.current);
    };
    document.addEventListener("beforeinput", onBeforeInput);
    return () => document.removeEventListener("beforeinput", onBeforeInput);
  }, [editorRef]);

  // Focus block layout effect
  useLayoutEffect(() => {
    if (focusBlockId.current) {
      cleanOrphanNodes(editorRef.current);
      const targetId = focusBlockId.current;
      const targetPos = focusCursorPos.current ?? 0;
      focusBlockId.current = null;
      focusCursorPos.current = null;
      // A text block takes the caret at the offset; a block whose fields are
      // its own (no text root registered) takes focus in its first field.
      const focusTarget = () => {
        const el = blockRefs.current[targetId];
        if (el) placeCaret(el, targetPos);
        else ownedField(editorRef.current, targetId)?.focus();
      };
      focusTarget();
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        const blocks = noteDataRef.current[activeNote]?.content?.blocks;
        if (
          sel.rangeCount &&
          getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)
        )
          return;
        focusTarget();
      });
      setTimeout(() => {
        const scrollEl = editorScrollRef.current;
        if (!scrollEl) return;
        const blockEl = blockRefs.current[targetId] ?? ownedField(editorRef.current, targetId);
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
