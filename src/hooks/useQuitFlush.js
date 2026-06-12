import { useEffect } from "react";
import { isElectron } from "../utils/platform";

/**
 * Flushes pending edits to disk before the window closes and on window blur.
 *
 * Typed text sits in two debounces (300ms text-commit + 500ms disk-write), and
 * the main process used to quit without waiting — Cmd+Q within ~1s of typing
 * lost those keystrokes. The main process now holds the window close until the
 * renderer reports the flush done (capped at 2s there, so a hung renderer can't
 * trap the user in the app).
 *
 * Reads from useHistory's noteDataRef, which is updated synchronously on every
 * keystroke — not from React state, which lags during typing.
 */
export function useQuitFlush(flushToDisk, noteDataRef, editedNoteHint, hasPendingFlush) {
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onAppWillClose) return;

    const flushAll = async () => {
      // A pending text commit means the edited note was never marked dirty —
      // pass it explicitly alongside the authoritative data
      const extra =
        hasPendingFlush.current && editedNoteHint.current ? [editedNoteHint.current] : [];
      await flushToDisk(noteDataRef.current, extra);
    };

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
  }, [flushToDisk, noteDataRef, editedNoteHint, hasPendingFlush]);
}
