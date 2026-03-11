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
    // Multi-line block properties
    if ((a[i].lang || "") !== (b[i].lang || "")) return false;
    if ((a[i].calloutType || "") !== (b[i].calloutType || "")) return false;
    if ((a[i].calloutTypeRaw || "") !== (b[i].calloutTypeRaw || "")) return false;
    if ((a[i].title || "") !== (b[i].title || "")) return false;
    // Table rows
    if (a[i].rows || b[i].rows) {
      const ar = JSON.stringify(a[i].rows || []);
      const br = JSON.stringify(b[i].rows || []);
      if (ar !== br) return false;
    }
  }
  return true;
}

export function useFileSystem(
  noteData,
  setNoteData,
  setCustomFolders,
  trashedNotesRef,
  syncGeneration,
  setSidebarOrder,
) {
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

    return () => {
      cancelled = true;
    };
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
      if (noteData[id]?._draft) continue; // Skip drafts
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
      if (note?._draft) {
        dirtyNotes.current.delete(noteId);
        continue;
      }
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

      // Check if content actually changed before queueing state update —
      // avoids block ID churn when chokidar echoes back a file we just wrote
      const existing = noteDataRef.current[cleanNote.id];
      if (
        existing &&
        blocksEqual(existing.content?.blocks, cleanNote.content?.blocks) &&
        existing.title === cleanNote.title &&
        existing.folder === cleanNote.folder
      ) {
        return; // Nothing changed, skip entirely
      }

      isExternalUpdate.current = true;
      setNoteData((prev) => ({ ...prev, [cleanNote.id]: cleanNote }));

      // Bump syncGeneration so EditableBlock re-syncs DOM from new block data
      if (syncGeneration) {
        syncGeneration.current++;
      }
      // If the note lives in a folder, ensure that folder exists in customFolders
      if (cleanNote.folder) {
        setCustomFolders((prev) => {
          if (prev.includes(cleanNote.folder)) return prev;
          return [...prev, cleanNote.folder];
        });
      }
    });

    // Sync folders after external file change — remove stale folders
    const syncFoldersFromDisk = async () => {
      try {
        const diskNotes = await window.electronAPI.readAllNotes();
        const diskFolders = new Set();
        for (const n of Object.values(diskNotes)) {
          if (n.folder) diskFolders.add(n.folder);
        }
        setCustomFolders((prev) => {
          const filtered = prev.filter((f) => diskFolders.has(f));
          for (const f of diskFolders) {
            if (!filtered.includes(f)) filtered.push(f);
          }
          if (filtered.length === prev.length && filtered.every((f, i) => f === prev[i]))
            return prev;
          return filtered;
        });

        // Clean sidebarOrder: remove entries for folders that no longer exist
        if (setSidebarOrder) {
          setSidebarOrder((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const key of Object.keys(next)) {
              if (key === "") continue; // root always valid
              if (!diskFolders.has(key)) {
                delete next[key];
                changed = true;
              }
            }
            // Clean folderOrder arrays in remaining entries
            for (const [key, meta] of Object.entries(next)) {
              if (meta.folderOrder) {
                const validChildren = meta.folderOrder.filter((name) => {
                  const childPath = key ? key + "/" + name : name;
                  return diskFolders.has(childPath);
                });
                if (validChildren.length !== meta.folderOrder.length) {
                  next[key] = { ...meta, folderOrder: validChildren };
                  changed = true;
                }
              }
            }
            return changed ? next : prev;
          });
        }
      } catch (err) {
        console.error("useFileSystem: folder sync failed", err);
      }
    };

    const unsubDelete = window.electronAPI.onFileDeleted(({ filePath }) => {
      // Re-read all notes and sync folders to remove stale entries
      (async () => {
        try {
          const diskNotes = await window.electronAPI.readAllNotes();
          isExternalUpdate.current = true;
          setNoteData((prev) => {
            const drafts = {};
            for (const [id, n] of Object.entries(prev)) {
              if (n._draft) drafts[id] = n;
            }
            return { ...diskNotes, ...drafts };
          });
          await syncFoldersFromDisk();
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
