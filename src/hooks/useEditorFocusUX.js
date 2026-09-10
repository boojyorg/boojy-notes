import { useEffect, useLayoutEffect } from "react";
import {
  caretOutOfLinkEnd,
  caretOutOfLinkStart,
  cleanOrphanNodes,
  getBlockFromNode,
  ownedField,
  placeCaret,
} from "../utils/domHelpers";

/** How long a keyboard selection must rest before the toolbar shows over it. */
export const TOOLBAR_REST_MS = 300;

/**
 * Editor focus/caret UX. Three effects, no return value:
 *   1. selectionchange / mouseup → position the floating formatting toolbar over a
 *      finished selection (mouse-up for a pointer selection, a short rest for a
 *      keyboard one); clears it at once when the selection collapses or leaves the editor.
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
  mouseIsDown,
}) {
  // Selection change → floating toolbar, once the selection is finished. A
  // pointer selection shows on mouse-up: measured on every change, the toolbar
  // repositioned under each movement of the drag and slid about under the
  // pointer (2026-09-10). A keyboard selection (Shift+Arrow, Cmd+A) has no
  // "up", so it shows after TOOLBAR_REST_MS with no further change. Hiding is
  // immediate either way: a collapsed selection, or one outside the editor,
  // clears it at once so it never lingers over typing.
  useEffect(() => {
    const measure = () => {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return null;
      if (!editorRef.current) return null;
      const range = sel.getRangeAt(0);
      const startBlock =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer;
      if (!editorRef.current.contains(startBlock)) return null;
      const rect = range.getBoundingClientRect();
      const editorRect = editorRef.current.getBoundingClientRect();
      let el = startBlock;
      while (el && el !== editorRef.current) {
        if (el.dataset?.blockId) break;
        el = el.parentElement;
      }
      if (!el || el === editorRef.current) return null;
      return {
        top: rect.top - editorRect.top - 44,
        left: rect.left - editorRect.left + rect.width / 2,
      };
    };
    let timer = null;
    // Whether the toolbar is on screen. Once shown it holds its position until
    // it hides: it is a control strip the pointer is heading for, not a label
    // of the selection. Re-measured on every change, a pressed Bold (wider
    // glyphs) or Highlight shifted the selection's centre and the strip slid a
    // few pixels under the pointer (2026-09-10); a selection extended by
    // keyboard stays under the strip placed over where it began.
    let shown = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const hide = () => {
      cancel();
      shown = false;
      setToolbarState(null);
    };
    const show = () => {
      cancel();
      const next = measure();
      shown = !!next;
      setToolbarState(next);
    };
    const onSelChange = () => {
      // Nothing to show (collapsed, outside the editor): hide at once.
      if (!measure()) {
        hide();
        return;
      }
      if (shown) return;
      cancel();
      // The button is down: the selection is still being made. Mouse-up shows it.
      if (mouseIsDown?.current) return;
      timer = setTimeout(show, TOOLBAR_REST_MS);
    };
    const onMouseUp = (e) => {
      // A drag that ends outside the editor never reaches the editor's own
      // mouse-up handler, so the flag is cleared here as well.
      if (mouseIsDown) mouseIsDown.current = false;
      // A click on the toolbar itself is a format being applied; applyFormat
      // decides what the toolbar does next, not this listener.
      if (e.target?.closest?.('[role="toolbar"]')) return;
      if (shown) return;
      show();
    };
    document.addEventListener("selectionchange", onSelChange);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      cancel();
      document.removeEventListener("selectionchange", onSelChange);
      document.removeEventListener("mouseup", onMouseUp);
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
