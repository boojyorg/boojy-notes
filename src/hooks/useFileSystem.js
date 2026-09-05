import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isElectron, isNative } from "../utils/platform";
import { getAPI } from "../services/apiProvider";
import { trace } from "../utils/trace";

const WRITE_DEBOUNCE_MS = 500;
const WRITE_RETRY_MS = 5000;

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

/**
 * @param editorLinks Optional `{ unflushedNotes, latestNoteDataRef, onNotesEdited,
 *   onTitleResolved }`.
 *   `onTitleResolved(id, written, title)` is called when the write landed the
 *   note under a basename other than the title it was written with: a
 *   namesake forced a suffix, characters a filename cannot hold were replaced,
 *   edges were trimmed. `written` is the note object that was written, so the
 *   receiver can tell whether the user has renamed it since. The filename is
 *   the title on disk and after a restart, so the receiver adopts it now.
 *   `onNotesEdited(ids)` is called with every note that just became dirty here —
 *   the one moment that means "modified in this app", whatever the edit was
 *   (typing after its commit, a checkbox, a rename, a move, a new note). It feeds
 *   the sidebar's "Most recent" order; external changes carry their own mtime
 *   and are skipped, so the watcher never double-stamps.
 *   `unflushedNotes` is the quit/blur safety net: notes whose latest keystrokes
 *   may still be inside the text-commit debounce and so not yet in React state.
 *   A successful write here removes a note from it only when the object written
 *   is still the newest one in `latestNoteDataRef` — the ref is replaced on
 *   every keystroke, so identity means "nothing typed since". Without that
 *   check, a debounced write of the state's copy (up to 300ms behind the
 *   editor) would clear the net and an immediate quit would drop the tail.
 *   `remapNoteFolders(remap)` (useHistory) moves every note's `folder` field
 *   through `remap` in the live data and in every undo snapshot after a
 *   directory rename; it returns whether anything changed.
 */
