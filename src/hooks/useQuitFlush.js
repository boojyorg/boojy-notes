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
 * `unflushedNotes` is the Set of every note edited since the last quit/blur
 * flush. A single-slot hint loses notes when two panes are edited within one
 * debounce window (the split-pane data-loss bug); the Set keeps them all.
 */
export function useQuitFlush(flushToDisk, noteDataRef, unflushedNotes) {
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onAppWillClose) return;

    const flushAll = async () => {
      // Notes whose edits may not have reached React state were never marked
      // dirty — pass them explicitly alongside the authoritative data.
      // Snapshot-and-clear up front: edits landing mid-flush re-add their note
      // and survive for the next flush. On failure, restore the snapshot.
      const extra = [...unflushedNotes.current];
      unflushedNotes.current.clear();
      try {
        await flushToDisk(noteDataRef.current, extra);
      } catch (err) {
        for (const id of extra) unflushedNotes.current.add(id);
        throw err;
      }
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
  }, [flushToDisk, noteDataRef, unflushedNotes]);
}
