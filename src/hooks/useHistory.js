import { useState, useRef } from "react";

export function useHistory(noteData, setNoteData) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const historyTimer = useRef(null);
  const isUndoRedo = useRef(false);
  const syncGeneration = useRef(0);
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = () => {
    undoStack.current.push(structuredClone(noteDataRef.current));
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
      historyTimer.current = setTimeout(() => { historyTimer.current = null; }, 500);
    }
    setNoteData(updater);
  };

  const undo = () => {
    if (undoStack.current.length === 0) return;
    redoStack.current.push(structuredClone(noteDataRef.current));
    isUndoRedo.current = true;
    syncGeneration.current++;
    setNoteData(undoStack.current.pop());
    isUndoRedo.current = false;
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  };

  const redo = () => {
    if (redoStack.current.length === 0) return;
    undoStack.current.push(structuredClone(noteDataRef.current));
    isUndoRedo.current = true;
    syncGeneration.current++;
    setNoteData(redoStack.current.pop());
    isUndoRedo.current = false;
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  };

  return {
    canUndo, canRedo, undo, redo,
    commitNoteData, commitTextChange,
    pushHistory, popHistory,
    syncGeneration, isUndoRedo, noteDataRef,
  };
}
