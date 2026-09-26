import { useCallback, useEffect, useState } from "react";
import { getAPI } from "../services/apiProvider";
import type { Note } from "../types/notes";

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
}

/**
 * Recently Deleted: the notes the app sent to the Trash in the last 30 days,
 * kept by their history (never a folder in the vault). One comes back where it
 * was, pill-marked in the sidebar; one goes for good after asking, the one
 * delete in the app that cannot be taken back.
 */
export function useRecentlyDeleted({
  notesDir,
  applyExternalNote,
  markNewRows,
  requestConfirm,
}: Options) {
  const [items, setItems] = useState<DeletedNote[]>([]);
  const available = !!api();

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

  const restore = useCallback(
    async (id: string) => {
      const note = await api()?.restoreDeletedNote(id);
      if (!note) return false;
      applyExternalNote(note);
      markNewRows({ notes: [id] });
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

  return { available, items, refresh, restore, purge };
}
