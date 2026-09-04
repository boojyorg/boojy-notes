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
  // Notes edited since the last quit/blur disk flush. This survives multi-note
  // edit bursts so the quit flush can write every note whose edits may not have
  // reached React state.
  const unflushedNotes = useRef(new Set());

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
      if (import.meta.env.DEV && dt > 1)
        console.warn(`[perf] pushHistory cloneNote: ${dt.toFixed(1)}ms`);
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

  const commitNoteData = (updater) => applyCommit(updater, true);

  // Take a change of record that came from persistence rather than from the
  // user: the filename the write actually produced. Same publication path as
  // a structural commit (pending text is already in the ref and goes out with
  // it), but no history entry, so Cmd+Z after a rename undoes the rename
  // itself instead of bouncing between the requested name and the one the
  // file got. The note becomes dirty like any change and is written once
  // more under its own name, which is then already its path.
  const adoptNoteData = (updater) => applyCommit(updater, false);

  const applyCommit = (updater, recordHistory) => {
    if (recordHistory && !isUndoRedo.current) pushHistory();
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
    const before = noteDataRef.current;
    noteDataRef.current = updater(before);
    // The quit/blur net records the notes this commit actually changed — not
    // the active note, which a commit about something else (discarding the
    // launch draft, renaming another row) would otherwise stamp without it
    // ever becoming dirty, so the quit flush would rewrite it untouched.
    if (noteDataRef.current !== before) {
      for (const id of Object.keys(noteDataRef.current)) {
        const note = noteDataRef.current[id];
        if (note !== before[id] && !note?._draft) unflushedNotes.current.add(id);
      }
    }
    setNoteData(noteDataRef.current);
  };

  const commitTextChange = (updater) => {
    // Flush any pending debounced text change first so it cannot overwrite this one
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
    if (activeNoteRef.current) unflushedNotes.current.add(activeNoteRef.current);

    // Batch: debounce setNoteData so React only re-renders when typing pauses.
    // The contentEditable DOM is already correct; noteDataRef has the data for handlers.
    // Flushing per-frame caused ~130ms React reconciliation + ~1.2s browser layout/paint.
    if (textFlushTimer.current) clearTimeout(textFlushTimer.current);
    textFlushTimer.current = setTimeout(() => {
      textFlushTimer.current = null;
      hasPendingFlush.current = false;
      textOnlyEdit.current = false;
      textOnlyEditForSidebar.current = false;
      textOnlyEditForEditor.current = false;
      startTransition(() => {
        setNoteData(noteDataRef.current);
      });
    }, 300);
  };

  // Restore a snapshot as the note's current state, for undo and redo.
  //
  // Two things here are load-bearing. First, a text commit may still be
  // pending in `textFlushTimer`; left alone it would fire after the restore and
  // write the pre-undo text back over it, and while it is pending the
  // "text-only edit" flags tell the editor to skip its next render — which
  // would skip painting the restored text. Cancel the commit and clear the
  // flags before restoring. Second, `noteDataRef` only syncs from state when no
  // flush is pending, so write the restored data to the ref directly (as
  // commitNoteData does) rather than leaving it stale until the next render.
  const restoreSnapshot = (noteId, snapshot) => {
    if (textFlushTimer.current) {
      clearTimeout(textFlushTimer.current);
      textFlushTimer.current = null;
    }
    hasPendingFlush.current = false;
    textOnlyEdit.current = false;
    textOnlyEditForSidebar.current = false;
    textOnlyEditForEditor.current = false;
    // Typing that resumes after an undo starts a fresh history entry.
    if (historyTimer.current) {
      clearTimeout(historyTimer.current);
      historyTimer.current = null;
    }
    isUndoRedo.current = true;
    syncGeneration.current++;
    noteDataRef.current = { ...noteDataRef.current, [noteId]: snapshot };
    setNoteData(noteDataRef.current);
    isUndoRedo.current = false;
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
    restoreSnapshot(entry.noteId, entry.snapshot);
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
    restoreSnapshot(entry.noteId, entry.snapshot);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  };

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    commitNoteData,
    adoptNoteData,
    commitTextChange,
    pushHistory,
    popHistory,
    isUndoRedo,
    noteDataRef,
    hasPendingFlush,
    textOnlyEdit,
    textOnlyEditForSidebar,
    textOnlyEditForEditor,
    unflushedNotes,
  };
}
