import { type MutableRefObject, useCallback, useRef } from "react";
import { getAPI } from "../services/apiProvider";
import type { NoteData } from "../types/notes";
import { editBlocks } from "../utils/editBlocks";
import { footnotesAtBottom } from "../utils/footnoteMove";
import type { ToastKind, ToastOptions } from "./useToast";

/** The safety save kept before the move: its name in the note's history. */
export const MOVE_FOOTNOTES_REASON = "Before moving footnotes";
const NOT_MOVED = "footnotes-not-moved";

type MarkResult = { ok: true } | { ok: false; reason: "off" | "unknown" | "failed" };
interface HistoryAPI {
  mark: (noteId: string, reason: typeof MOVE_FOOTNOTES_REASON) => Promise<MarkResult>;
}
const historyAPI = (): HistoryAPI | undefined =>
  (getAPI() as { history?: HistoryAPI } | undefined)?.history;

interface Options {
  /** The keystroke ref's notes: what the note holds now (useHistory). */
  noteDataRef: MutableRefObject<NoteData>;
  activeNoteRef: MutableRefObject<string | null>;
  /** Writes every pending edit; resolves false when one could not be written (useFileSystem). */
  flushAll: () => Promise<boolean | undefined>;
  commitNoteData: (updater: (prev: NoteData) => NoteData) => void;
  syncGeneration: MutableRefObject<number>;
  showToast: (message: string, kind?: ToastKind, options?: ToastOptions) => number;
}

/** How many times the note may change under the safety save before the move gives up. */
const TRIES = 2;

/**
 * Move footnotes to bottom (`footnotesAtBottom`) for the open note, as one
 * commit, so one undo puts every byte back. The note as its file holds it is
 * kept in its history first, and the move waits for that: pending edits are
 * written, the safety save is asked for and answered, and only then, if the
 * note is the one written (nothing typed or taken from disk meanwhile, else
 * written and kept again), are the blocks moved. A failed write or save
 * refuses with a notice; no history (the phone, history off for the note)
 * leaves undo as the way back; a switch to another note drops it silently.
 */
export function useMoveFootnotes({
  noteDataRef,
  activeNoteRef,
  flushAll,
  commitNoteData,
  syncGeneration,
  showToast,
}: Options) {
  const busy = useRef(false);

  const refuse = useCallback(
    (why: string) => showToast(`Footnotes not moved: ${why}`, "warning", { key: NOT_MOVED }),
    [showToast],
  );

  const canMoveFootnotes = useCallback((): boolean => {
    const noteId = activeNoteRef.current;
    const blocks = noteId ? noteDataRef.current[noteId]?.content?.blocks : undefined;
    return !!blocks && footnotesAtBottom(blocks) !== null;
  }, [activeNoteRef, noteDataRef]);

  const moveFootnotes = useCallback(async (): Promise<void> => {
    const noteId = activeNoteRef.current;
    if (!noteId || busy.current || !canMoveFootnotes()) return;
    busy.current = true;
    try {
      const blocksNow = () => noteDataRef.current[noteId]?.content?.blocks;
      const api = historyAPI();
      let kept = false;
      for (let tries = 0; tries < TRIES && !kept; tries++) {
        const written = await flushAll();
        if (activeNoteRef.current !== noteId) return;
        if (written === false) {
          refuse("the note couldn't be saved first.");
          return;
        }
        if (!api) break;
        const before = blocksNow();
        const result = await api
          .mark(noteId, MOVE_FOOTNOTES_REASON)
          .catch((): MarkResult => ({ ok: false, reason: "failed" }));
        if (activeNoteRef.current !== noteId) return;
        if (!result.ok && result.reason !== "off") {
          refuse("a copy couldn't be kept in its version history first.");
          return;
        }
        // Kept, or history is off: either way the file holds what is moved.
        kept = blocksNow() === before;
      }
      if (api && !kept) {
        refuse("the note kept changing while it was being saved. Try again.");
        return;
      }
      syncGeneration.current++;
      commitNoteData(
        editBlocks(noteId, (b) => {
          const next = footnotesAtBottom(b);
          if (!next) return false;
          b.splice(0, b.length, ...next);
        }),
      );
      showToast("Footnotes moved to the bottom", "done", { key: NOT_MOVED });
    } finally {
      busy.current = false;
    }
  }, [
    activeNoteRef,
    noteDataRef,
    flushAll,
    commitNoteData,
    syncGeneration,
    showToast,
    refuse,
    canMoveFootnotes,
  ]);

  return { moveFootnotes, canMoveFootnotes };
}
