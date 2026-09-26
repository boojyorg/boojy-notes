import { type MutableRefObject, useCallback, useEffect, useRef } from "react";
import { getAPI } from "../services/apiProvider";
import type { ToastItem, ToastKind, ToastOptions } from "./useToast";

/** One save-point receipt at a time: a newer one takes the older one's place. */
export const SAVE_POINT_TOAST = "save-point";

interface HistoryAPI {
  savePoint: (
    noteId: string,
  ) => Promise<{ ok: true; id: string } | { ok: false; reason: "off" | "nothing" | "unknown" }>;
  name: (noteId: string, versionId: string, name: string) => Promise<boolean>;
  leave: (noteId: string) => Promise<void>;
}

interface Options {
  activeNote: string | null;
  activeNoteRef: MutableRefObject<string | null>;
  flushToDisk: (latest?: unknown, extraDirtyIds?: string[]) => Promise<void>;
  noteDataRef: MutableRefObject<unknown>;
  unflushedNotes: MutableRefObject<Set<string>>;
  toasts: ToastItem[];
  showToast: (message: string, kind?: ToastKind, options?: ToastOptions) => number;
  updateToast: (id: number, patch: Partial<ToastItem>) => void;
  holdToast: (id: number, held: boolean) => void;
}

const historyAPI = (): HistoryAPI | undefined =>
  (getAPI() as { history?: HistoryAPI } | undefined)?.history;

/**
 * ⌘S: the open note, as its file holds it once pending edits are written, as a
 * save point in its history, answered by a receipt whose words can be clicked
 * to name it. ⌘S again while that receipt shows opens its name field. Leaving a
 * note tells the history its writing session is over.
 */
export function useSavePoint({
  activeNote,
  activeNoteRef,
  flushToDisk,
  noteDataRef,
  unflushedNotes,
  toasts,
  showToast,
  updateToast,
  holdToast,
}: Options) {
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const left = useRef<string | null>(null);
  useEffect(() => {
    if (left.current && left.current !== activeNote) historyAPI()?.leave(left.current);
    left.current = activeNote;
  }, [activeNote]);

  return useCallback(async () => {
    const api = historyAPI();
    const noteId = activeNoteRef.current;
    if (!api || !noteId) return;
    const open = toastsRef.current.find(
      (t) => t.key === SAVE_POINT_TOAST && t.nameable && !t.editing,
    );
    if (open) {
      holdToast(open.id, true);
      updateToast(open.id, { editing: true });
      return;
    }
    await flushToDisk(noteDataRef.current, [...unflushedNotes.current]);
    const result = await api.savePoint(noteId);
    const options = { icon: "history", key: SAVE_POINT_TOAST };
    if (result.ok) {
      showToast("Save point", "done", {
        ...options,
        nameable: { onCommit: (name) => api.name(noteId, result.id, name) },
      });
    } else if (result.reason === "nothing") {
      showToast("Nothing new since the last save point", "done", options);
    } else if (result.reason === "off") {
      showToast("History is off for this note", "done", options);
    }
  }, [activeNoteRef, flushToDisk, noteDataRef, unflushedNotes, showToast, updateToast, holdToast]);
}
