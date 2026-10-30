import { useEffect, useRef } from "react";
import type { OpenRequest } from "../../electron/openRequests";

type Handlers = {
  /** The open storage location's folder. */
  notesDir: string | null;
  /** Switch to a listed location (saving what is pending first); false if it did not. */
  switchVault: (dir: string) => Promise<boolean>;
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
 * pending in the open one are saved before anything changes.
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
        h.notify(
          `"${fileName(request.path)}" isn't in one of your storage locations, so Boojy Notes can't open it yet.`,
          "notice",
        );
        return;
      }
      if (request.vault !== h.notesDir && !(await h.switchVault(request.vault))) return;
      const id = await api.noteIdAt(request.rel);
      if (id) latest.current.openNote(id);
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
