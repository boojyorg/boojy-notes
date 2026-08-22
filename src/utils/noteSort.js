// @ts-check

/**
 * How note lists are ordered in the sidebar.
 *
 * There is exactly one ordering source: this preference. Drag changes a note's
 * *location*, sort decides *display order* — the manual `noteOrder`/`folderOrder`
 * metadata that used to compete with it is gone.
 *
 * "Most recent" means last opened *in Boojy*, not last modified on disk: nothing
 * currently populates a file mtime (`Note.lastModified` is declared but never
 * written), and stamping the file on open would corrupt the very timestamp a
 * future modified-based sort would want.
 */

import { naturalCompare } from "./sidebarTree";

/** @typedef {import("../types/notes").NoteData} NoteData */
/** @typedef {"recent" | "alpha"} SortMode */

export const SORT_RECENT = /** @type {const} */ ("recent");
export const SORT_ALPHA = /** @type {const} */ ("alpha");

/** First run gets recency; a fresh vault has no opens, so it reads alphabetical. */
export const DEFAULT_SORT_MODE = SORT_RECENT;

/** Menu order, and the source of the labels used in the trigger's accessible name. */
export const SORT_MODES = [
  { id: SORT_RECENT, label: "Most recent" },
  { id: SORT_ALPHA, label: "Alphabetical" },
];

/**
 * @param {unknown} value
 * @returns {value is SortMode}
 */
export function isSortMode(value) {
  return value === SORT_RECENT || value === SORT_ALPHA;
}

/** @param {SortMode} mode */
export function sortModeLabel(mode) {
  return (SORT_MODES.find((m) => m.id === mode) || SORT_MODES[0]).label;
}

/**
 * Build the comparator for a note-id list.
 *
 * Recency runs newest-opened first, then every never-opened note alphabetically
 * behind them. That tail is what makes the first launch after this change look
 * like a clean A→Z list rather than raw membership order — no migration, no
 * invented timestamps.
 *
 * @param {SortMode} mode
 * @param {NoteData} noteData
 * @param {Record<string, number>} lastOpened noteId → epoch ms
 * @returns {(a: string, b: string) => number}
 */
export function compareNotes(mode, noteData, lastOpened) {
  const title = (/** @type {string} */ id) => noteData[id]?.title || "";
  // Titles are filenames, so collisions are rare — but ties must still resolve
  // the same way every render, or the list reshuffles on unrelated state changes.
  const byTitle = (/** @type {string} */ a, /** @type {string} */ b) =>
    naturalCompare(title(a), title(b)) || (a < b ? -1 : a > b ? 1 : 0);

  if (mode === SORT_ALPHA) return byTitle;

  return (a, b) => {
    const ta = lastOpened[a] || 0;
    const tb = lastOpened[b] || 0;
    if (ta && tb) return tb - ta || byTitle(a, b);
    if (ta) return -1;
    if (tb) return 1;
    return byTitle(a, b);
  };
}

/**
 * Sort a list of note ids, returning the *same array reference* when the order
 * is already correct. The sidebar's memo chain compares identities to skip
 * rebuilding the tree, so handing back a fresh array for an unchanged list
 * would quietly defeat it.
 *
 * @param {string[]} ids
 * @param {(a: string, b: string) => number} compare
 * @returns {string[]}
 */
export function sortNoteIds(ids, compare) {
  if (ids.length < 2) return ids;
  const sorted = [...ids].sort(compare);
  for (let i = 0; i < ids.length; i++) {
    if (sorted[i] !== ids[i]) return sorted;
  }
  return ids;
}
