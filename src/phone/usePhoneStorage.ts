import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ToastKind, ToastOptions } from "../hooks/useToast";
import { getAPI } from "../services/apiProvider";
import type { LocationRow } from "./locations";

type PhoneAPI = NonNullable<Window["boojyPhoneAPI"]>;
type ShowToast = (message: string, kind?: ToastKind, options?: ToastOptions) => unknown;

const TOAST_KEY = "move-to-folder";
const LOCATION_KEY = "storage-location";
const phoneAPI = () =>
  getAPI() as Partial<Pick<PhoneAPI, "notesFolder" | "moveToFolder" | "locations">>;

/**
 * Where the phone keeps its notes, for Settings: the folder as a person
 * reads it (null inside the app), and "Move to a folder…" while they are
 * inside the app. A folder taken restarts the app into the move; one refused
 * says why. Its own hook, not sync's: where the notes are is true with or
 * without Dropbox. Also the storage locations, for Home's heading: opening or
 * adding one writes the editor's waiting edits, then starts the app again.
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
          if (answer === "in-use")
            showToast("Another storage location keeps its notes in that folder.", "notice", {
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
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const mounted = useRef(true);
  const relist = useCallback(async () => {
    try {
      const rows = await api.locations?.list();
      if (rows && mounted.current) setLocations(rows);
    } catch (error) {
      console.warn("[locations]", error);
    }
  }, [api]);
  useEffect(() => {
    mounted.current = true;
    relist();
    return () => {
      mounted.current = false;
    };
  }, [relist]);

  const restart = useCallback(
    async (start: (saved: () => Promise<unknown>) => Promise<void> | undefined, failed: string) => {
      try {
        await start(async () => flushAll());
        return true;
      } catch (error) {
        showToast(`${failed}: ${(error as Error)?.message ?? error}`, "warning", {
          key: LOCATION_KEY,
        });
        return false;
      }
    },
    [flushAll, showToast],
  );
  const openLocation = useCallback(
    (id: string) => restart((saved) => api.locations?.open(id, saved), "Couldn't switch"),
    [api, restart],
  );
  const addLocation = useCallback(
    (name: string) => restart((saved) => api.locations?.add(name, saved), "Couldn't add it"),
    [api, restart],
  );
  // Neither starts the app again: the list is read afresh, and Home follows.
  const change = useCallback(
    async (work: () => Promise<void> | undefined, failed: string) => {
      try {
        await work();
        return true;
      } catch (error) {
        showToast(`${failed}: ${(error as Error)?.message ?? error}`, "warning", {
          key: LOCATION_KEY,
        });
        return false;
      } finally {
        await relist();
      }
    },
    [relist, showToast],
  );
  const renameLocation = useCallback(
    (id: string, name: string) =>
      change(() => api.locations?.rename(id, name), "Couldn't rename it"),
    [api, change],
  );
  const removeLocation = useCallback(
    (id: string) => change(() => api.locations?.remove(id), "Couldn't remove it"),
    [api, change],
  );

  return useMemo(
    () => ({
      notesFolder: api.notesFolder ?? null,
      moveToFolder,
      locations,
      openLocation,
      addLocation,
      renameLocation,
      removeLocation,
    }),
    [api, moveToFolder, locations, openLocation, addLocation, renameLocation, removeLocation],
  );
}

export type PhoneStorage = ReturnType<typeof usePhoneStorage>;
