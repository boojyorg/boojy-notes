import { useCallback } from "react";
import { findNearestBlock, isEditableBlock, placeCaret } from "../../utils/domHelpers";

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

  const handleEditorMouseUp = useCallback(() => {
    const currentNote = activeNoteRef.current;
    mouseIsDown.current = false;
    requestAnimationFrame(() => {
      if (focusLeftEditor()) return;
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.getRangeAt(0).collapsed) return;
      if (sel.rangeCount) {
        const info = getBlock(sel.anchorNode);
        if (info) return;
      }
      const blocks = noteDataRef.current[currentNote]?.content?.blocks;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs
  }, []);

  const handleEditorMouseDown = useCallback(() => {
    mouseIsDown.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mouseIsDown is a stable ref
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs
  }, []);

  return { handleEditorMouseUp, handleEditorMouseDown, handleEditorFocus };
}
