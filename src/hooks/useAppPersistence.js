import { useEffect, useRef } from "react";
import { STORAGE_KEY, saveToIDB } from "../utils/storage";
import { isNative } from "../utils/platform";

/**
 * Debounced localStorage persistence for UI state and note data.
 * Extracted from BoojyNotes.jsx for readability.
 */
export function useAppPersistence({
  tabs,
  activeNote,
  expanded,
  splitState,
  noteData,
  customFolders,
  getSplitStateForPersistence,
  showToast,
}) {
  // Persist UI state (tabs, active note, expanded folders)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          "boojy-ui-state",
          JSON.stringify({
            tabs,
            activeNote,
            expanded,
            splitState: getSplitStateForPersistence(),
          }),
        );
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [tabs, activeNote, expanded, splitState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist full note data to localStorage (web only)
  useEffect(() => {
    if (isNative) return;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ noteData, tabs, activeNote, expanded, customFolders }),
        );
      } catch (e) {
        console.warn("Failed to save to localStorage, trying IndexedDB:", e);
        saveToIDB({ noteData, tabs, activeNote, expanded, customFolders }).catch(() => {
          showToast("Failed to save — storage may be full", "warning");
        });
      }
      const dt = performance.now() - t0;
      if (dt > 5)
        console.warn(
          `[perf] localStorage.setItem: ${dt.toFixed(1)}ms (${Object.keys(noteData).length} notes)`,
        );
    }, 2000);
    return () => clearTimeout(timer);
  }, [noteData, tabs, activeNote, expanded, customFolders]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: flush noteData to localStorage on page unload (web only)
  const beforeunloadDataRef = useRef({ noteData, tabs, activeNote, expanded, customFolders });
  beforeunloadDataRef.current = { noteData, tabs, activeNote, expanded, customFolders };

  useEffect(() => {
    if (isNative) return;
    const flush = () => {
      const t0 = performance.now();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(beforeunloadDataRef.current));
      } catch {}
      console.warn(`[perf] beforeunload flush: ${(performance.now() - t0).toFixed(1)}ms`);
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);
}
