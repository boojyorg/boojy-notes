import { useState, useEffect, useRef, useCallback } from "react";
import { pushNote, pullNotes, deleteNoteRemote } from "../services/sync";

const SYNC_DEBOUNCE_MS = 5000;
const LAST_SYNC_KEY = "boojy-sync-last";
const STORAGE_LIMIT_MB = 100;

export function useSync(user, noteData, setNoteData) {
  const [syncState, setSyncState] = useState("idle");
  const [lastSynced, setLastSynced] = useState(() =>
    localStorage.getItem(LAST_SYNC_KEY) || null
  );
  const [storageUsed, setStorageUsed] = useState(0);

  const dirtyNotes = useRef(new Set());
  const deletedNotes = useRef(new Set());
  const syncTimer = useRef(null);
  const prevNoteData = useRef(null);
  const isSyncing = useRef(false);
  const noteDataRef = useRef(noteData);
  const lastSyncedRef = useRef(lastSynced);
  const isRemoteUpdate = useRef(false);

  noteDataRef.current = noteData;
  lastSyncedRef.current = lastSynced;

  // Detect local changes by comparing noteData references
  useEffect(() => {
    if (!user || isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
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
      clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => syncAllRef.current(), SYNC_DEBOUNCE_MS);
    }
  }, [noteData, user]);

  const syncAll = useCallback(async () => {
    if (!user || isSyncing.current) return;
    isSyncing.current = true;
    setSyncState("syncing");

    try {
      // First sync ever: push all local notes to server
      if (!lastSyncedRef.current) {
        const allNotes = Object.values(noteDataRef.current);
        for (const note of allNotes) {
          await pushNote(note);
        }
        dirtyNotes.current.clear();
      } else {
        // Push dirty notes
        const dirty = [...dirtyNotes.current];
        for (const noteId of dirty) {
          const note = noteDataRef.current[noteId];
          if (note) {
            await pushNote(note);
            dirtyNotes.current.delete(noteId);
          }
        }
      }

      // Push deletes
      const deleted = [...deletedNotes.current];
      for (const noteId of deleted) {
        await deleteNoteRemote(noteId);
        deletedNotes.current.delete(noteId);
      }

      // Pull remote changes
      const { notes: remoteNotes } = await pullNotes(lastSyncedRef.current);

      if (remoteNotes?.length > 0) {
        // Parse remote notes outside the state updater (no side effects during React render)
        const parsedRemotes = [];
        const deletedRemotes = [];
        for (const remote of remoteNotes) {
          if (remote.deleted) {
            deletedRemotes.push(remote.note_id);
          } else if (remote.content) {
            try {
              const parsed = JSON.parse(remote.content);
              parsedRemotes.push({
                id: remote.note_id,
                title: parsed.title || remote.title,
                folder: parsed.folder || null,
                path: parsed.path || null,
                content: parsed.content,
                words: parsed.words || 0,
              });
            } catch {
              // Content not in expected JSON format — skip this note
            }
          }
        }

        if (parsedRemotes.length > 0 || deletedRemotes.length > 0) {
          isRemoteUpdate.current = true;
          setNoteData(prev => {
            const next = { ...prev };
            for (const noteId of deletedRemotes) {
              if (!dirtyNotes.current.has(noteId)) {
                delete next[noteId];
              }
            }
            for (const note of parsedRemotes) {
              if (!dirtyNotes.current.has(note.id)) {
                next[note.id] = note;
              }
            }
            return next;
          });
        }
      }

      // Compute storage from remote response
      if (remoteNotes) {
        const totalBytes = remoteNotes.reduce((sum, n) => sum + (n.size_bytes || 0), 0);
        setStorageUsed(totalBytes);
      }

      // Update last sync time
      const now = new Date().toISOString();
      setLastSynced(now);
      localStorage.setItem(LAST_SYNC_KEY, now);
      setSyncState("synced");
    } catch (err) {
      console.error("Sync error:", err);
      setSyncState("error");
    } finally {
      isSyncing.current = false;
    }
  }, [user, setNoteData]);

  const syncAllRef = useRef(syncAll);
  syncAllRef.current = syncAll;

  // Initial sync on login
  useEffect(() => {
    if (user) {
      const t = setTimeout(() => syncAllRef.current(), 500);
      return () => clearTimeout(t);
    } else {
      setSyncState("idle");
      dirtyNotes.current.clear();
      deletedNotes.current.clear();
    }
  }, [user?.id]);

  // Cleanup
  useEffect(() => {
    return () => clearTimeout(syncTimer.current);
  }, []);

  return {
    syncState,
    lastSynced,
    storageUsed,
    storageLimitMB: STORAGE_LIMIT_MB,
    syncAll,
  };
}
