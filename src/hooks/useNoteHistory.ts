import { useCallback, useEffect, useRef, useState } from "react";
import { emptyHistory, historyOpen, historyTarget, type NoteHistory } from "../utils/noteHistory";

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
  exists,
  resetKey,
}: {
  /** The open note's id or file's key, or null for neither. */
  current: string | null;
  open: (key: string) => void;
  /** Whether a key still names a note or file (one gone is stepped over). */
  exists: (key: string) => boolean;
  resetKey: unknown;
}) {
  const [history, setHistory] = useState<NoteHistory>(emptyHistory);
  const stepping = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger
  useEffect(() => {
    setHistory(emptyHistory());
  }, [resetKey]);

  useEffect(() => {
    if (!current) return;
    if (stepping.current === current) {
      stepping.current = null;
      return;
    }
    setHistory((h) => historyOpen(h, current));
  }, [current]);

  const step = useCallback(
    (dir: -1 | 1) => {
      const i = historyTarget(history, dir, exists);
      if (i < 0) return;
      stepping.current = history.ids[i];
      setHistory({ ...history, at: i });
      open(history.ids[i]);
    },
    [history, exists, open],
  );

  return {
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
