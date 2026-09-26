import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { getAPI } from "../services/apiProvider";
import type { HistoryVersion } from "../types/global";
import { markdownToBlocks } from "../utils/markdown";
import type { ToastKind, ToastOptions } from "./useToast";

type Block = { id: string; type: string; text?: string; [key: string]: unknown };
type NoteMap = Record<string, { content: { blocks: Block[] }; [key: string]: unknown }>;

type HistoryAPI = NonNullable<NonNullable<Window["electronAPI"]>["history"]>;
const historyAPI = (): HistoryAPI | undefined =>
  (getAPI() as { history?: HistoryAPI } | undefined)?.history;

/** What a version is called: its name, else what made it. */
export function versionLabel(v: Pick<HistoryVersion, "kind" | "name" | "reason">): string {
  if (v.name) return v.name;
  if (v.kind === "point") return "Save point";
  return v.reason || "Autosave";
}

export interface VersionHistoryState {
  /** The note whose history is open, in the list or on screen. */
  noteId: string | null;
  listOpen: boolean;
  versions: HistoryVersion[];
  off: boolean;
  /** The version shown in the note, read-only; null is Now. */
  selected: string | null;
  past: { id: string; blocks: Block[] } | null;
  /** Typing into the past asked what to do. */
  ask: boolean;
}

const CLOSED: VersionHistoryState = {
  noteId: null,
  listOpen: false,
  versions: [],
  off: false,
  selected: null,
  past: null,
  ask: false,
};

interface Options {
  activeNote: string | null;
  noteDataRef: MutableRefObject<NoteMap>;
  unflushedNotes: MutableRefObject<Set<string>>;
  flushToDisk: (latest?: unknown, extraDirtyIds?: string[]) => Promise<void>;
  commitNoteData: (updater: (prev: NoteMap) => NoteMap) => void;
  syncGeneration: MutableRefObject<number>;
  sourceView: boolean;
  setSourceView: (on: boolean) => void;
  showToast: (message: string, kind?: ToastKind, options?: ToastOptions) => number;
  requestConfirm: (prompt: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Version History: the list under the note's ···, a version shown read-only in
 * the note while it is chosen, and what the list does (restore, name, delete,
 * turn history off). Closing it, Escape, or opening another note is Now again;
 * hiding the list keeps the version on screen, with the chrome's pill as the
 * way back.
 */
export function useVersionHistory({
  activeNote,
  noteDataRef,
  unflushedNotes,
  flushToDisk,
  commitNoteData,
  syncGeneration,
  sourceView,
  setSourceView,
  showToast,
  requestConfirm,
}: Options) {
  const [state, setState] = useState<VersionHistoryState>(CLOSED);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The Markdown view is off while the past is looked at, and back after.
  const hadSourceView = useRef(false);
  const readSeq = useRef(0);
  const [hour12, setHour12] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    historyAPI()
      ?.clock24h()
      .then((forced) => setHour12(forced ? false : undefined))
      .catch(() => {});
  }, []);

  const load = useCallback(async (noteId: string) => {
    const api = historyAPI();
    if (!api) return;
    const { versions, off } = await api.list(noteId);
    setState((s) => (s.noteId === noteId ? { ...s, versions, off } : s));
  }, []);

  const close = useCallback(() => {
    readSeq.current++;
    if (stateRef.current.noteId && hadSourceView.current) setSourceView(true);
    hadSourceView.current = false;
    setState(CLOSED);
  }, [setSourceView]);

  const open = useCallback(async () => {
    const noteId = activeNote;
    if (!noteId || !historyAPI()) return;
    // The list shows what the file holds, so pending edits are written first.
    await flushToDisk(noteDataRef.current, [...unflushedNotes.current]);
    if (sourceView && stateRef.current.noteId === null) {
      hadSourceView.current = true;
      setSourceView(false);
    }
    // The list opens with its versions in it: shown empty first, an arrow
    // pressed before they arrived landed on Now (seen under load).
    const api = historyAPI();
    if (!api) return;
    const { versions, off } = await api.list(noteId);
    setState((s) =>
      s.noteId === noteId
        ? { ...s, listOpen: true, versions, off }
        : { ...CLOSED, noteId, listOpen: true, versions, off },
    );
  }, [activeNote, flushToDisk, noteDataRef, unflushedNotes, sourceView, setSourceView]);

