import { useState, useEffect, useRef, useCallback } from "react";
import {
  pushNote,
  pullNotes,
  deleteNoteRemote,
  parseFrontmatter,
  markdownToBlocks,
} from "../services/sync";
import { supabase } from "../lib/supabase";

const SYNC_DEBOUNCE_MS = 2000;
const LAST_SYNC_KEY = "boojy-sync-last";
const VERSION_MAP_KEY = "boojy-sync-versions";
const DIRTY_PERSIST_KEY = "boojy-sync-dirty";
const REMOTE_UPDATE_STALE_MS = 5000;

function loadVersionMap() {
  try {
    return JSON.parse(localStorage.getItem(VERSION_MAP_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveVersionMap(map) {
  localStorage.setItem(VERSION_MAP_KEY, JSON.stringify(map));
}

function loadPersistedDirty() {
  try {
    return JSON.parse(localStorage.getItem(DIRTY_PERSIST_KEY) || "null");
  } catch {
    return null;
  }
}

function savePersistedDirty(ids, noteData) {
  if (ids.length === 0) {
    localStorage.removeItem(DIRTY_PERSIST_KEY);
    return;
  }
  const notes = {};
  for (const id of ids) {
    if (noteData[id]) notes[id] = noteData[id];
  }
  localStorage.setItem(DIRTY_PERSIST_KEY, JSON.stringify({ ids, notes }));
}

function generateConflictId() {
  return "note-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

export function useSync(user, profile, noteData, setNoteData, activeNoteId) {
  const [syncState, setSyncState] = useState("idle");
  const [lastSynced, setLastSynced] = useState(() => localStorage.getItem(LAST_SYNC_KEY) || null);
  const [storageUsed, setStorageUsed] = useState(0);
  const [conflictToast, setConflictToast] = useState(null);
  const [pendingFirstSync, setPendingFirstSync] = useState(null);

  const dirtyNotes = useRef(new Set());
  const deletedNotes = useRef(new Set());
  const syncTimer = useRef(null);
  const prevNoteData = useRef(null);
  const isSyncing = useRef(false);
  const noteDataRef = useRef(noteData);
  const lastSyncedRef = useRef(lastSynced);
  const activeNoteIdRef = useRef(activeNoteId);
  const channelRef = useRef(null);
  const versionMap = useRef(loadVersionMap());

  // Replace boolean isRemoteUpdate with a Map of noteId → timestamp
  const remoteUpdateIds = useRef(new Map());

  noteDataRef.current = noteData;
  lastSyncedRef.current = lastSynced;
  activeNoteIdRef.current = activeNoteId;

  // Load persisted dirty notes on mount
  useEffect(() => {
    const persisted = loadPersistedDirty();
    if (persisted?.ids?.length > 0) {
      for (const id of persisted.ids) {
        dirtyNotes.current.add(id);
      }
      // Restore persisted note content if not already in noteData
      if (persisted.notes) {
        const missing = Object.keys(persisted.notes).filter((id) => !noteDataRef.current[id]);
        if (missing.length > 0) {
          setNoteData((prev) => {
            const next = { ...prev };
            for (const id of missing) {
              next[id] = persisted.notes[id];
            }
            return next;
          });
        }
      }
    }
  }, [setNoteData]);

  // Clean stale remote update entries
  const cleanStaleRemoteUpdates = useCallback(() => {
    const now = Date.now();
    for (const [id, ts] of remoteUpdateIds.current) {
      if (now - ts > REMOTE_UPDATE_STALE_MS) {
        remoteUpdateIds.current.delete(id);
      }
    }
  }, []);

  // Detect local changes by comparing noteData references
  useEffect(() => {
    if (!user) {
      prevNoteData.current = noteData;
      return;
    }

    cleanStaleRemoteUpdates();

    const prev = prevNoteData.current;
    if (!prev) {
      prevNoteData.current = noteData;
      return;
    }

    for (const id of Object.keys(noteData)) {
      // Skip if this was a remote update
      if (remoteUpdateIds.current.has(id)) {
        remoteUpdateIds.current.delete(id);
        continue;
      }
      if (!prev[id] || prev[id] !== noteData[id]) {
        dirtyNotes.current.add(id);
      }
    }

    for (const id of Object.keys(prev)) {
      if (!noteData[id]) {
        deletedNotes.current.add(id);
        dirtyNotes.current.delete(id);
        // Clean up version map entry
        delete versionMap.current[id];
        saveVersionMap(versionMap.current);
      }
    }

    prevNoteData.current = noteData;

    if (dirtyNotes.current.size > 0 || deletedNotes.current.size > 0) {
      // Persist dirty state for offline recovery
      savePersistedDirty([...dirtyNotes.current], noteDataRef.current);
      clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => syncAllRef.current(), SYNC_DEBOUNCE_MS);
    }
  }, [noteData, user, cleanStaleRemoteUpdates]);

  const syncAll = useCallback(async () => {
    if (!user || isSyncing.current) return;
    if (!navigator.onLine) {
      setSyncState("offline");
      return;
    }

    isSyncing.current = true;
    setSyncState("syncing");

    try {
      // First sync ever: push all local notes to server
      if (!lastSyncedRef.current) {
        const allNotes = Object.values(noteDataRef.current);
        for (const note of allNotes) {
          const result = await pushNote(note, null);
          if (result?.version) {
            versionMap.current[note.id] = result.version;
          }
          channelRef.current?.send({
            type: "broadcast",
            event: "note_upsert",
            payload: {
              id: note.id,
              title: note.title,
              folder: note.folder || null,
              path: note.path || null,
              content: note.content,
              words: note.words || 0,
            },
          });
        }
        dirtyNotes.current.clear();
        saveVersionMap(versionMap.current);
      } else {
        // Push dirty notes with conflict detection
        const dirty = [...dirtyNotes.current];
        for (const noteId of dirty) {
          const note = noteDataRef.current[noteId];
          if (note) {
            const expectedVersion = versionMap.current[noteId] || null;
            const result = await pushNote(note, expectedVersion);

            if (result?.conflict) {
              // Conflict detected — create a conflict copy
              const now = new Date();
              const ts = now.toISOString().replace("T", " ").slice(0, 19);
              const conflictTitle = `${note.title || "Untitled"} (conflict ${ts})`;
              const conflictId = generateConflictId();

              const conflictNote = {
                ...note,
                id: conflictId,
                title: conflictTitle,
              };

              // Push the conflict copy (new note, no expectedVersion)
              const copyResult = await pushNote(conflictNote, null);
              if (copyResult?.version) {
                versionMap.current[conflictId] = copyResult.version;
              }

              // Add conflict copy to local state
              remoteUpdateIds.current.set(conflictId, Date.now());
              setNoteData((prev) => ({ ...prev, [conflictId]: conflictNote }));

              // Broadcast the conflict copy
              channelRef.current?.send({
                type: "broadcast",
                event: "note_upsert",
                payload: {
                  id: conflictNote.id,
                  title: conflictNote.title,
                  folder: conflictNote.folder || null,
                  path: conflictNote.path || null,
                  content: conflictNote.content,
                  words: conflictNote.words || 0,
                },
              });

              // Show toast
              setConflictToast({
                noteTitle: note.title || "Untitled",
                conflictId,
                conflictTitle,
              });

              // If not actively editing this note, pull the server version
              if (activeNoteIdRef.current !== noteId) {
                // Server version will be pulled in the pull phase below
              }

              // Update version from server's conflict response
              if (result.serverVersion) {
                versionMap.current[noteId] = result.serverVersion;
              }

              setSyncState("conflict");
              dirtyNotes.current.delete(noteId);
            } else {
              // Success
              if (result?.version) {
                versionMap.current[noteId] = result.version;
              }
              channelRef.current?.send({
                type: "broadcast",
                event: "note_upsert",
                payload: {
                  id: note.id,
                  title: note.title,
                  folder: note.folder || null,
                  path: note.path || null,
                  content: note.content,
                  words: note.words || 0,
                },
              });
              dirtyNotes.current.delete(noteId);
            }
          }
        }
        saveVersionMap(versionMap.current);
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
        delete versionMap.current[noteId];
      }
      if (deleted.length > 0) saveVersionMap(versionMap.current);

      // Pull remote changes
      const { notes: remoteNotes } = await pullNotes(lastSyncedRef.current);

      if (remoteNotes?.length > 0) {
        const parsedRemotes = [];
        const deletedRemotes = [];
        for (const remote of remoteNotes) {
          if (remote.deleted) {
            deletedRemotes.push(remote.note_id);
          } else if (remote.content) {
            try {
              const raw = remote.content.trim();
              let noteObj;

              if (raw.startsWith("---")) {
                const fm = parseFrontmatter(raw);
                if (fm) {
                  noteObj = {
                    id: remote.note_id,
                    title: fm.title,
                    folder: fm.folder,
                    path: fm.path,
                    content: { title: fm.title, blocks: markdownToBlocks(fm.body) },
                    words: fm.words,
                  };
                }
              } else {
                const parsed = JSON.parse(raw);
                noteObj = {
                  id: remote.note_id,
                  title: parsed.title || remote.title,
                  folder: parsed.folder || null,
                  path: parsed.path || null,
                  content: parsed.content,
                  words: parsed.words || 0,
                };
              }

              if (noteObj) parsedRemotes.push(noteObj);
            } catch {
              // Content not in expected format — skip this note
            }
          }
          // Track version from pulled notes
          if (remote.version) {
            versionMap.current[remote.note_id] = remote.version;
          }
        }

        if (parsedRemotes.length > 0 || deletedRemotes.length > 0) {
          // Mark these as remote updates so dirty detection skips them
          for (const noteId of deletedRemotes) {
            remoteUpdateIds.current.set(noteId, Date.now());
          }
          for (const note of parsedRemotes) {
            remoteUpdateIds.current.set(note.id, Date.now());
          }

          setNoteData((prev) => {
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

        saveVersionMap(versionMap.current);
      }

      // Compute storage from remote response
      if (remoteNotes) {
        const totalBytes = remoteNotes.reduce((sum, n) => sum + (n.size_bytes || 0), 0);
        setStorageUsed(totalBytes);
      }

      // Clear persisted dirty data on successful sync
      if (dirtyNotes.current.size === 0) {
        localStorage.removeItem(DIRTY_PERSIST_KEY);
      } else {
        savePersistedDirty([...dirtyNotes.current], noteDataRef.current);
      }

      // Update last sync time
      const now = new Date().toISOString();
      setLastSynced(now);
      localStorage.setItem(LAST_SYNC_KEY, now);
      if (syncState !== "conflict") setSyncState("synced");
    } catch (err) {
      console.error("Sync error:", err);
      setSyncState("error");
    } finally {
      isSyncing.current = false;
    }
  }, [user, setNoteData, syncState]);

  const syncAllRef = useRef(syncAll);
  syncAllRef.current = syncAll;

  // Initial sync on login — gate behind confirmation if first sync with local notes
  useEffect(() => {
    if (user) {
      const noteCount = Object.keys(noteDataRef.current).length;
      if (!lastSyncedRef.current && noteCount > 0) {
        setPendingFirstSync({ noteCount });
        return;
      }
      const t = setTimeout(() => syncAllRef.current(), 500);
      return () => clearTimeout(t);
    } else {
      setSyncState("idle");
      dirtyNotes.current.clear();
      deletedNotes.current.clear();
      setPendingFirstSync(null);
    }
  }, [user?.id]);

  // Sync when tab becomes visible
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

  // Online/offline detection
  useEffect(() => {
    if (!user) return;
    const onOnline = () => {
      syncAllRef.current();
    };
    const onOffline = () => {
      setSyncState("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) setSyncState("offline");
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [user?.id]);

  // Realtime Broadcast: receive note changes from other devices instantly
  useEffect(() => {
    if (!user) return;
    if (!supabase) return;

    const channel = supabase
      .channel(`notes-sync:${user.id}`)
      .on("broadcast", { event: "note_upsert" }, ({ payload }) => {
        // Validate payload
        if (
          !payload?.id ||
          typeof payload.id !== "string" ||
          typeof payload.title !== "string" ||
          typeof payload.content !== "object"
        ) {
          return;
        }
        if (dirtyNotes.current.has(payload.id)) return;
        remoteUpdateIds.current.set(payload.id, Date.now());
        setNoteData((prev) => ({ ...prev, [payload.id]: payload }));
      })
      .on("broadcast", { event: "note_delete" }, ({ payload }) => {
        if (!payload?.id || typeof payload.id !== "string") return;
        if (dirtyNotes.current.has(payload.id)) return;
        remoteUpdateIds.current.set(payload.id, Date.now());
        setNoteData((prev) => {
          const next = { ...prev };
          delete next[payload.id];
          return next;
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
        } else {
          channelRef.current = null;
        }
      });

    return () => {
      channelRef.current = null;
      supabase?.removeChannel(channel);
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

  // Auto-dismiss conflict toast after 8s
  useEffect(() => {
    if (!conflictToast) return;
    const t = setTimeout(() => setConflictToast(null), 8000);
    return () => clearTimeout(t);
  }, [conflictToast]);

  const confirmFirstSync = useCallback(() => {
    setPendingFirstSync(null);
    setTimeout(() => syncAllRef.current(), 100);
  }, []);

  const cancelFirstSync = useCallback(() => {
    setPendingFirstSync(null);
  }, []);

  return {
    syncState,
    lastSynced,
    storageUsed,
    storageLimitMB: profile?.storage_limit_bytes
      ? profile.storage_limit_bytes / (1024 * 1024)
      : null,
    syncAll,
    conflictToast,
    dismissConflictToast: useCallback(() => setConflictToast(null), []),
    pendingFirstSync,
    confirmFirstSync,
    cancelFirstSync,
  };
}
