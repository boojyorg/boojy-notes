import { useEffect, useRef } from "react";
import type { OpenRequest } from "../../electron/openRequests";
import type { Note } from "../types/notes";

type Handlers = {
  /** The open storage location's folder. */
  notesDir: string | null;
  /** Switch to a listed location (saving what is pending first); false if it did not. */
  switchVault: (dir: string) => Promise<boolean>;
  /** Take a note outside every location (useFileSystem): its id, or why it could not open. */
  openOutside: (filePath: string) => Promise<{ id?: string; error?: "missing" | "unreadable" }>;
  /** Take a note as the disk holds it (one the window has not met yet). */
  adopt: (note: Note) => void;
  /** Open the note as the sidebar does. */
  openNote: (id: string) => void;
  notify: (message: string, kind: "notice" | "warning") => void;
};

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/**
 * Notes opened from outside the app (electron/openRequests.ts): Finder's Open
 * With, a double-click, a path given at launch. Taken once the notes are
 * read, one at a time in the order they came: a note in another storage
 * location switches to it first, through the switcher's own path, so edits
 * pending in the open one are saved before anything changes; a file in none
 * opens on its own, edited in place (electron/outsideNotes.ts).
 */
export function useOpenRequests(loaded: boolean, handlers: Handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const api = window.electronAPI;
    if (!loaded || !api?.takeOpenRequests) return;
    let chain = Promise.resolve();
    const handle = (request: OpenRequest) => {
      chain = chain.then(() => openOne(request)).catch((err) => console.error("open request", err));
    };
    const openOne = async (request: OpenRequest) => {
      const h = latest.current;
      if (request.kind === "missing") {
        h.notify(`Couldn't open "${fileName(request.path)}": it isn't there any more.`, "warning");
        return;
      }
      if (request.kind === "outside") {
        const opened = await h.openOutside(request.path);
        if (opened.id) latest.current.openNote(opened.id);
        else if (opened.error === "unreadable")
          h.notify(`"${fileName(request.path)}" can't be edited as text.`, "warning");
        else
          h.notify(
            `Couldn't open "${fileName(request.path)}": it isn't there any more.`,
            "warning",
          );
        return;
      }
      if (request.vault !== h.notesDir && !(await h.switchVault(request.vault))) return;
      const found = await api.noteAt(request.rel);
      if (found?.note) latest.current.adopt(found.note);
      if (found) latest.current.openNote(found.id);
      else h.notify(`Couldn't open "${fileName(request.rel)}" as a note.`, "warning");
    };
    // Subscribed before taking: the main process sends nothing until the queue is taken.
    const off = api.onOpenRequest(handle);
    api.takeOpenRequests().then((held) => {
      for (const request of held) handle(request);
    });
    return off;
  }, [loaded]);
}
