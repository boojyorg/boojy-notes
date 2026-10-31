/**
 * Back and Forward through the notes opened, as a browser's history: a list
 * and a place in it. Opening a note drops everything ahead of the place and
 * adds it; going back or forward only moves the place. A note gone since
 * (deleted, or another storage location) is stepped over, never opened.
 * Held in memory only, so a restart starts empty.
 */

export interface NoteHistory {
  ids: string[];
  /**
   * Each entry's visit, a number no other entry has had: a note opened twice
   * is two visits, each with its own place to come back to (`notePlace.ts`).
   */
  visits: number[];
  /** The place: the index of the open note, or -1 before any. */
  at: number;
  /** The next visit's number. */
  serial: number;
}

/** How many notes back the list reaches. */
export const HISTORY_LIMIT = 50;

export const emptyHistory = (): NoteHistory => ({ ids: [], visits: [], at: -1, serial: 0 });

/** The history with `id` opened: forward dropped, `id` added, the oldest let go past the limit. */
export function historyOpen(h: NoteHistory, id: string): NoteHistory {
  if (h.ids[h.at] === id) return h;
  const ids = [...h.ids.slice(0, h.at + 1), id].slice(-HISTORY_LIMIT);
  const visits = [...h.visits.slice(0, h.at + 1), h.serial].slice(-HISTORY_LIMIT);
  return { ids, visits, at: ids.length - 1, serial: h.serial + 1 };
}

/** The index one step back (-1) or forward (1) that still exists, or -1 for none. */
export function historyTarget(h: NoteHistory, dir: -1 | 1, exists: (id: string) => boolean) {
  for (let i = h.at + dir; i >= 0 && i < h.ids.length; i += dir) {
    if (h.ids[i] !== h.ids[h.at] && exists(h.ids[i])) return i;
  }
  return -1;
}

/**
 * -1 for Back, 1 for Forward, 0 for any other key: ⌘[ / ⌘] on a Mac
 * (Finder's and Safari's), Alt+← / → elsewhere (a browser's). The bracket is
 * read by its physical key too, for layouts where it needs Alt.
 */
export function historyKey(
  e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  mac: boolean,
): -1 | 0 | 1 {
  if (mac) {
    if (!e.metaKey || e.ctrlKey || e.shiftKey) return 0;
    if (e.key === "[" || e.code === "BracketLeft") return -1;
    if (e.key === "]" || e.code === "BracketRight") return 1;
    return 0;
  }
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return 0;
  return e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
}

/** The key `historyKey` takes, as the chrome's chips show it. */
export const historyShortcut = (dir: -1 | 1, mac: boolean) =>
  mac ? (dir < 0 ? "⌘[" : "⌘]") : dir < 0 ? "Alt+←" : "Alt+→";