  // Escape is Now from anywhere while a version is on screen and the list is
  // hidden (the list takes its own Escape). On the document, before the
  // shell's window listener, which reads defaultPrevented.
  useEffect(() => {
    if (!state.selected || state.listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (stateRef.current.ask) {
        setState((s) => ({ ...s, ask: false }));
      } else close();
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.selected, state.listOpen, close]);

  // Another note, or none: Now again.
  useEffect(() => {
    if (stateRef.current.noteId && stateRef.current.noteId !== activeNote) close();
  }, [activeNote, close]);

  const select = useCallback(async (versionId: string | null) => {
    const { noteId } = stateRef.current;
    const api = historyAPI();
    const seq = ++readSeq.current;
    if (!noteId || !api || versionId === null) {
      setState((s) => ({ ...s, selected: null, past: null, ask: false }));
      return;
    }
    setState((s) => ({ ...s, selected: versionId, ask: false }));
    const text = await api.read(noteId, versionId);
    if (seq !== readSeq.current || text === null) return;
    setState((s) =>
      s.selected === versionId
        ? { ...s, past: { id: versionId, blocks: markdownToBlocks(text) as Block[] } }
        : s,
    );
  }, []);

  const setListOpen = useCallback(
    (listOpen: boolean) => setState((s) => (s.noteId ? { ...s, listOpen, ask: false } : s)),
    [],
  );

  const replaceBlocks = useCallback(
    (noteId: string, blocks: Block[]) => {
      commitNoteData((prev) =>
        prev[noteId]
          ? { ...prev, [noteId]: { ...prev[noteId], content: { ...prev[noteId].content, blocks } } }
          : prev,
      );
      syncGeneration.current++;
    },
    [commitNoteData, syncGeneration],
  );

  /** The version becomes the note; what the note held is kept first, and Undo puts it back. */
  const restore = useCallback(
    async (versionId: string) => {
      const { noteId, versions } = stateRef.current;
      const api = historyAPI();
      const v = versions.find((x) => x.id === versionId);
      if (!noteId || !api || !v) return;
      await flushToDisk(noteDataRef.current, [...unflushedNotes.current]);
      await api.mark(noteId, "Before restore");
      const text = await api.read(noteId, versionId);
      const before = noteDataRef.current[noteId]?.content.blocks;
      if (text === null || !before) return;
      close();
      replaceBlocks(noteId, markdownToBlocks(text) as Block[]);
      showToast(`Restored ${versionLabel(v)}`, "done", {
        icon: "history",
        action: { label: "Undo", run: () => replaceBlocks(noteId, before) },
      });
    },
    [flushToDisk, noteDataRef, unflushedNotes, close, replaceBlocks, showToast],
  );

  const rename = useCallback(
    async (versionId: string, name: string) => {
      const { noteId } = stateRef.current;
      const api = historyAPI();
      if (!noteId || !api) return;
      await api.name(noteId, versionId, name);
      await load(noteId);
    },
    [load],
  );

  const remove = useCallback(
    async (versionId: string) => {
      const { noteId, versions, selected } = stateRef.current;
      const api = historyAPI();
      const index = versions.findIndex((x) => x.id === versionId);
      if (!noteId || !api || index < 0) return;
      const v = versions[index];
      await api.remove(noteId, versionId);
      // Deleting the version on screen moves to the next one down.
      if (selected === versionId) {
        const next = versions[index + 1] ?? versions[index - 1];
        select(next ? next.id : null);
      }
      await load(noteId);
      showToast(`${versionLabel(v)} deleted`, "done", {
        icon: "trash",
        action: {
          label: "Undo",
          run: async () => {
            await api.undelete(noteId, v);
            await load(noteId);
          },
        },
      });
    },
    [load, select, showToast],
  );

  /** The switch: off asks what happens to what was kept; on needs no question. */
  const setOff = useCallback(
    async (off: boolean) => {
      const { noteId, versions } = stateRef.current;
      const api = historyAPI();
      if (!noteId || !api) return;
      if (!off) {
        await api.setOff(noteId, false);
      } else {
        let keep = true;
        if (versions.length > 0) {
          const title = (noteDataRef.current[noteId] as { title?: string } | undefined)?.title;
          const answer = await requestConfirm({
            title: `Stop keeping history for “${title || "Untitled"}”?`,
            message: `No new versions will be saved. What should happen to the ${versions.length} already saved?`,
            altLabel: "Keep Them",
            confirmLabel: "Delete Them",
            danger: true,
          });
          if (answer === false || answer === undefined) return;
          keep = answer === "alt";
        }
        await api.setOff(noteId, true, keep);
        select(null);
      }
      await load(noteId);
    },
    [noteDataRef, requestConfirm, select, load],
  );

  return {
    state,
    hour12,
    open,
    close,
    select,
    setListOpen,
    restore,
    rename,
    remove,
    setOff,
    // The question stands alone: the list steps aside for it.
    setAsk: (ask: boolean) => setState((s) => ({ ...s, ask, listOpen: ask ? false : s.listOpen })),
  };
}
