import { useMemo, useRef } from "react";
import type { ToastKind, ToastOptions } from "../hooks/useToast";
import { getAPI } from "../services/apiProvider";

type PhoneAPI = NonNullable<Window["boojyPhoneAPI"]>;
type ShowToast = (message: string, kind?: ToastKind, options?: ToastOptions) => unknown;

const TOAST_KEY = "move-to-folder";
const phoneAPI = () => getAPI() as Partial<Pick<PhoneAPI, "notesFolder" | "moveToFolder">>;

/**
 * Where the phone keeps its notes, for Settings: the folder as a person
 * reads it (null inside the app), and "Move to a folder…" while they are
 * inside the app. A folder taken restarts the app into the move; one refused
 * says why. Its own hook, not sync's: where the notes are is true with or
 * without Dropbox.
 */
export function usePhoneStorage({
  showToast,
  flushAll,
}: {
  showToast: ShowToast;
  /** Writes the editor's waiting edits, before a move restarts the app. */
  flushAll: () => unknown;
}) {
  const api = useRef(phoneAPI()).current;
  const move = api.moveToFolder;
  const moveToFolder = useMemo(
    () =>
      move &&
      (async () => {
        try {
          const answer = await move(async () => flushAll());
          if (answer === "not-empty")
            showToast("That folder has files in it. Choose an empty folder.", "notice", {
              key: TOAST_KEY,
            });
          if (answer === "refused")
            showToast("Choose a folder on this phone.", "notice", { key: TOAST_KEY });
        } catch (error) {
          showToast(`Couldn't move your notes: ${(error as Error)?.message ?? error}`, "warning", {
            key: TOAST_KEY,
          });
        }
      }),
    [move, flushAll, showToast],
  );
  return useMemo(
    () => ({ notesFolder: api.notesFolder ?? null, moveToFolder }),
    [api, moveToFolder],
  );
}

export type PhoneStorage = ReturnType<typeof usePhoneStorage>;
