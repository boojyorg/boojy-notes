import { useCallback } from "react";
import {
  caretIntoTextRoot,
  findNearestBlock,
  isEditableBlock,
  placeCaret,
} from "../../utils/domHelpers";

export function useMouseHandlers({
  noteDataRef,
  activeNoteRef,
  blockRefs,
  editorRef,
  mouseIsDown,
  getBlock,
}) {
  // The rescues below run a frame after the click or focus, and place the
  // caret in the nearest block when the selection landed outside any. By
  // then the click may have opened something that took focus (a tag click
  // opens the search palette), and placing a caret would pull focus straight
  // back into the editor: the palette's field looked focused for one frame,
  // then Escape and the arrows went to the editor (review 2026-09-06, H4).
  // Focus that has moved to another control is never taken back.
  const focusLeftEditor = () => {
    const active = document.activeElement;
    const editor = editorRef?.current;
    return !!active && active !== document.body && !!editor && !editor.contains(active);
  };

  // A triple-click selects the block the pointer is on, by the app's own hand.
  // Chromium's paragraph granularity ends the selection at the start of the
  // *next* block, and when that block is a list row it lands on the row's
  // non-editable, user-select:none marker (the number, the checkbox), which
  // Chromium's user-select adjustment answers by collapsing the whole
  // selection: the third click of a numbered item or a task selected nothing,
  // and a bullet's only when a number or a task followed it (2026-09-20).
  // Selecting the text root's own contents gives one answer for every block
  // and stops the selection at the row's end instead of the next block's start.
  const selectClickedBlock = (e) => {
    if (e?.detail !== 3 || !e.target) return false;
    const info = getBlock(e.target);
    const root = info?.el;
    if (!root?.isConnected || !root.contains(e.target)) return false;
    const range = document.createRange();
    range.selectNodeContents(root);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  };

  const handleEditorMouseUp = useCallback((e) => {
    const currentNote = activeNoteRef.current;
    mouseIsDown.current = false;
    if (selectClickedBlock(e)) return;
    requestAnimationFrame(() => {
      if (focusLeftEditor()) return;
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.getRangeAt(0).collapsed) return;
      const blocks = noteDataRef.current[currentNote]?.content?.blocks;
      if (sel.rangeCount) {
        const info = getBlock(sel.anchorNode);
        if (info) {
          // In a block's row is not in its text: a click by a list marker
          // leaves the caret beside the dot, where typing reaches no file.
          if (blocks) caretIntoTextRoot(editorRef.current, blocks, blockRefs.current);
          return;
        }
      }
      if (!blocks || blocks.length === 0) return;
      if (sel.rangeCount) {
        const target = findNearestBlock(sel, blocks, blockRefs.current);
        if (target) {
          const el = blockRefs.current[target.blockId];
          if (el?.isConnected) {
            placeCaret(el, (blocks[target.blockIndex].text || "").length);
            return;
          }
        }
      }
      const first = blocks.find((b) => isEditableBlock(b));
      if (!first) return;
      const el = blockRefs.current[first.id];
      if (el?.isConnected) placeCaret(el, 0);
    });
    // Deps deliberately not exhaustive: all deps are stable refs
  }, []);

  const handleEditorMouseDown = useCallback(() => {
    mouseIsDown.current = true;
    // Deps deliberately not exhaustive: mouseIsDown is a stable ref
  }, []);

  const handleEditorFocus = useCallback(() => {
    const currentNote = activeNoteRef.current;
    if (mouseIsDown.current) return;
    requestAnimationFrame(() => {
      if (focusLeftEditor()) return;
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const info = getBlock(sel.anchorNode);
        if (info) return;
      }
      const blocks = noteDataRef.current[currentNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      const first = blocks.find((b) => isEditableBlock(b));
      if (!first) return;
      const el = blockRefs.current[first.id];
      if (el?.isConnected) placeCaret(el, 0);
    });
    // Deps deliberately not exhaustive: all deps are stable refs
  }, []);

  return { handleEditorMouseUp, handleEditorMouseDown, handleEditorFocus };
}
