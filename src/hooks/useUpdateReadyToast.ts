import { useEffect, useRef } from "react";
import { useSettings } from "../context/SettingsContext";
import type { ToastKind, ToastOptions } from "./useToast";

interface UpdateReadyDeps {
  showToast: (message: string, kind?: ToastKind, options?: ToastOptions) => void;
  /** Resolves false while some note's edits could not be written. */
  flushAll: () => Promise<boolean | undefined>;
}

/**
 * An update that has downloaded says so once, quietly, with Restart beside
 * it: the only other way in was Settings → Updates. Left alone it installs
 * when the app quits, as before. Restart writes every pending edit first,
 * and goes ahead only if they all reached disk.
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
    const restart = async () => {
      // A write that failed has said so already; the edits are still only
      // here, so the update waits rather than quit over them.
      if ((await flushAll()) === false) {
        showToast("Restart waited: your edits couldn’t be saved yet", "warning", {
          key: "update",
          action: { label: "Try again", run: restart },
        });
        return;
      }
      await window.electronAPI?.installUpdate?.();
    };
    showToast(`Version ${version} is ready`, "notice", {
      key: "update",
      action: { label: "Restart", run: restart },
    });
  }, [updateStatus, showToast, flushAll]);
}
