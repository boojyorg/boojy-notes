import { useState, useEffect, useRef, useCallback } from "react";
import { pushNote, pullNotes, deleteNoteRemote } from "../services/sync";
import { supabase } from "../lib/supabase";

const SYNC_DEBOUNCE_MS = 2000;
const LAST_SYNC_KEY = "boojy-sync-last";

export function useSync(user, profile, noteData, setNoteData) {
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
  const channelRef = useRef(null);

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
          channelRef.current?.send({
            type: "broadcast",
            event: "note_upsert",
            payload: { id: note.id, title: note.title, folder: note.folder || null, path: note.path || null, content: note.content, words: note.words || 0 },
          });
        }
        dirtyNotes.current.clear();
      } else {
        // Push dirty notes
        const dirty = [...dirtyNotes.current];
        for (const noteId of dirty) {
          const note = noteDataRef.current[noteId];
          if (note) {
            await pushNote(note);
            channelRef.current?.send({
              type: "broadcast",
              event: "note_upsert",
              payload: { id: note.id, title: note.title, folder: note.folder || null, path: note.path || null, content: note.content, words: note.words || 0 },
            });
            dirtyNotes.current.delete(noteId);
          }
        }
      }

      // Push deletes
      const deleted = [...deletedNotes.current];
      for (const noteId of deleted) {
        await deleteNoteRemote(noteId);
        channelRef.current?.send({
          type: "broadcast",
          event: "note_delete",
          payload: { id: noteId },
        });
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

  // Sync when tab becomes visible (covers switching browsers/tabs)
  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        syncAllRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.id]);

  // Realtime Broadcast: receive note changes from other devices instantly
  // postgres_changes on storage_usage: reliable backup if broadcast is missed
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notes-sync:${user.id}`)
      .on("broadcast", { event: "note_upsert" }, ({ payload }) => {
        if (!payload?.id || dirtyNotes.current.has(payload.id)) return;
        isRemoteUpdate.current = true;
        setNoteData(prev => ({ ...prev, [payload.id]: payload }));
      })
      .on("broadcast", { event: "note_delete" }, ({ payload }) => {
        if (!payload?.id || dirtyNotes.current.has(payload.id)) return;
        isRemoteUpdate.current = true;
        setNoteData(prev => {
          const next = { ...prev };
          delete next[payload.id];
          return next;
        });
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "storage_usage",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Backup: if broadcast was missed, full pull catches it
          if (!isSyncing.current) {
            syncAllRef.current();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
        } else {
          channelRef.current = null;
        }
      });

    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [user?.id, setNoteData]);

  // Poll for remote changes every 60s (fallback in case Realtime drops)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        syncAllRef.current();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Cleanup
  useEffect(() => {
    return () => clearTimeout(syncTimer.current);
  }, []);

  return {
    syncState,
    lastSynced,
    storageUsed,
    storageLimitMB: profile?.storage_limit_bytes ? profile.storage_limit_bytes / (1024 * 1024) : null,
    syncAll,
  };
}
