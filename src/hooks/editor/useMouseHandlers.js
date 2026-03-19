import { useCallback } from "react";
import { findNearestBlock, isEditableBlock, placeCaret } from "../../utils/domHelpers";

export function useMouseHandlers({ noteDataRef, activeNoteRef, blockRefs, mouseIsDown, getBlock }) {
  const handleEditorMouseUp = useCallback(() => {
    const currentNote = activeNoteRef.current;
    mouseIsDown.current = false;
    requestAnimationFrame(() => {
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
