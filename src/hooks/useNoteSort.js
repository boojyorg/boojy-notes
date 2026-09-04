import { useCallback, useState } from "react";
import { DEFAULT_SORT_MODE, isSortMode } from "../utils/noteSort";

/** The chosen sort mode. */
const MODE_KEY = "boojy-note-sort";

const readMode = () => {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return isSortMode(saved) ? saved : DEFAULT_SORT_MODE;
  } catch {
    return DEFAULT_SORT_MODE;
  }
};

/**
 * Owns the sidebar's ordering preference and the in-session "edited at" map
 * that recency mode reads alongside file mtimes.
 *
 * The map is deliberately not persisted: after a restart the file's mtime is
 * the truth, and since the quit flush writes only what actually changed, that
 * mtime is trustworthy. Nothing here is written to the user's files, and
 * nothing here reacts to a note being opened. (The old `boojy-note-opened`
 * key is simply no longer read or written; a stale one on disk is harmless.)
 */
export function useNoteSort() {
  const [sortMode, setSortModeState] = useState(readMode);
  const [editedAt, setEditedAt] = useState({});

  const setSortMode = useCallback((mode) => {
    if (!isSortMode(mode)) return;
    setSortModeState(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* a full or blocked store just loses the preference on reload */
    }
  }, []);

  /** Stamp notes as modified now. Called where a note becomes dirty. */
  const markEdited = useCallback((ids) => {
    if (!ids || ids.length === 0) return;
    const now = Date.now();
    setEditedAt((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = now;
      return next;
    });
  }, []);

  return { sortMode, setSortMode, editedAt, markEdited };
}
