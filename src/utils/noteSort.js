// @ts-check

/**
 * How note lists are ordered in the sidebar.
 *
 * There is exactly one ordering source: this preference. Drag changes a note's
 * *location*, sort decides *display order* — the manual `noteOrder`/`folderOrder`
 * metadata that used to compete with it is gone.
 *
 * "Most recent" means **last touched**: the later of when you last opened the
 * note in Boojy and when its file was last modified. Neither half is sufficient
 * on its own. Opening never writes to disk, so mtime alone would ignore reading;
 * and last-opened alone starts empty on an existing vault, which made the two
 * sort modes produce identical lists until you had clicked around — the control
 * looked broken on day one. mtime is what gives a vault meaningful order
 * immediately, and it is the only half that can see an edit made in another app.
 */

import { naturalCompare } from "./sidebarTree";

/** @typedef {import("../types/notes").NoteData} NoteData */
/** @typedef {"recent" | "alpha"} SortMode */

export const SORT_RECENT = /** @type {const} */ ("recent");
export const SORT_ALPHA = /** @type {const} */ ("alpha");

/** First run gets recency; a fresh vault has no opens, so it reads alphabetical. */
export const DEFAULT_SORT_MODE = SORT_RECENT;

/**
 * @param {unknown} value
 * @returns {value is SortMode}
 */
export function isSortMode(value) {
  return value === SORT_RECENT || value === SORT_ALPHA;
}

/**
 * The moment a note was last touched: opened here, or written to on disk,
 * whichever is later. Both are epoch ms, so they compare directly. 0 means the
 * app knows nothing about it — a web note (no filesystem, so no mtime) or one
 * whose file has since vanished — and those sort alphabetically at the back
 * rather than pretending to be ancient.
 *
 * @param {string} id
 * @param {NoteData} noteData
 * @param {Record<string, number>} lastOpened
 * @returns {number}
 */
export function recencyOf(id, noteData, lastOpened) {
  return Math.max(lastOpened[id] || 0, noteData[id]?.lastModified || 0);
}

/**
 * Build the comparator for a note-id list.
 *
 * Recency runs most-recently-touched first, then anything with no timestamp at
 * all alphabetically behind them.
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
    const ta = recencyOf(a, noteData, lastOpened);
    const tb = recencyOf(b, noteData, lastOpened);
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
