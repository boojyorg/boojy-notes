import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { emptyHistory, historyOpen, historyTarget, type NoteHistory } from "../utils/noteHistory";

/**
 * ⌘[ and ⌘] (Alt+← / → off the Mac), and View → Back / Forward: the notes
 * opened, in order (`utils/noteHistory.ts`). It watches the open note rather
 * than each way of opening one (a click, Search, a link, New note), so none
 * is missed; a step it takes itself is not recorded as an opening. A switch of
 * storage location (`resetKey`) starts the list again.
 */
export function useNoteHistory({
  activeNote,
  setActiveNote,
  noteDataRef,
  resetKey,
}: {
  activeNote: string | null;
  setActiveNote: (id: string) => void;
  noteDataRef: MutableRefObject<Record<string, unknown>>;
  resetKey: unknown;
}) {
  const [history, setHistory] = useState<NoteHistory>(emptyHistory);
  const stepping = useRef<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key is the trigger
  useEffect(() => {
    setHistory(emptyHistory());
  }, [resetKey]);

  useEffect(() => {
    if (!activeNote) return;
    if (stepping.current === activeNote) {
      stepping.current = null;
      return;
    }
    setHistory((h) => historyOpen(h, activeNote));
  }, [activeNote]);

  const exists = useCallback((id: string) => !!noteDataRef.current[id], [noteDataRef]);

  const step = useCallback(
    (dir: -1 | 1) => {
      const i = historyTarget(history, dir, exists);
      if (i < 0) return;
      stepping.current = history.ids[i];
      setHistory({ ...history, at: i });
      setActiveNote(history.ids[i]);
    },
    [history, exists, setActiveNote],
  );

  return {
    back: useCallback(() => step(-1), [step]),
    forward: useCallback(() => step(1), [step]),
    canBack: historyTarget(history, -1, exists) >= 0,
    canForward: historyTarget(history, 1, exists) >= 0,
  };
}
