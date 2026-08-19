import { useEffect, useRef } from "react";
import { STORAGE_KEY, saveToIDB } from "../utils/storage";
import { isNative } from "../utils/platform";

/**
 * Debounced localStorage persistence for UI state and note data.
 * Extracted from BoojyNotes.jsx for readability.
 */
export function useAppPersistence({ activeNote, expanded, noteData, customFolders, showToast }) {
  // Persist UI state (active note, expanded folders). Older builds also stored
  // `tabs` and `splitState` here — those keys are no longer written; the read
  // side (useActiveNote) still understands them for migration.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("boojy-ui-state", JSON.stringify({ activeNote, expanded }));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [activeNote, expanded]);

  // Persist full note data to localStorage (web only)
  useEffect(() => {
    if (isNative) return;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ noteData, activeNote, expanded, customFolders }),
        );
      } catch (e) {
        console.warn("Failed to save to localStorage, trying IndexedDB:", e);
        saveToIDB({ noteData, activeNote, expanded, customFolders }).catch(() => {
          showToast("Failed to save — storage may be full", "warning");
        });
      }
      const dt = performance.now() - t0;
      if (import.meta.env.DEV && dt > 5)
        console.warn(
          `[perf] localStorage.setItem: ${dt.toFixed(1)}ms (${Object.keys(noteData).length} notes)`,
        );
    }, 2000);
    return () => clearTimeout(timer);
  }, [noteData, activeNote, expanded, customFolders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: flush noteData to localStorage on page unload (web only)
  const beforeunloadDataRef = useRef({ noteData, activeNote, expanded, customFolders });
  beforeunloadDataRef.current = { noteData, activeNote, expanded, customFolders };

  useEffect(() => {
    if (isNative) return;
    const flush = () => {
      const t0 = performance.now();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(beforeunloadDataRef.current));
      } catch {}
      if (import.meta.env.DEV)
        console.warn(`[perf] beforeunload flush: ${(performance.now() - t0).toFixed(1)}ms`);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);
}
