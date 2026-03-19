import { useState, useRef, startTransition } from "react";

export function useHistory(noteData, setNoteData, syncGeneration, activeNoteRef) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const historyTimer = useRef(null);
  const isUndoRedo = useRef(false);
  const textFlushTimer = useRef(null);
  const hasPendingFlush = useRef(false);
  const textOnlyEdit = useRef(false);
  const textOnlyEditForSidebar = useRef(false);
  const textOnlyEditForEditor = useRef(false);
  const editedNoteHint = useRef(null);

  const noteDataRef = useRef(noteData);
  // Only sync ref from state when no pending flush (avoid overwriting batched updates)
  if (!hasPendingFlush.current) noteDataRef.current = noteData;

  const cloneNote = (n) => {
    if (!n?.content?.blocks) return { ...n };
    return {
      ...n,
      content: {
        ...n.content,
        blocks: n.content.blocks.map((b) =>
          b.rows ? { ...b, rows: b.rows.map((r) => [...r]) } : { ...b },
        ),
      },
    };
  };

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = () => {
    const noteId = activeNoteRef.current;
    if (!noteId || !noteDataRef.current[noteId]) return;
    const noteToClone = noteDataRef.current[noteId];
    queueMicrotask(() => {
      const t0 = performance.now();
      const snapshot = cloneNote(noteToClone);
      const dt = performance.now() - t0;
      if (dt > 1) console.warn(`[perf] pushHistory cloneNote: ${dt.toFixed(1)}ms`);
      undoStack.current.push({ noteId, snapshot });
      if (undoStack.current.length > 50) undoStack.current.shift();
      redoStack.current = [];
      setCanUndo(true);
      setCanRedo(false);
    });
  };

  const popHistory = () => {
    if (undoStack.current.length > 0) {
      undoStack.current.pop();
      setCanUndo(undoStack.current.length > 0);
    }
  };

  const commitNoteData = (updater) => {
    if (!isUndoRedo.current) pushHistory();
    textOnlyEdit.current = false;
    textOnlyEditForSidebar.current = false;
    textOnlyEditForEditor.current = false;
    // Cancel any pending text flush to prevent it from overwriting this structural change
    if (textFlushTimer.current) {
      clearTimeout(textFlushTimer.current);
      textFlushTimer.current = null;
      hasPendingFlush.current = false;
    }
    // Apply updater to ref so it reflects both pending text changes AND this structural change
    noteDataRef.current = updater(noteDataRef.current);
    setNoteData(noteDataRef.current);
  };

  const commitTextChange = (updater) => {
    // Flush any pending text change first to avoid split-pane overwrites (Bug 7)
    if (hasPendingFlush.current && textFlushTimer.current) {
      clearTimeout(textFlushTimer.current);
      textFlushTimer.current = null;
      hasPendingFlush.current = false;
      setNoteData(noteDataRef.current);
    }

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

    // Apply to ref immediately (for reads by other handlers)
    noteDataRef.current = updater(noteDataRef.current);
    hasPendingFlush.current = true;
    textOnlyEdit.current = true;
    textOnlyEditForSidebar.current = true;
    textOnlyEditForEditor.current = true;
    editedNoteHint.current = activeNoteRef.current;

    // Batch: debounce setNoteData so React only re-renders when typing pauses.
    // The contentEditable DOM is already correct; noteDataRef has the data for handlers.
    // Flushing per-frame caused ~130ms React reconciliation + ~1.2s browser layout/paint.
    if (textFlushTimer.current) clearTimeout(textFlushTimer.current);
    textFlushTimer.current = setTimeout(() => {
      textFlushTimer.current = null;
      hasPendingFlush.current = false;
      startTransition(() => {
        setNoteData(noteDataRef.current);
      });
    }, 300);
  };

  const undo = () => {
    if (undoStack.current.length === 0) return;
    const entry = undoStack.current.pop();
    const currentNote = noteDataRef.current[entry.noteId];
    // Save current state to redo stack (may be null if note was deleted)
    redoStack.current.push({
      noteId: entry.noteId,
      snapshot: currentNote ? cloneNote(currentNote) : null,
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
    if (!entry.snapshot) {
      // The note was deleted when undo saved this entry — nothing to redo to
      setCanRedo(redoStack.current.length > 0);
      return;
    }
    const currentNote = noteDataRef.current[entry.noteId];
    // Save current state to undo stack (may be null if note was deleted)
    undoStack.current.push({
      noteId: entry.noteId,
      snapshot: currentNote ? cloneNote(currentNote) : null,
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
    textOnlyEdit,
    textOnlyEditForSidebar,
    textOnlyEditForEditor,
    editedNoteHint,
  };
}
