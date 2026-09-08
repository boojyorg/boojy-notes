import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isElectron, isNative } from "../utils/platform";
import { getAPI } from "../services/apiProvider";
import { blocksToMarkdown } from "../utils/markdown";
import { genNoteId } from "../utils/storage";
import { trace } from "../utils/trace";

const WRITE_DEBOUNCE_MS = 500;
const WRITE_RETRY_MS = 5000;

/**
 * Whether two versions of a note would be written as the same file: same
 * name, same folder, same line-ending style, same Markdown. The comparison
 * is the writer itself, so it covers every field that reaches disk and
 * nothing else. A hand-kept field list once missed indent, list markers,
 * numbering, table alignment and image widths, so an outside re-indent read
 * as "same" and the next keystroke wrote the old file back over it.
 */
export function persistedEquals(a, b) {
  if (!a || !b) return !a && !b;
  return (
    a.title === b.title &&
    (a.folder ?? null) === (b.folder ?? null) &&
    (a.content?.eol ?? "\n") === (b.content?.eol ?? "\n") &&
    blocksToMarkdown(a.content?.blocks || []) === blocksToMarkdown(b.content?.blocks || [])
  );
}

/** The name a note's unsaved version is kept under when the file changed outside the app. */
export function conflictCopyTitle(title, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return `${title || "Untitled"} (conflicted copy ${day})`;
}

/**
 * @param editorLinks `{ unflushedNotes, latestNoteDataRef, activeNoteRef,
 *   applyExternalNote, adoptNoteData, replaceNoteData, remapNoteFolders,
 *   onExternalConflict, onNotesEdited, onTitleResolved }`. This hook never
 *   sets note state itself: every change of record from disk goes through
 *   useHistory, which keeps its keystroke ref and React state together.
 *   `applyExternalNote(note)` is the path for one note as the disk now holds
 *   it, `replaceNoteData(map)` for the whole vault (the initial load, a vault
 *   switch, the rebuild after an outside delete); a pending text commit can
 *   then neither republish a stale copy over them nor be lost under them.
 *   `activeNoteRef` says which note is being edited. An outside change to any
 *   other note, or to the open note with nothing pending, is taken at once.
 *   One to the open note while edits are pending (`unflushedNotes` or the
 *   dirty set) keeps both versions: the outside bytes stay under the note's
 *   own name, the local version is written as a conflict copy through the
 *   ordinary write path, and only once that write has succeeded is the copy
 *   adopted (via `adoptNoteData`, so the ordinary flush rewrites it with any
 *   keystrokes typed during the write) and `onExternalConflict({ noteId,
 *   title, copyId, copyTitle })` called, so the editor can continue in the
 *   copy. If the copy cannot be written, nothing is replaced: the local work
 *   stays in memory, the outside bytes stay on disk, the failure is shown once,
 *   and the note is remembered as conflicted so that every later flush (the
 *   debounce, the retry, blur, quit) writes it as the copy and never under its
 *   own name.
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
 *   through `remap` in the live data after a directory rename; it returns
 *   whether anything changed.
 */
