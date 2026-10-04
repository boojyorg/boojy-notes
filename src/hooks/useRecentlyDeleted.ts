import { useCallback, useEffect, useRef, useState } from "react";
import { getAPI } from "../services/apiProvider";
import type { Note } from "../types/notes";
import { markdownToBlocks } from "../utils/markdown";

/** A deleted note on screen, read-only, before it comes back. */
export interface DeletedPreview {
  item: DeletedNote;
  blocks: { id: string; type: string; [key: string]: unknown }[];
}

export interface DeletedNote {
  id: string;
  name: string;
  /** The folder it was in, vault-relative; "" at the root. */
  folder: string;
  at: number;
}

type API = NonNullable<Window["electronAPI"]>;
const api = (): API | undefined => {
  const a = getAPI() as Partial<API> | undefined;
  return a?.listDeletedNotes ? (a as API) : undefined;
};

interface Options {
  /** The open storage location: the bin is its own. */
  notesDir: string | null;
  /** A note back from disk joins the notes (useHistory's applyExternalNote). */
  applyExternalNote: (note: Note) => void;
  /** The pill that shows where a note landed (SidebarContext's markNewRows). */
  markNewRows: (rows: { notes: string[] }) => void;
  requestConfirm: (prompt: Record<string, unknown>) => Promise<unknown>;
  /** The list is open: it takes its own Escape. */
  listOpen?: boolean;
}

/**
 * Recently Deleted: the notes the app sent to the Trash in the last 30 days,
 * kept by their history (never a folder in the vault). One comes back where it
 * was, pill-marked in the sidebar; one goes for good after asking, the one
 * delete in the app that cannot be taken back. A click shows one read-only in
 * the note's place (`preview`), from the history store: nothing reaches the
 * vault until it is restored.
 */
export function useRecentlyDeleted({
  notesDir,
  applyExternalNote,
  markNewRows,
  requestConfirm,
  listOpen = false,
}: Options) {
  const [items, setItems] = useState<DeletedNote[]>([]);
  const [preview, setPreview] = useState<DeletedPreview | null>(null);
  /** A key that would edit the note on screen asked what to do. */
  const [ask, setAsk] = useState(false);
  const available = !!api();
  const viewSeq = useRef(0);

  const refresh = useCallback(async () => {
    const a = api();
    if (!a) return;
    setItems(await a.listDeletedNotes());
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new storage location has its own bin
  useEffect(() => {
    refresh();
    return api()?.onDeletedNotesChanged(refresh);
  }, [refresh, notesDir]);

  const view = useCallback(async (item: DeletedNote) => {
    const seq = ++viewSeq.current;
    const text = await api()?.readDeletedNote(item.id);
    if (seq !== viewSeq.current || text == null) return;
    setAsk(false);
    setPreview({ item, blocks: markdownToBlocks(text) as DeletedPreview["blocks"] });
  }, []);

  const closePreview = useCallback(() => {
    viewSeq.current++;
    setAsk(false);
    setPreview(null);
  }, []);

  // Escape closes the note on screen from anywhere while the list is shut (the
  // list takes its own), the question first if it is up. On the document,
  // before the shell's window listener, which reads defaultPrevented.
  useEffect(() => {
    if (!preview || listOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (ask) setAsk(false);
      else closePreview();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [preview, listOpen, ask, closePreview]);

  // A new storage location has its own bin; a note restored or deleted for
  // good is no longer one to look at.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the location is the trigger
  useEffect(() => closePreview(), [notesDir, closePreview]);
  useEffect(() => {
    setPreview((p) => (p && !items.some((i) => i.id === p.item.id) ? null : p));
  }, [items]);

  const restore = useCallback(
    async (id: string) => {
      const note = await api()?.restoreDeletedNote(id);
      if (!note) return false;
      applyExternalNote(note);
      markNewRows({ notes: [id] });
      setPreview((p) => (p?.item.id === id ? null : p));
      setAsk(false);
      return true;
    },
    [applyExternalNote, markNewRows],
  );

  const purge = useCallback(
    async (item: DeletedNote) => {
      const sure = await requestConfirm({
        title: `Delete “${item.name || "Untitled"}” permanently?`,
        message: "This can’t be undone.",
        confirmLabel: "Delete",
        danger: true,
      });
      if (sure !== true) return;
      await api()?.purgeDeletedNote(item.id);
    },
    [requestConfirm],
  );

  return { available, items, refresh, restore, purge, preview, view, closePreview, ask, setAsk };
}
