import { useEffect, useRef } from "react";
import { useSettings } from "../context/SettingsContext";
import type { ToastKind, ToastOptions } from "./useToast";

interface UpdateReadyDeps {
  showToast: (message: string, kind?: ToastKind, options?: ToastOptions) => void;
  flushAll: () => Promise<unknown>;
}

/**
 * An update that has downloaded says so once, quietly, with Restart beside
 * it: the only other way in was Settings → Updates. Left alone it installs
 * when the app quits, as before. Restart writes every pending edit first,
 * then hands over to the updater; the app comes back on the same note.
 */
export function useUpdateReadyToast({ showToast, flushAll }: UpdateReadyDeps) {
  const { updateStatus } = useSettings() as {
    updateStatus: { state: string; version?: string } | null;
  };
  const told = useRef<string | null>(null);

  useEffect(() => {
    if (updateStatus?.state !== "downloaded") return;
    const version = updateStatus.version ?? "";
    if (told.current === version) return;
    told.current = version;
    showToast(`Version ${version} is ready`, "notice", {
      key: "update",
      action: {
        label: "Restart",
        run: async () => {
          await flushAll();
          await window.electronAPI?.installUpdate?.();
        },
      },
    });
  }, [updateStatus, showToast, flushAll]);
}
