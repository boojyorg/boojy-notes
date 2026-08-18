import { useState } from "react";
import { loadFromStorage } from "../utils/storage";

/**
 * The app's navigation state: one active note, nothing else.
 * Opening a note replaces the current one — no tabs, no panes.
 *
 * Migration: earlier versions persisted a split/pane structure (`splitState`)
 * plus a tab list in `boojy-ui-state`. On first load after the upgrade the
 * active pane's note wins, deterministically:
 *   1. splitState.panes[activePaneId].activeNote when present, falling back
 *      through panes in left/top/right/bottom order;
 *   2. the top-level `activeNote` field (what current builds write);
 *   3. the legacy full-storage blob's activeNote (web), if the note exists.
 * Hidden tabs are deliberately dropped — they have no home in this model.
 * The ghost-note guard in BoojyNotes still nulls an id that turns out not to
 * exist once notes finish loading.
 */
export function resolveInitialActiveNote() {
  let ui = null;
  try {
    ui = JSON.parse(localStorage.getItem("boojy-ui-state"));
  } catch {
    // unreadable ui-state — fall through to the legacy blob
  }
  const split = ui?.splitState;
  if (split?.panes) {
    const active = split.panes[split.activePaneId]?.activeNote;
    if (active) return active;
    for (const paneId of ["left", "top", "right", "bottom"]) {
      const fallback = split.panes[paneId]?.activeNote;
      if (fallback) return fallback;
    }
  }
  if (ui?.activeNote) return ui.activeNote;
  const saved = loadFromStorage();
  if (saved?.activeNote && saved.noteData?.[saved.activeNote]) return saved.activeNote;
  return null;
}

export function useActiveNote() {
  const [activeNote, setActiveNote] = useState(resolveInitialActiveNote);
  return { activeNote, setActiveNote };
}
