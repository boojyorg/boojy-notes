import { useState, useCallback, useRef } from "react";
import { treeNoteLabel, visibleTreeRows } from "../utils/treeNav";

export function useMultiSelect({ folderTree, sortedRootNotes, expanded, noteDataRef, openNote }) {
  const [selectedNotes, setSelectedNotes] = useState(new Set());
  const lastClickedNote = useRef(null);

  const clearSelection = useCallback(() => {
    setSelectedNotes(new Set());
    lastClickedNote.current = null;
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
        // Select range from anchor to target, over the rows the sidebar shows.
        const visible = visibleTreeRows(folderTree, sortedRootNotes, expanded, (id) =>
          treeNoteLabel(noteDataRef.current[id]),
        )
          .filter((row) => row.kind === "note")
          .map((row) => row.id);
        const anchorIdx = visible.indexOf(lastClickedNote.current);
        const targetIdx = visible.indexOf(noteId);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const start = Math.min(anchorIdx, targetIdx);
          const end = Math.max(anchorIdx, targetIdx);
          const range = new Set(visible.slice(start, end + 1));
          setSelectedNotes(range);
        }
      } else {
        // Plain click: clear selection, open note, and anchor a later
        // Shift-click's range here (Finder's rule). Clearing the anchor too
        // left Shift-click after a plain click doing nothing but open.
        clearSelection();
        lastClickedNote.current = noteId;
        openNote(noteId);
      }
    },
    [folderTree, sortedRootNotes, expanded, noteDataRef, openNote, clearSelection],
  );

  return {
    selectedNotes,
    handleNoteClick,
    clearSelection,
  };
}