export function useFileSystem(
  noteData,
  setNoteData,
  setCustomFolders,
  syncGeneration,
  onError,
  editorLinks = null,
) {
  const [notesDir, setNotesDir] = useState(null);
  const [loading, setLoading] = useState(isNative);

  const prevNoteData = useRef(null);
  const dirtyNotes = useRef(new Set());
  const deletedNotes = useRef(new Set());
  const writeTimer = useRef(null);
  const retryTimer = useRef(null);
  const reportedWriteFailures = useRef(new Set());
  const isExternalUpdate = useRef(false);
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const notesDirRef = useRef(notesDir);
  notesDirRef.current = notesDir;
  // Work to run once the next flush has finished: after pending writes and
  // Trash moves. Removing a folder's directory waits on this, so it can only
  // happen after the notes inside it have left.
  const afterFlushCallbacks = useRef([]);
  const afterNextFlush = useCallback((fn) => {
    afterFlushCallbacks.current.push(fn);
  }, []);

  // ─── Folders are directories (desktop) ───
  // The folder list is the disk walk, not "where notes happen to be": an empty
  // directory shows, and a new one survives a restart. On web the list stays
  // in memory (useNoteCrud's fallback) and this is a no-op.
  const refreshFolders = useCallback(async () => {
    const api = getAPI();
    if (typeof api?.readFolders !== "function") return;
    const folders = await api.readFolders();
    setCustomFolders((prev) =>
      prev.length === folders.length && prev.every((f, i) => f === folders[i]) ? prev : folders,
    );
  }, [setCustomFolders]);

  // ─── Initial load from disk ───
  useEffect(() => {
    if (!isNative) return;
    const api = getAPI();

    let cancelled = false;
    (async () => {
      try {
        const dir = await api.getNotesDir();
        if (!cancelled) setNotesDir(dir);

        const diskNotes = await api.readAllNotes();
        if (cancelled) return;

        if (Object.keys(diskNotes).length > 0) {
          isExternalUpdate.current = true;
          setNoteData(diskNotes);
          // The restored session renders its active note before this load
          // finishes; bump syncGeneration (like onFileChanged does) so the
          // title-sync layout effects re-run once the data is actually here
          if (syncGeneration) syncGeneration.current++;
        }
        await refreshFolders();
      } catch (err) {
        console.error("useFileSystem: initial load failed", err);
        onError?.("Failed to load notes from disk");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError is not stable; including it would re-run initial load
  }, [setNoteData, setCustomFolders, refreshFolders]);

  // ─── Detect local changes and debounce writes ───
  useEffect(() => {
    if (!isNative) return;

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

    const newlyDirty = [];
    for (const id of Object.keys(noteData)) {
      if (noteData[id]?._draft) continue; // Skip drafts
      if (!prev[id] || prev[id] !== noteData[id]) {
        dirtyNotes.current.add(id);
        newlyDirty.push(id);
      }
    }
    if (newlyDirty.length > 0) {
      trace("dirty", newlyDirty.join(","));
      editorLinksRef.current?.onNotesEdited?.(newlyDirty);
    }

    for (const id of Object.keys(prev)) {
      if (!noteData[id] && !prev[id]?._draft) {
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
  // `latestData` overrides the state-synced ref for quit/blur flushes, where the
  // text-commit debounce means React state (and this hook's ref) lag the latest
  // edits held in useHistory's noteDataRef. `extraDirtyIds` covers the note whose
  // pending text commit hasn't reached state yet, so it was never marked dirty.
  const flush = useCallback(async (latestData, extraDirtyIds) => {
    if (!isNative) return;
    const api = getAPI();

    // This flush supersedes the debounced one. Cancel it so it cannot fire
    // behind a quit or blur flush and write the same notes a second time.
    clearTimeout(writeTimer.current);
    writeTimer.current = null;

    if (extraDirtyIds) for (const id of extraDirtyIds) dirtyNotes.current.add(id);
    const source = latestData || noteDataRef.current;
    const dirty = [...dirtyNotes.current];
    for (const noteId of dirty) {
      const note = source[noteId];
      if (!note || note._draft) {
        dirtyNotes.current.delete(noteId);
        continue;
      }
      if (note) {
        try {
          const t0 = performance.now();
          trace("write start", noteId, "blocks", note.content?.blocks?.length ?? 0);
          const written = await api.writeNote(note);
          trace(
            "write done",
            noteId,
            `${Math.round(performance.now() - t0)}ms`,
            written?.title !== note.title ? `TITLE-ADOPT "${written?.title}"` : "",
          );
          reportedWriteFailures.current.delete(noteId);
          if (typeof written?.title === "string" && written.title !== note.title)
            editorLinksRef.current?.onTitleResolved?.(noteId, note, written.title);
        } catch (err) {
          console.error("useFileSystem: write failed", noteId, err);
          if (!reportedWriteFailures.current.has(noteId)) {
            reportedWriteFailures.current.add(noteId);
            onError?.("Failed to save note to disk — Boojy will keep retrying");
          }
          continue;
        }
      }
      dirtyNotes.current.delete(noteId);
      // Persisted, and nothing typed since: the quit/blur net no longer needs
      // it. A failed write above `continue`s before this line, so a note that
      // did not reach disk stays in both sets and is retried.
      const links = editorLinksRef.current;
      if (links?.unflushedNotes && links.latestNoteDataRef.current[noteId] === note) {
        links.unflushedNotes.current.delete(noteId);
      }
    }

    if (dirtyNotes.current.size > 0 && retryTimer.current === null) {
      retryTimer.current = setTimeout(() => {
        retryTimer.current = null;
        flushRef.current();
      }, WRITE_RETRY_MS);
    } else if (dirtyNotes.current.size === 0 && retryTimer.current !== null) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    const deleted = [...deletedNotes.current];
    for (const noteId of deleted) {
      try {
        const result = await api.trashNote(noteId);
        // `missing` = the note never reached disk (deleted inside the write
        // debounce) or its file is already gone — nothing to trash, not a failure.
        if (!result?.trashed && !result?.missing)
          throw new Error("The note file could not be moved to the Trash");
      } catch (err) {
        console.error("useFileSystem: OS trash failed", noteId, err);
        onError?.("Failed to move note to the system Trash — the file was left on disk");
      }
      deletedNotes.current.delete(noteId);
    }

    const callbacks = afterFlushCallbacks.current;
    afterFlushCallbacks.current = [];
    for (const cb of callbacks) {
      try {
        await cb();
      } catch (err) {
        console.error("useFileSystem: after-flush work failed", err);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError is not stable
  }, []);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  const editorLinksRef = useRef(editorLinks);
  editorLinksRef.current = editorLinks;

  // ─── Listen for external file changes (chokidar → IPC, Electron only) ───
  useEffect(() => {
    if (!isElectron) return;

    const unsubChange = window.electronAPI.onFileChanged((note) => {
      if (!note?.id) return;
      // Strip internal _filePath from the note before setting state
      const { _filePath, ...cleanNote } = note;

      // Check if content actually changed before queueing state update —
      // avoids block ID churn when chokidar echoes back a file we just wrote
      const existing = noteDataRef.current[cleanNote.id];
      const same =
        existing &&
        blocksEqual(existing.content?.blocks, cleanNote.content?.blocks) &&
        existing.title === cleanNote.title &&
        existing.folder === cleanNote.folder;
      trace(
        "file-changed recv",
        cleanNote.id,
        JSON.stringify(cleanNote.title),
        same ? "SAME (ignored)" : "DIFFERS → APPLY external update",
        "memBlocks",
        existing?.content?.blocks?.length ?? "none",
        "diskBlocks",
        cleanNote.content?.blocks?.length ?? 0,
      );
      if (same) {
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

    // The folder list is re-read whenever the disk may have changed it.
    const syncFoldersFromDisk = async () => {
      try {
        await refreshFolders();
      } catch (err) {
        console.error("useFileSystem: folder sync failed", err);
        onError?.("Failed to sync folders from disk");
      }
    };

    // A directory made or removed outside the app (Finder, git, another editor).
    const unsubFolders = window.electronAPI.onFoldersChanged
      ? window.electronAPI.onFoldersChanged(() => {
          syncFoldersFromDisk();
        })
      : () => {};

    const unsubDelete = window.electronAPI.onFileDeleted(({ filePath: _filePath }) => {
      // Re-read all notes and sync folders to remove stale entries
      (async () => {
        try {
          const diskNotes = await window.electronAPI.readAllNotes();
          isExternalUpdate.current = true;
          setNoteData((prev) => {
            // Disk is the base, but notes that only exist in memory must
            // survive the rebuild: drafts, and dirty notes whose debounced
            // write hasn't landed yet (their flush is still scheduled).
            const unpersisted = {};
            for (const [id, n] of Object.entries(prev)) {
              if (n._draft || dirtyNotes.current.has(id)) unpersisted[id] = n;
            }
            return { ...diskNotes, ...unpersisted };
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
      unsubFolders();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError is not stable; setCustomFolders/syncGeneration are stable refs/setters
  }, [setNoteData, setCustomFolders, syncGeneration, refreshFolders]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      clearTimeout(writeTimer.current);
      clearTimeout(retryTimer.current);
    };
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
      if (syncGeneration) syncGeneration.current++;
      // The new vault's directories replace the old vault's, never merge with them.
      await refreshFolders();
    } catch (err) {
      console.error("useFileSystem: changeNotesDir failed", err);
      onError?.("Failed to change notes directory");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError is not stable
  }, [setNoteData, setCustomFolders, refreshFolders]);

  // ─── Folder operations (desktop): the disk answers, state follows ───
  // Each call returns the vault-relative path the directory actually got, the
  // way write-note answers with a note's final basename. `null` on web, where
  // useNoteCrud keeps folders in memory.
  const folderOps = useMemo(() => {
    if (!isNative) return null;
    const remapPaths = (oldPath, newPath) => (p) =>
      p === oldPath ? newPath : p.startsWith(`${oldPath}/`) ? newPath + p.slice(oldPath.length) : p;
    return {
      /** mkdir now, so the folder exists before anything is put in it. */
      create: async (relPath) => {
        const { path } = await getAPI().createFolder(relPath);
        setCustomFolders((prev) => (prev.includes(path) ? prev : [...prev, path]));
        return path;
      },
      /**
       * Rename (same parent) or move (new parent) as one directory rename, so
       * every file inside travels together. Pending edits under the folder are
       * flushed first, or a late write would land at the old path. The notes'
       * `folder` fields then follow the answer without becoming dirty: nothing
       * was edited, so nothing is rewritten and no mtime moves.
       */
      rename: async (oldPath, newPath) => {
        const links = editorLinksRef.current;
        await flushRef.current(
          links?.latestNoteDataRef?.current,
          links?.unflushedNotes ? [...links.unflushedNotes.current] : undefined,
        );
        const { path: finalPath } = await getAPI().renameFolder(oldPath, newPath);
        const remap = remapPaths(oldPath, finalPath);
        const affected = Object.values(noteDataRef.current).some(
          (n) => n.folder && remap(n.folder) !== n.folder,
        );
        if (affected) {
          // Not a local edit: the next state change must not mark anything dirty.
          isExternalUpdate.current = true;
          const remapper = editorLinksRef.current?.remapNoteFolders;
          if (remapper) {
            // If the history ref already agreed (nothing to change), no render
            // is coming to consume the flag; clear it or the next real edit
            // would be mistaken for an external one and never reach disk.
            if (!remapper(remap)) isExternalUpdate.current = false;
          } else {
            setNoteData((prev) => {
              const next = {};
              for (const [id, n] of Object.entries(prev)) {
                next[id] =
                  n.folder && remap(n.folder) !== n.folder ? { ...n, folder: remap(n.folder) } : n;
              }
              return next;
            });
          }
        }
        setCustomFolders((prev) => prev.map(remap));
        return finalPath;
      },
      /**
       * Remove the directory once its notes have reached the Trash, and only
       * if nothing else is left in it; a folder that keeps other files stays,
       * with a toast saying so. With no notes at stake it runs at once.
       */
      remove: async (relPath, { hasNotes }) => {
        const run = async () => {
          const { removed } = await getAPI().deleteFolder(relPath);
          if (removed) {
            setCustomFolders((prev) =>
              prev.filter((f) => f !== relPath && !f.startsWith(`${relPath}/`)),
            );
            return;
          }
          const name = relPath.split("/").pop();
          onErrorRef.current?.(
            `"${name}" still holds files that are not notes, so it stays on disk`,
            "info",
          );
        };
        if (hasNotes) afterNextFlush(run);
        else await run();
      },
      /** Show the directory in the OS file manager. */
      reveal: (relPath) => {
        const dir = notesDirRef.current;
        if (dir) getAPI().showItemInFolder(`${dir}/${relPath}`);
      },
    };
  }, [setNoteData, setCustomFolders, afterNextFlush]);

  return {
    isElectron,
    isNative,
    notesDir,
    loading,
    changeNotesDir,
    flushToDisk: flush,
    folderOps,
  };
}
