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
 *
 * `unflushedNotes` is the Set of notes whose latest keystrokes may not have
 * reached React state yet (and so were never marked dirty there). More than
 * one note can be edited inside a debounce window (for example, edit then
 * switch notes), so a single-slot hint is not sufficient. Membership is owned
 * by useFileSystem's flush: a note leaves the set only once a write of its
 * newest content has succeeded, so a failed write keeps it, and a note that
 * was persisted and untouched since is not written again here.
 */
export function useQuitFlush(flushToDisk, noteDataRef, unflushedNotes) {
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onAppWillClose) return;

    // Notes whose edits may not have reached React state were never marked
    // dirty — pass them explicitly alongside the authoritative data. The flush
    // removes each one only after its newest content is safely on disk.
    const flushAll = () => flushToDisk(noteDataRef.current, [...unflushedNotes.current]);

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
  }, [flushToDisk, noteDataRef, unflushedNotes]);
}
