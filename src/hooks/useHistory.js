import { useState, useRef, useCallback, startTransition } from "react";

import { trace } from "../utils/trace";
import { reconcileListEdit } from "../utils/listStructure";

export function useHistory(noteData, setNoteData, syncGeneration, activeNoteRef) {
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const historyTimer = useRef(null);
  // The note the open typing group belongs to. A group is one note's burst:
  // typing in another note, or leaving and coming back, starts a fresh one.
  const historyGroupNote = useRef(null);
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

  // A structural change supersedes the text commit pending for the active
  // note: the ref already holds that text, the change is applied on top of
  // it, and both go out together. Left to fire, the timer would publish the
  // ref as it was and revert the change (the sidebar move, the block drop and
  // the vault rebuild all did exactly that while they used the raw setter).
  const cancelPendingText = () => {
    if (textFlushTimer.current) {
      clearTimeout(textFlushTimer.current);
      textFlushTimer.current = null;
    }
    hasPendingFlush.current = false;
    textOnlyEdit.current = false;
    textOnlyEditForSidebar.current = false;
    textOnlyEditForEditor.current = false;
  };

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

  // Undo and redo act on the note the user is looking at and on no other, so
  // what the buttons report is what the open note has. The stacks stay shared
  // and note-tagged: one 50-entry budget for the session, not a cache per
  // note, and an entry of another live note is never spent to reach one of
  // this note's.
  const hasEntryFor = (stack, noteId) => !!noteId && stack.some((e) => e.noteId === noteId);
  const syncAvailability = () => {
    const noteId = activeNoteRef.current;
    setCanUndo(hasEntryFor(undoStack.current, noteId));
    setCanRedo(hasEntryFor(redoStack.current, noteId));
  };

  // Entries of a note that no longer exists are unreachable (only the active
  // note's are ever taken) and would otherwise hold part of the budget.
  // History never brings a note back; the OS Trash is the recovery surface.
  const dropDeadEntries = () => {
    const live = (e) => !!noteDataRef.current[e.noteId];
    undoStack.current = undoStack.current.filter(live);
    redoStack.current = redoStack.current.filter(live);
  };

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
      // The commit has applied by now. If it left the open note's object
      // untouched — discarding the launch draft on the way into a note,
      // making or deleting another note — there is nothing here to take
      // back, and an entry that restores the note to itself would light the
      // Undo button on a note nobody has edited.
      if (noteDataRef.current[noteId] === noteToClone) return;
      undoStack.current.push({ noteId, snapshot });
      dropDeadEntries();
      if (undoStack.current.length > 50) undoStack.current.shift();
      // A new edit ends this note's redo lineage and no one else's: an edit
      // here says nothing about an edit undone in another note.
      redoStack.current = redoStack.current.filter((e) => e.noteId !== noteId);
      syncAvailability();
    });
  };

  // The active note changed. Two things follow, and nothing else: the typing
  // group the previous note owned is closed, so the first keystroke back in
  // it starts its own entry rather than joining a burst it was never part of;
  // and availability is re-read for the note now open. Navigation is not an
  // edit and leaves the stacks alone. Called from an effect in BoojyNotes;
  // `activeNoteRef` is already the new id by then.
  const onActiveNoteChanged = useCallback(() => {
    if (historyTimer.current) {
      clearTimeout(historyTimer.current);
      historyTimer.current = null;
    }
    historyGroupNote.current = null;
    syncAvailability();
  }, []);

  const commitNoteData = (updater) => applyCommit(updater, true);

  // Take a change of record that came from persistence rather than from the
  // user: the filename the write actually produced. Same publication path as
  // a structural commit (pending text is already in the ref and goes out with
  // it), but no history entry, so Cmd+Z after a rename undoes the rename
  // itself instead of bouncing between the requested name and the one the
  // file got. The note becomes dirty like any change and is written once
  // more under its own name, which is then already its path.
  const adoptNoteData = (updater) => applyCommit(updater, false);

  // A folder rename or move on disk changes where notes live without any of
  // them being edited. The `folder` field follows in the live data; undo
  // never restores a folder (restoreSnapshot keeps the live one), so the
  // snapshots need no rewriting. Not an edit: no history entry, nothing joins
  // the quit-flush net, and the caller (useFileSystem) tells its dirty
  // detection to ignore the update. Returns whether anything changed, so the
  // caller knows whether a render (and its external-update bookkeeping) is
  // coming.
  const remapNoteFolders = (remap) => {
    const move = (n) => {
      if (!n?.folder) return n;
      const folder = remap(n.folder);
      return folder === n.folder ? n : { ...n, folder };
    };
    const before = noteDataRef.current;
    let changed = false;
    const next = {};
    for (const [id, n] of Object.entries(before)) {
      next[id] = move(n);
      if (next[id] !== n) changed = true;
    }
    if (!changed) return false;
    cancelPendingText();
    noteDataRef.current = next;
    setNoteData(next);
    return true;
  };

  // Take the vault as the disk now holds it: the initial load, a vault
  // switch, the rebuild after an outside delete. `next` is the whole id→note
  // map that replaces the current one; the caller has already folded in any
  // note that exists only in memory (a draft, edits not yet written), taken
  // from `noteDataRef` so pending text travels with it. The ref and state
  // take it together, and a text commit still pending is cancelled: its
  // text is either in `next` or deliberately left behind, and letting it
  // fire would republish the map this call replaces. History and the
  // quit-flush net keep only the notes that still exist; an undo entry for a
  // note that is gone would otherwise write it into whatever vault is open.
  const replaceNoteData = (next) => {
    cancelPendingText();
    const keep = (e) => e.noteId in next;
    undoStack.current = undoStack.current.filter(keep);
    redoStack.current = redoStack.current.filter(keep);
    syncAvailability();
    for (const id of unflushedNotes.current) if (!(id in next)) unflushedNotes.current.delete(id);
    trace("replaceNoteData", Object.keys(next).length);
    noteDataRef.current = next;
    setNoteData(next);
  };

  // Take a note as the disk now holds it: an edit made in another program,
  // or the conflict copy the app has just written. This is the one path for a
  // change of record that did not come from the user here. The history ref
  // takes it at once, so a text commit pending for another note republishes
  // the disk version instead of the stale one the ref would otherwise have
  // carried (which marked the note dirty and wrote the old bytes back over
  // the outside edit). Pending text for the note itself is superseded: the
  // caller has either established there is none, or has moved it into a
  // conflict copy. Its undo entries describe a lineage the disk no longer
  // holds and are dropped. Nothing becomes dirty and nothing joins the
  // quit-flush net; the note is already on disk.
  const applyExternalNote = (note) => {
    const id = note.id;
    if (id === activeNoteRef.current && textFlushTimer.current) cancelPendingText();
    undoStack.current = undoStack.current.filter((e) => e.noteId !== id);
    redoStack.current = redoStack.current.filter((e) => e.noteId !== id);
    syncAvailability();
    unflushedNotes.current.delete(id);
    trace("applyExternalNote", id);
    noteDataRef.current = { ...noteDataRef.current, [id]: note };
    setNoteData((prev) => ({ ...prev, [id]: note }));
  };

  const applyCommit = (updater, recordHistory) => {
    if (recordHistory && !isUndoRedo.current) pushHistory();
    cancelPendingText();
    // Apply updater to ref so it reflects both pending text changes AND this structural change
    const before = noteDataRef.current;
    noteDataRef.current = updater(before);
    if (recordHistory) {
      for (const [id, note] of Object.entries(noteDataRef.current)) {
        const previous = before[id]?.content?.blocks;
        if (!previous || !note?.content?.blocks) continue;
        const blocks = reconcileListEdit(previous, note.content.blocks);
        if (blocks !== note.content.blocks) {
          noteDataRef.current = {
            ...noteDataRef.current,
            [id]: { ...note, content: { ...note.content, blocks } },
          };
        }
      }
    }
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

  // A draft is a note that has never held text. It ends at the keystroke
  // that first gives it a title or a character of body, and it ends in the
  // ref, so that everything reading the ref inside the commit window sees a
  // note: the switch that discards a draft, the quit flush that skips one,
  // the rebuild after an outside delete. Decided from React state instead,
  // 300 ms later, the draft was discarded or skipped with its text
  // (review 2026-09-07, §2.6). A draft is always the active note.
  // Text is text wherever it is typed: a paragraph, a code block, a callout's
  // title or body, a table cell.
  const hasText = (n) =>
    (n?.title || "").trim() !== "" ||
    !!n?.content?.blocks?.some(
      (b) =>
        (b.text || "").trim() !== "" ||
        (b.title || "").trim() !== "" ||
        !!b.rows?.some((row) => row.some((cell) => (cell || "").trim() !== "")),
    );
  const endDraftIfText = () => {
    const id = activeNoteRef.current;
    const n = noteDataRef.current[id];
    if (!n?._draft || !hasText(n)) return;
    const { _draft, ...note } = n;
    noteDataRef.current = { ...noteDataRef.current, [id]: note };
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
      // A group belongs to one note. Typing in another note inside the 500ms
      // window opens that note's own group at once; without the check the
      // second note's first burst joined the first note's entry and left the
      // second with nothing to undo.
      const groupNote = activeNoteRef.current;
      if (!historyTimer.current || historyGroupNote.current !== groupNote) {
        pushHistory();
      } else {
        clearTimeout(historyTimer.current);
      }
      historyGroupNote.current = groupNote;
      historyTimer.current = setTimeout(() => {
        historyTimer.current = null;
        historyGroupNote.current = null;
      }, 500);
    }

    // Apply to ref immediately (for reads by other handlers)
    noteDataRef.current = updater(noteDataRef.current);
    endDraftIfText();
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
      trace("textcommit → setNoteData");
      startTransition(() => {
        setNoteData(noteDataRef.current);
      });
    }, 300);
  };

  // Restore a snapshot as the note's current state, for undo and redo.
  //
  // History is the editor's: a snapshot restores what the editor shows, the
  // title and the blocks, and never where the file lives. The live `folder`
  // is kept, so undoing the typing that followed a move (a drag, Move to, a
  // folder rename) cannot carry the old folder back into state and have the
  // next write relocate the file. The live draft state is kept for the same
  // reason: a note that has been written is a file, and undoing its first
  // keystroke must not make it a draft again, which the next switch would
  // discard while the file stays on disk. The caller has established the
  // note still exists: a snapshot never conjures a note that was deleted or
  // belongs to a vault no longer open.
  //
  // Two more things here are load-bearing. A text commit may still be
  // pending in `textFlushTimer`; left alone it would fire after the restore
  // and write the pre-undo text back over it, and while it is pending the
  // "text-only edit" flags tell the editor to skip its next render, which
  // would skip painting the restored text. And `noteDataRef` only syncs from
  // state when no flush is pending, so the restored data goes to the ref
  // directly, as every commit does.
  const restoreSnapshot = (noteId, snapshot) => {
    cancelPendingText();
    // Typing that resumes after an undo starts a fresh history entry.
    if (historyTimer.current) {
      clearTimeout(historyTimer.current);
      historyTimer.current = null;
    }
    historyGroupNote.current = null;
    isUndoRedo.current = true;
    syncGeneration.current++;
    trace("restoreSnapshot (undo/redo)", noteId);
    const live = noteDataRef.current[noteId];
    const { _draft, ...restored } = snapshot;
    if (live._draft) restored._draft = true;
    noteDataRef.current = {
      ...noteDataRef.current,
      [noteId]: { ...restored, folder: live.folder ?? null },
    };
    setNoteData(noteDataRef.current);
    isUndoRedo.current = false;
  };

  // The newest entry for one note, lifted out of the shared stack. Scanning
  // backwards rather than popping is what leaves every other live note's
  // history where it is; entries in front of it are not spent reaching it.
  const takeNewestFor = (stack, noteId) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].noteId === noteId) return stack.splice(i, 1)[0];
    }
    return null;
  };

  // Undo and redo read the active note at the moment they are invoked, never
  // a rendered flag: the button may have been painted a beat before the note
  // changed. A note that is gone has no history, so nothing is restored.
  const step = (from, to) => {
    const noteId = activeNoteRef.current;
    if (noteId && noteDataRef.current[noteId]) {
      const entry = takeNewestFor(from, noteId);
      if (entry) {
        to.push({ noteId, snapshot: cloneNote(noteDataRef.current[noteId]) });
        if (to.length > 50) to.shift();
        restoreSnapshot(noteId, entry.snapshot);
      }
    }
    syncAvailability();
  };

  const undo = () => step(undoStack.current, redoStack.current);
  const redo = () => step(redoStack.current, undoStack.current);

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    onActiveNoteChanged,
    commitNoteData,
    adoptNoteData,
    applyExternalNote,
    remapNoteFolders,
    replaceNoteData,
    commitTextChange,
    isUndoRedo,
    noteDataRef,
    hasPendingFlush,
    textOnlyEdit,
    textOnlyEditForSidebar,
    textOnlyEditForEditor,
    unflushedNotes,
  };
}
