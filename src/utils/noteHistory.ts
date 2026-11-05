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
  /**
   * The visits a heading link made inside the note already open: Back and
   * Forward step between them and their neighbour in the same note, which
   * an ordinary reopening never is.
   */
  jumps: number[];
}

/** How many notes back the list reaches. */
export const HISTORY_LIMIT = 50;

export const emptyHistory = (): NoteHistory => ({
  ids: [],
  visits: [],
  at: -1,
  serial: 0,
  jumps: [],
});

function added(h: NoteHistory, id: string, jump: boolean): NoteHistory {
  const ids = [...h.ids.slice(0, h.at + 1), id].slice(-HISTORY_LIMIT);
  const visits = [...h.visits.slice(0, h.at + 1), h.serial].slice(-HISTORY_LIMIT);
  const jumps = [...h.jumps, ...(jump ? [h.serial] : [])].filter((v) => visits.includes(v));
  return { ids, visits, at: ids.length - 1, serial: h.serial + 1, jumps };
}

/** The history with `id` opened: forward dropped, `id` added, the oldest let go past the limit. */
export function historyOpen(h: NoteHistory, id: string): NoteHistory {
  return h.ids[h.at] === id ? h : added(h, id, false);
}

/** The history with a heading link followed inside `id`, the note open: a visit of its own. */
export function historyJump(h: NoteHistory, id: string): NoteHistory {
  return h.ids[h.at] === id ? added(h, id, true) : historyOpen(h, id);
}

/**
 * The index one step back (-1) or forward (1) that still exists, or -1 for
 * none. An entry for the open note is stepped over (a note gone in between
 * left two in a row), unless the later of the two is a heading link's visit.
 */
export function historyTarget(h: NoteHistory, dir: -1 | 1, exists: (id: string) => boolean) {
  for (let i = h.at + dir; i >= 0 && i < h.ids.length; i += dir) {
    if (!exists(h.ids[i])) continue;
    if (h.ids[i] !== h.ids[h.at]) return i;
    if (h.jumps.includes(h.visits[Math.max(i, h.at)])) return i;
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
