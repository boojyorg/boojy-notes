import { useState, useEffect, useRef, useCallback } from "react";

const WRITE_DEBOUNCE_MS = 500;
const isElectron = typeof window !== "undefined" && !!window.electronAPI;

// Compare blocks structurally (type, text, checked) ignoring IDs
function blocksEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].type !== b[i].type) return false;
    if (a[i].type === "image") {
      if (a[i].src !== b[i].src || (a[i].alt || "") !== (b[i].alt || "")) return false;
    } else {
      if ((a[i].text || "") !== (b[i].text || "")) return false;
    }
    if (a[i].checked !== b[i].checked) return false;
  }
  return true;
}

export function useFileSystem(noteData, setNoteData, setCustomFolders, trashedNotesRef) {
  const [notesDir, setNotesDir] = useState(null);
  const [loading, setLoading] = useState(isElectron);

  const prevNoteData = useRef(null);
  const dirtyNotes = useRef(new Set());
  const deletedNotes = useRef(new Set());
  const writeTimer = useRef(null);
  const isExternalUpdate = useRef(false);
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;

  // ─── Initial load from disk ───
  useEffect(() => {
    if (!isElectron) return;

    let cancelled = false;
    (async () => {
      try {
        const dir = await window.electronAPI.getNotesDir();
        if (!cancelled) setNotesDir(dir);

        const diskNotes = await window.electronAPI.readAllNotes();
        if (cancelled) return;

        if (Object.keys(diskNotes).length > 0) {
          isExternalUpdate.current = true;
          setNoteData(diskNotes);

          // Extract unique folders
          const folders = new Set();
          for (const note of Object.values(diskNotes)) {
            if (note.folder) folders.add(note.folder);
          }
          if (folders.size > 0) {
            setCustomFolders((prev) => {
              const merged = new Set([...prev, ...folders]);
              return [...merged];
            });
          }
        } else {
          // Disk is empty — migrate localStorage notes to disk (one-time)
          const current = noteDataRef.current;
          if (Object.keys(current).length > 0) {
            for (const note of Object.values(current)) {
              await window.electronAPI.writeNote(note);
            }
          }
        }
      } catch (err) {
        console.error("useFileSystem: initial load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [setNoteData, setCustomFolders]);

  // ─── Detect local changes and debounce writes ───
  useEffect(() => {
    if (!isElectron) return;

    if (isExternalUpdate.current) {
      isExternalUpdate.current = false;
      prevNoteData.current = noteData;
      return;
    }

    const prev = prevNoteData.current;
    if (!prev) {
      prevNoteData.current = noteData;
      return;
    }

    for (const id of Object.keys(noteData)) {
      if (!prev[id] || prev[id] !== noteData[id]) {
        dirtyNotes.current.add(id);
      }
    }

    for (const id of Object.keys(prev)) {
      if (!noteData[id]) {
        deletedNotes.current.add(id);
        dirtyNotes.current.delete(id);
      }
    }

    prevNoteData.current = noteData;

    if (dirtyNotes.current.size > 0 || deletedNotes.current.size > 0) {
      clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => flushRef.current(), WRITE_DEBOUNCE_MS);
    }
  }, [noteData]);

  // ─── Flush writes to disk ───
  const flush = useCallback(async () => {
    if (!isElectron) return;

    const dirty = [...dirtyNotes.current];
    for (const noteId of dirty) {
      const note = noteDataRef.current[noteId];
      if (note) {
        try {
          await window.electronAPI.writeNote(note);
        } catch (err) {
          console.error("useFileSystem: write failed", noteId, err);
        }
      }
      dirtyNotes.current.delete(noteId);
    }

    const deleted = [...deletedNotes.current];
    for (const noteId of deleted) {
      try {
        const trashInfo = trashedNotesRef?.current?.get(noteId);
        if (trashInfo) {
          await window.electronAPI.trashNote(noteId, trashInfo.title, trashInfo.folder);
          trashedNotesRef.current.delete(noteId);
        } else {
          await window.electronAPI.deleteNoteFile(noteId);
        }
      } catch (err) {
        console.error("useFileSystem: delete failed", noteId, err);
      }
      deletedNotes.current.delete(noteId);
    }
  }, []);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  // ─── Listen for external file changes (chokidar → IPC) ───
  useEffect(() => {
    if (!isElectron) return;

    const unsubChange = window.electronAPI.onFileChanged((note) => {
      if (!note?.id) return;
      // Strip internal _filePath from the note before setting state
      const { _filePath, ...cleanNote } = note;
      isExternalUpdate.current = true;
      setNoteData((prev) => {
        const existing = prev[cleanNote.id];
        // Skip update if content is structurally identical — avoids block ID churn
        // when chokidar echoes back a file we just wrote (markdownToBlocks generates
        // new IDs each time, which would cause React key changes → unmount/remount)
        if (existing && blocksEqual(existing.content?.blocks, cleanNote.content?.blocks)
            && existing.title === cleanNote.title
            && existing.folder === cleanNote.folder) {
          isExternalUpdate.current = false; // Nothing changed, reset flag
          return prev;
        }
        return { ...prev, [cleanNote.id]: cleanNote };
      });
    });

    const unsubDelete = window.electronAPI.onFileDeleted(({ filePath }) => {
      // Find note by filePath — scan current noteData
      // Since we can't read the deleted file, we mark it via setNoteData
      // The main process sends filePath; we match against known notes
      // For now, trigger a full re-read to stay consistent
      (async () => {
        try {
          const diskNotes = await window.electronAPI.readAllNotes();
          isExternalUpdate.current = true;
          setNoteData(diskNotes);
        } catch (err) {
          console.error("useFileSystem: re-read after delete failed", err);
        }
      })();
    });

    return () => {
      unsubChange();
      unsubDelete();
    };
  }, [setNoteData]);

  // Cleanup timer
  useEffect(() => {
    return () => clearTimeout(writeTimer.current);
  }, []);

  // ─── Change notes directory (Electron only) ───
  const changeNotesDir = useCallback(async () => {
    if (!isElectron) return;
    try {
      const newDir = await window.electronAPI.chooseNotesDir();
      if (!newDir) return; // user cancelled
      setNotesDir(newDir);

      const diskNotes = await window.electronAPI.readAllNotes();
      isExternalUpdate.current = true;
      setNoteData(diskNotes);

      const folders = new Set();
      for (const note of Object.values(diskNotes)) {
        if (note.folder) folders.add(note.folder);
      }
      setCustomFolders((prev) => {
        const merged = new Set([...prev, ...folders]);
        return [...merged];
      });
    } catch (err) {
      console.error("useFileSystem: changeNotesDir failed", err);
    }
  }, [setNoteData, setCustomFolders]);

  return { isElectron, notesDir, loading, changeNotesDir };
}
