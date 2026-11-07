import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyHistory,
  historyJump,
  historyOpen,
  historyTarget,
  type NoteHistory,
} from "../utils/noteHistory";
import type { NotePlace } from "../utils/notePlace";

/**
 * ⌘[ and ⌘] (Alt+← / → off the Mac), and View → Back / Forward: what was
 * opened, in order (`utils/noteHistory.ts`): notes, and files shown in the
 * note's place, each by a key (`fileHistoryKey`), so Back flips from a PDF
 * to the note beside it and back again. It watches what is open rather than
 * each way of opening it (a click, Search, a link, New note), so none is
 * missed; a step it takes itself is not recorded as an opening. A switch of
 * storage location (`resetKey`) starts the list again.
 */
export function useNoteHistory({
  current,
  open,
  restoreHere,
  exists,
  resetKey,
}: {
  /** The open note's id or file's key, or null for neither. */
  current: string | null;
  open: (key: string) => void;
  /** A step between two visits of the note open (a heading link's): put its place back (null: the top). */
  restoreHere: (place: NotePlace | null) => void;
  /** Whether a key still names a note or file (one gone is stepped over). */
  exists: (key: string) => boolean;
  resetKey: unknown;
}) {
  const [history, setHistory] = useState<NoteHistory>(emptyHistory);
  const stepping = useRef<string | null>(null);
  // Each visit's place, by its number: kept as you scroll and click, never
  // state (a scroll must not render the app), memory only like the list.
  const places = useRef(new Map<number, NotePlace>());
  const historyRef = useRef(history);
  historyRef.current = history;
  // A place recorded for the note opening before its visit was added (the
  // editor's effects run before this one), kept for that visit.
  const early = useRef<{ key: string; place: NotePlace } | null>(null);
  // The place Back or Forward is returning to, taken once by the editor.
  const restoring = useRef<{ key: string; place: NotePlace | null } | null>(null);

  // Starts again from what is open: the location arriving at startup comes
  // after the last session's note has opened, and is no reason to forget it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger
  useEffect(() => {
    places.current.clear();
    early.current = null;
    const fresh = current ? historyOpen(emptyHistory(), current) : emptyHistory();
    historyRef.current = fresh;
    setHistory(fresh);
  }, [resetKey]);

  useEffect(() => {
    if (!current) return;
    if (stepping.current === current) {
      stepping.current = null;
      return;
    }
    const before = historyRef.current;
    const next = historyOpen(before, current);
    const e = early.current;
    early.current = null;
    if (next === before) return;
    if (e?.key === current) places.current.set(next.visits[next.at], e.place);
    historyRef.current = next;
    setHistory(next);
  }, [current]);

  const step = useCallback(
    (dir: -1 | 1) => {
      const i = historyTarget(history, dir, exists);
      if (i < 0) return;
      const place = places.current.get(history.visits[i]) ?? null;
      // The same note: nothing opens, so nothing would take a restore or
      // clear the step's guard. The place goes back here and now.
      if (history.ids[i] === history.ids[history.at]) {
        setHistory({ ...history, at: i });
        historyRef.current = { ...history, at: i };
        restoreHere(place);
        return;
      }
      stepping.current = history.ids[i];
      restoring.current = { key: history.ids[i], place };
      setHistory({ ...history, at: i });
      open(history.ids[i]);
    },
    [history, exists, open, restoreHere],
  );

  /**
   * A heading link followed inside the note open: a visit of its own, so Back
   * returns to where the link was. Returns the new visit. The ref moves at once, so the scroll the
   * jump makes is recorded as the new visit's place, never the old one's.
   */
  const jump = useCallback((key: string): number => {
    const next = historyJump(historyRef.current, key);
    historyRef.current = next;
    setHistory(next);
    return next.visits[next.at];
  }, []);

  /** The visit open now: a footnote's ↩ asks whether its jump is still it. */
  const currentVisit = useCallback(() => {
    const h = historyRef.current;
    return h.visits[h.at] ?? -1;
  }, []);

  /**
   * The open visit's place, as the page shows it now. Taken only for the note
   * the list says is open: a scroll the switch to another note fires lands
   * before the list moves on, and must not overwrite the visit being left; it
   * is kept for the new note's visit instead (a heading link's scroll).
   */
  const recordPlace = useCallback((key: string, place: NotePlace | null) => {
    const h = historyRef.current;
    if (h.ids[h.at] !== key) {
      // The note just opened, its visit not yet added: kept for that visit.
      early.current = place ? { key, place } : null;
      return;
    }
    if (place) places.current.set(h.visits[h.at], place);
    // Visits that fell off the list's far end take their places with them.
    if (places.current.size > h.visits.length) {
      const live = new Set(h.visits);
      for (const v of places.current.keys()) if (!live.has(v)) places.current.delete(v);
    }
  }, []);

  /**
   * Whether `key` is opening by Back or Forward, and the place it had then
   * (null when it never left the top): asked once, as the note opens.
   */
  const takeRestore = useCallback((key: string) => {
    const r = restoring.current;
    restoring.current = null;
    return r && r.key === key ? { place: r.place } : null;
  }, []);

  return {
    recordPlace,
    takeRestore,
    jump,
    currentVisit,
    back: useCallback(() => step(-1), [step]),
    forward: useCallback(() => step(1), [step]),
    canBack: historyTarget(history, -1, exists) >= 0,
    canForward: historyTarget(history, 1, exists) >= 0,
  };
}

/** A file's key in the history: kept apart from note ids by its prefix. */
export const fileHistoryKey = (rel: string) => `file:${rel}`;
export const fileFromHistoryKey = (key: string) =>
  key.startsWith("file:") ? key.slice("file:".length) : null;
