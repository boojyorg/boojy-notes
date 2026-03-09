import { useState, useRef } from "react";

export function useHistory(noteData, setNoteData, syncGeneration, activeNoteRef) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const historyTimer = useRef(null);
  const isUndoRedo = useRef(false);
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = () => {
    const noteId = activeNoteRef.current;
    if (!noteId || !noteDataRef.current[noteId]) return;
    undoStack.current.push({
      noteId,
      snapshot: structuredClone(noteDataRef.current[noteId]),
    });
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const popHistory = () => {
    if (undoStack.current.length > 0) {
      undoStack.current.pop();
      setCanUndo(undoStack.current.length > 0);
    }
  };

  const commitNoteData = (updater) => {
    if (!isUndoRedo.current) pushHistory();
    setNoteData(updater);
  };

  const commitTextChange = (updater) => {
    if (!isUndoRedo.current) {
      if (!historyTimer.current) {
        pushHistory();
      } else {
        clearTimeout(historyTimer.current);
      }
      historyTimer.current = setTimeout(() => {
        historyTimer.current = null;
      }, 500);
    }
    setNoteData(updater);
  };

  const undo = () => {
    if (undoStack.current.length === 0) return;
    const entry = undoStack.current.pop();
    // Save current state of that note to redo stack
    redoStack.current.push({
      noteId: entry.noteId,
      snapshot: structuredClone(noteDataRef.current[entry.noteId]),
    });
    isUndoRedo.current = true;
    syncGeneration.current++;
    setNoteData((prev) => ({ ...prev, [entry.noteId]: entry.snapshot }));
    isUndoRedo.current = false;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    if (redoStack.current.length === 0) return;
    const entry = redoStack.current.pop();
    // Save current state of that note to undo stack
    undoStack.current.push({
      noteId: entry.noteId,
      snapshot: structuredClone(noteDataRef.current[entry.noteId]),
    });
    isUndoRedo.current = true;
    syncGeneration.current++;
    setNoteData((prev) => ({ ...prev, [entry.noteId]: entry.snapshot }));
    isUndoRedo.current = false;
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  };

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    commitNoteData,
    commitTextChange,
    pushHistory,
    popHistory,
    isUndoRedo,
    noteDataRef,
  };
}
