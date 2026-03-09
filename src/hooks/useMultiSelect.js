import { useState, useCallback, useRef } from "react";
import { flattenVisibleNotes } from "../utils/sidebarTree";

export function useMultiSelect({ filteredTree, fNotes, expanded, openNote }) {
  const [selectedNotes, setSelectedNotes] = useState(new Set());
  const lastClickedNote = useRef(null);

  const clearSelection = useCallback(() => {
    setSelectedNotes(new Set());
    lastClickedNote.current = null;
  }, []);

  const removeFromSelection = useCallback((ids) => {
    setSelectedNotes((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const handleNoteClick = useCallback(
    (noteId, event) => {
      const isMeta = event.metaKey || event.ctrlKey;
      const isShift = event.shiftKey;

      if (isMeta) {
        // Toggle note in/out of selection
        setSelectedNotes((prev) => {
          const next = new Set(prev);
          if (next.has(noteId)) {
            next.delete(noteId);
          } else {
            next.add(noteId);
          }
          return next;
        });
        lastClickedNote.current = noteId;
      } else if (isShift && lastClickedNote.current) {
        // Select range from anchor to target
        const visible = flattenVisibleNotes(filteredTree, expanded, fNotes);
        const anchorIdx = visible.indexOf(lastClickedNote.current);
        const targetIdx = visible.indexOf(noteId);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          const range = new Set(visible.slice(start, end + 1));
          setSelectedNotes(range);
        }
      } else {
        // Plain click: clear selection, open note
        clearSelection();
        openNote(noteId);
      }
    },
    [filteredTree, fNotes, expanded, openNote, clearSelection],
  );

  return {
    selectedNotes,
    handleNoteClick,
    clearSelection,
    removeFromSelection,
  };
}
