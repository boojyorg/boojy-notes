import { useEffect } from "react";
import { isElectron } from "../utils/platform";

/**
 * Flushes pending edits to disk before the window closes and on window blur.
 *
 * Typed text sits in two debounces (300ms text-commit + 500ms disk-write), so
 * the main process holds the window close until the renderer reports the
 * flush done (capped at 2s there, so a hung renderer can't
 * trap the user in the app).
 *
 * `flushAll` is useFileSystem's: it writes what the keystroke ref holds, not
 * React state, which lags during typing.
 */
export function useQuitFlush(flushAll) {
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onAppWillClose) return;

    const unsubClose = window.electronAPI.onAppWillClose(async () => {
      try {
        await flushAll();
      } catch (err) {
        console.error("useQuitFlush: flush before close failed", err);
      } finally {
        // Always release the close — main's timeout would force it anyway
        window.electronAPI.flushBeforeCloseDone();
      }
    });

    const onBlur = () => {
      flushAll().catch((err) => console.error("useQuitFlush: flush on blur failed", err));
    };
    window.addEventListener("blur", onBlur);

    return () => {
      unsubClose();
      window.removeEventListener("blur", onBlur);
    };
  }, [flushAll]);
}