export function useFileSystem(noteData, setCustomFolders, syncGeneration, onError, editorLinks) {
  const [notesDir, setNotesDir] = useState(null);
  const [loading, setLoading] = useState(isNative);

  const prevNoteData = useRef(null);
  const dirtyNotes = useRef(new Set());
  const deletedNotes = useRef(new Set());
  const writeTimer = useRef(null);
  const retryTimer = useRef(null);
  const reportedWriteFailures = useRef(new Set());
  const isExternalUpdate = useRef(false);
  // Notes whose next state change came from disk: skipped by the dirty scan
  // one at a time, so a keystroke that shares a render with an outside change
  // to another note is still marked dirty. The boolean above is for whole-vault
  // replacements (initial load, vault change, the rebuild after a delete).
  const externalIds = useRef(new Set());
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const notesDirRef = useRef(notesDir);
  notesDirRef.current = notesDir;
  const editorLinksRef = useRef(editorLinks);
  editorLinksRef.current = editorLinks;
  // The vault as the disk holds it replaces note state wholesale. The next
  // render's dirty scan is skipped, so nothing taken from disk is written
  // back; a caller that folds in local work (the delete rebuild) marks that
  // work dirty itself.
  const takeFromDisk = useCallback((next) => {
    isExternalUpdate.current = true;
    editorLinksRef.current.replaceNoteData(next);
  }, []);
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
          takeFromDisk(diskNotes);
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
    // Deps deliberately not exhaustive: onError is not stable; including it would re-run initial load
  }, [takeFromDisk, setCustomFolders, refreshFolders]);

  // ─── Detect local changes and debounce writes ───
  useEffect(() => {
    if (!isNative) return;

    if (isExternalUpdate.current) {
      isExternalUpdate.current = false;
      externalIds.current.clear();
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
        if (externalIds.current.has(id)) {
          dirtyNotes.current.delete(id);
          continue;
        }
        dirtyNotes.current.add(id);
        newlyDirty.push(id);
      }
    }
    // The render that carries an outside change is always the next one after
    // it was marked, so nothing marked can outlive this scan.
    externalIds.current.clear();
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

  // ─── A conflict whose copy has not yet been written ───
  // From the moment the open note is found changed on disk while edits to it
  // are pending, the local version must never again be written under the
  // note's own name; that would put it over the outside edit. The note is
  // remembered here with the disk version it conflicts with, before the copy's
  // write begins and not only once it has failed, and every flush (the
  // debounce, the retry, blur, quit) writes it as the copy instead; a flush
  // that lands while the copy is being written waits for that write rather
  // than starting a second one (`copyInFlight`). The entry clears only when a
  // copy write succeeds. Before this the entry was made on failure alone and
  // a blur or quit inside the copy's ~10 ms write re-marked the note from the
  // quit/blur net and wrote the local version over the outside edit.
  const conflicted = useRef(new Map());
  const copyInFlight = useRef(new Map());

  const scheduleRetry = () => {
    if (retryTimer.current !== null) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      flushRef.current();
    }, WRITE_RETRY_MS);
  };

  // The note's folder must exist in the sidebar's list.
  const ensureFolder = useCallback(
    (folder) => {
      if (!folder) return;
      setCustomFolders((prev) => (prev.includes(folder) ? prev : [...prev, folder]));
    },
    [setCustomFolders],
  );

  // The open note changed on disk while edits to it are pending here. The
  // outside bytes keep the note's name; the local version, pending text
  // included, is written as a conflict copy first, and only once that write
  // has succeeded is anything in memory replaced. A failed copy replaces
  // nothing: the work stays here, the note is remembered as conflicted so no
  // flush can write it under its own name, the failure is shown once, and the
  // ordinary retry keeps trying the copy. Returns whether the copy was written.
  const keepBothVersions = useCallback(
    (external, local) => {
      const id = external.id;
      // Conflicted from now: the newest disk version is what the note adopts
      // once the copy is written, whether this call or one in flight writes it.
      conflicted.current.set(id, external);
      const inFlight = copyInFlight.current.get(id);
      if (inFlight) return inFlight;
      const run = (async () => {
        const api = getAPI();
        const copyId = genNoteId();
        const requestedTitle = conflictCopyTitle(local.title);
        const snapshot = (source, title) => ({
          ...source,
          id: copyId,
          title,
          content: { ...source.content, title, blocks: source.content?.blocks || [] },
          lastModified: Date.now(),
        });
        let written;
        try {
          written = await api.writeNote(snapshot(local, requestedTitle));
        } catch (err) {
          console.error("useFileSystem: conflict copy write failed", id, err);
          dirtyNotes.current.add(id);
          if (!reportedWriteFailures.current.has(id)) {
            reportedWriteFailures.current.add(id);
            onErrorRef.current?.(
              `"${external.title}" changed outside Boojy Notes and your edits could not be saved as a copy. They are still here, unsaved; Boojy Notes will keep trying.`,
            );
          }
          scheduleRetry();
          return false;
        }
        trace("conflict copy written", id, "→", copyId, JSON.stringify(written?.title));
        const disk = conflicted.current.get(id) ?? external;
        conflicted.current.delete(id);
        reportedWriteFailures.current.delete(id);
        // The links object is rebuilt on every render; read it after the await.
        const links = editorLinksRef.current;
        const copyTitle = typeof written?.title === "string" ? written.title : requestedTitle;
        // Keystrokes typed during the write are in the latest local version;
        // the copy adopts it and the ordinary flush writes the copy once more.
        const latest = links.latestNoteDataRef?.current?.[id] || local;
        const copy = snapshot(latest, copyTitle);
        dirtyNotes.current.delete(id);
        externalIds.current.add(id);
        links.applyExternalNote(disk);
        links.adoptNoteData((prev) => ({ ...prev, [copyId]: copy }));
        if (syncGeneration) syncGeneration.current++;
        ensureFolder(disk.folder);
        links.onExternalConflict?.({ noteId: id, title: disk.title, copyId, copyTitle });
        return true;
      })();
      copyInFlight.current.set(id, run);
      return run.finally(() => copyInFlight.current.delete(id));
    },
    // Deps deliberately not exhaustive: refs and stable setters only
    [ensureFolder],
  );

  // ─── Flush writes to disk ───
  // `latestData` overrides the state-synced ref for quit/blur flushes, where the
  // text-commit debounce means React state (and this hook's ref) lag the latest
  // edits held in useHistory's noteDataRef. `extraDirtyIds` covers the note whose
  // pending text commit hasn't reached state yet, so it was never marked dirty.
  const flush = useCallback(
    async (latestData, extraDirtyIds) => {
      if (!isNative) return;
      const api = getAPI();

      // This flush supersedes the debounced one. Cancel it so it cannot fire
      // behind a quit or blur flush and write the same notes a second time.
      clearTimeout(writeTimer.current);
      writeTimer.current = null;

      if (extraDirtyIds) for (const id of extraDirtyIds) dirtyNotes.current.add(id);
      const dirty = [...dirtyNotes.current];
      for (const noteId of dirty) {
        // Read as this note's write begins, not once for the loop: state can
        // move on while an earlier note in the list is being written, and a
        // snapshot from before the loop would write the older version.
        const note = (latestData || noteDataRef.current)[noteId];
        if (!note || note._draft) {
          dirtyNotes.current.delete(noteId);
          continue;
        }
        // A note in conflict is written only as its copy, never under its own
        // name; a failure keeps it dirty and conflicted for the next attempt.
        if (conflicted.current.has(noteId)) {
          if (!(await keepBothVersions(conflicted.current.get(noteId), note))) continue;
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
        // A dirty mark is cleared only by a write of the version the note
        // holds now, in state or in the keystroke ref. An edit that landed
        // while this write was in flight has already re-marked the note and
        // scheduled the next flush; clearing here would have that flush find
        // nothing to write, leaving the newer text on screen and the older on
        // disk until quit or blur. A failed write `continue`s above, so a note
        // that did not reach disk stays in both sets and is retried.
        const links = editorLinksRef.current;
        const stillCurrent =
          noteDataRef.current[noteId] === note ||
          links?.latestNoteDataRef?.current?.[noteId] === note;
        if (stillCurrent) dirtyNotes.current.delete(noteId);
        else trace("write superseded", noteId, "kept dirty");
        // The version written is now accounted for. When it was the keystroke
        // ref's (a blur, quit or vault-switch flush ahead of the text commit),
        // the commit that publishes the same object later is not a change
        // and must not mark the note dirty again: the rewrite it scheduled
        // could land after a vault switch, in the wrong vault.
        if (prevNoteData.current && prevNoteData.current[noteId] !== note)
          prevNoteData.current = { ...prevNoteData.current, [noteId]: note };
        // Persisted, and nothing typed since: the quit/blur net no longer needs it.
        if (links?.unflushedNotes && links.latestNoteDataRef.current[noteId] === note) {
          links.unflushedNotes.current.delete(noteId);
        }
      }

      if (dirtyNotes.current.size > 0) {
        scheduleRetry();
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
      // Deps deliberately not exhaustive: onError is not stable
    },
    [keepBothVersions],
  );

  const flushRef = useRef(flush);
  flushRef.current = flush;

  // ─── Listen for external file changes (chokidar → IPC, Electron only) ───
  useEffect(() => {
    if (!isElectron) return;

    // Take the disk's version of a note. The editor repaints from state only
    // when it is the open note: a repaint while typing in another note would
    // paint that note's state, which lags the keystrokes still inside the
    // text-commit debounce, over the live DOM.
    const applyExternal = (external) => {
      const links = editorLinksRef.current;
      dirtyNotes.current.delete(external.id);
      externalIds.current.add(external.id);
      links.applyExternalNote(external);
      if (syncGeneration && links.activeNoteRef.current === external.id) syncGeneration.current++;
      ensureFolder(external.folder);
    };

    const unsubChange = window.electronAPI.onFileChanged((note) => {
      if (!note?.id) return;
      // Strip internal _filePath from the note before setting state
      const { _filePath, ...external } = note;
      const links = editorLinksRef.current;
      // The latest local version, pending text included, is what the disk is
      // compared against and what a conflict copy must hold.
      const local =
        links?.latestNoteDataRef?.current?.[external.id] ?? noteDataRef.current[external.id];
      const same = !!local && persistedEquals(local, external);
      const isActive = !!links?.activeNoteRef && links.activeNoteRef.current === external.id;
      const pending =
        !!local &&
        !local._draft &&
        (dirtyNotes.current.has(external.id) || !!links?.unflushedNotes?.current?.has(external.id));
      trace(
        "file-changed recv",
        external.id,
        JSON.stringify(external.title),
        same ? "SAME (ignored)" : isActive && pending ? "CONFLICT → keep both" : "DIFFERS → apply",
        "memBlocks",
        local?.content?.blocks?.length ?? "none",
        "diskBlocks",
        external.content?.blocks?.length ?? 0,
      );
      if (same) return;
      if (isActive && pending && links?.applyExternalNote && links?.adoptNoteData) {
        // Dropped now, not after the copy is written: a debounced flush firing
        // during that write would otherwise put the local bytes over the
        // outside edit. A failed copy puts it back, conflicted, so every later
        // flush writes it as the copy and never under its own name.
        dirtyNotes.current.delete(external.id);
        keepBothVersions(external, local);
        return;
      }
      applyExternal(external);
    });

    // A note renamed or moved outside the app is the same note under a new
    // name or folder: the main process followed its inode and re-pointed the
    // index, so the next write already lands at the new path. The name and
    // folder are adopted as a change of record (no history entry, the path
    // the filename a write produced takes), the text stays whatever it is
    // here, pending keystrokes included. Edits pending for the note keep
    // their dirty mark and go out at the new path with the ordinary flush; a
    // note with nothing pending is not rewritten for a rename the app did
    // not make (`externalIds`: the scan leaves it clean), so no mtime moves
    // and nothing is stamped as edited here. Before this the rename was a
    // delete, the rebuild kept the note because edits were pending, and the
    // flush recreated the old file, or the old folder, beside the new one.
    const unsubMove = window.electronAPI.onFileMoved
      ? window.electronAPI.onFileMoved((note) => {
          if (!note?.id) return;
          const { _filePath, ...external } = note;
          const id = external.id;
          const links = editorLinksRef.current;
          const local = links?.latestNoteDataRef?.current?.[id] ?? noteDataRef.current[id];
          if (!local) {
            applyExternal(external);
            return;
          }
          const pending = dirtyNotes.current.has(id) || !!links?.unflushedNotes?.current?.has(id);
          trace(
            "file-moved recv",
            id,
            JSON.stringify(external.title),
            external.folder ?? "/",
            pending ? "pending edits follow" : "nothing pending",
          );
          if (!pending) externalIds.current.add(id);
          links.adoptNoteData((prev) => {
            const n = prev[id];
            if (!n) return prev;
            return {
              ...prev,
              [id]: {
                ...n,
                title: external.title,
                folder: external.folder ?? null,
                content: { ...n.content, title: external.title },
              },
            };
          });
          ensureFolder(external.folder);
        })
      : () => {};

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

    const unsubDelete = window.electronAPI.onFileDeleted(() => {
      // Re-read all notes and sync folders to remove stale entries
      (async () => {
        try {
          const diskNotes = await window.electronAPI.readAllNotes();
          // Disk is the base, but what exists only here survives the rebuild:
          // drafts, and every note with edits not yet written, whether its
          // write is scheduled (dirty) or its keystrokes are still inside
          // the text commit (unflushed). Those are taken from the keystroke
          // ref, the newest version, and marked dirty, so the ordinary flush
          // writes them; a note deleted outside while its edits were unsaved
          // is therefore written back rather than lost. A note the user has
          // deleted here whose Trash move is still pending stays deleted.
          const links = editorLinksRef.current;
          const latest = links.latestNoteDataRef.current;
          const next = { ...diskNotes };
          for (const id of deletedNotes.current) delete next[id];
          const kept = [];
          for (const [id, n] of Object.entries(noteDataRef.current)) {
            if (n._draft) next[id] = n;
            else if (dirtyNotes.current.has(id) || links.unflushedNotes.current.has(id)) {
              next[id] = latest[id] ?? n;
              kept.push(id);
            }
          }
          takeFromDisk(next);
          if (kept.length > 0) {
            for (const id of kept) dirtyNotes.current.add(id);
            clearTimeout(writeTimer.current);
            writeTimer.current = setTimeout(() => flushRef.current(), WRITE_DEBOUNCE_MS);
          }
          await syncFoldersFromDisk();
        } catch (err) {
          console.error("useFileSystem: re-read after delete failed", err);
        }
      })();
    });

    return () => {
      unsubChange();
      unsubMove();
      unsubDelete();
      unsubFolders();
    };
    // Deps deliberately not exhaustive: onError is not stable; setCustomFolders/syncGeneration are stable refs/setters
  }, [
    takeFromDisk,
    setCustomFolders,
    syncGeneration,
    refreshFolders,
    keepBothVersions,
    ensureFolder,
  ]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      clearTimeout(writeTimer.current);
      clearTimeout(retryTimer.current);
    };
  }, []);

  // ─── Change notes directory (Electron only) ───
  // The main process switches the vault inside the picker call, and every
  // write resolves the vault live, so the old vault's pending edits are
  // written before the picker opens (the picker is modal: nothing can be
  // typed while it is up) and the old notes leave state before anything
  // else can run. Nothing of the old vault is ever written into the new one;
  // what could not be written before the switch is left behind, as at quit.
  const changeNotesDir = useCallback(async () => {
    if (!isElectron) return;
    try {
      const links = editorLinksRef.current;
      await flushRef.current(links.latestNoteDataRef.current, [...links.unflushedNotes.current]);
      const newDir = await window.electronAPI.chooseNotesDir();
      if (!newDir) return; // user cancelled
      takeFromDisk({});
      dirtyNotes.current.clear();
      deletedNotes.current.clear();
      conflicted.current.clear();
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
      setNotesDir(newDir);

      const diskNotes = await window.electronAPI.readAllNotes();
      takeFromDisk(diskNotes);
      if (syncGeneration) syncGeneration.current++;
      // The new vault's directories replace the old vault's, never merge with them.
      await refreshFolders();
    } catch (err) {
      console.error("useFileSystem: changeNotesDir failed", err);
      onError?.("Failed to change notes directory");
    }
    // Deps deliberately not exhaustive: onError is not stable
  }, [takeFromDisk, refreshFolders]);

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
          // Not a local edit: the next state change must not mark anything
          // dirty. If the history ref already agreed (nothing to change), no
          // render is coming to consume the flag; clear it or the next real
          // edit would be mistaken for an external one and never reach disk.
          isExternalUpdate.current = true;
          if (!editorLinksRef.current.remapNoteFolders(remap)) isExternalUpdate.current = false;
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
  }, [setCustomFolders, afterNextFlush]);

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
