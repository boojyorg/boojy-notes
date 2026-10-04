/**
 * Back and Forward through the notes opened, as a browser's history: a list
 * and a place in it. Opening a note drops everything ahead of the place and
 * adds it; going back or forward only moves the place. A note gone since
 * (deleted, or another storage location) is stepped over, never opened.
 * Held in memory only, so a restart starts empty.
 */

export interface NoteHistory {
  ids: string[];
  /** The place: the index of the open note, or -1 before any. */
  at: number;
}

/** How many notes back the list reaches. */
export const HISTORY_LIMIT = 50;

export const emptyHistory = (): NoteHistory => ({ ids: [], at: -1 });

/** The history with `id` opened: forward dropped, `id` added, the oldest let go past the limit. */
export function historyOpen(h: NoteHistory, id: string): NoteHistory {
  if (h.ids[h.at] === id) return h;
  const ids = [...h.ids.slice(0, h.at + 1), id].slice(-HISTORY_LIMIT);
  return { ids, at: ids.length - 1 };
}

/** The index one step back (-1) or forward (1) that still exists, or -1 for none. */
export function historyTarget(h: NoteHistory, dir: -1 | 1, exists: (id: string) => boolean) {
  for (let i = h.at + dir; i >= 0 && i < h.ids.length; i += dir) {
    if (h.ids[i] !== h.ids[h.at] && exists(h.ids[i])) return i;
  }
  return -1;
}
