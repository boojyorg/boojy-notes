import { useEffect, useRef } from "react";
import { STORAGE_KEY } from "../utils/storage";
import { isNative } from "../utils/platform";

/**
 * Debounced localStorage persistence for UI state and note data.
 * Extracted from BoojyNotes.jsx for readability.
 */
export function useAppPersistence({ activeNote, expanded, noteData, customFolders, showToast }) {
  // Persist UI state (active note, expanded folders). Older builds also stored
  // `tabs` and `splitState` here — those keys are no longer written; the read
  // side (useActiveNote) still understands them for migration. A note opened
  // from outside every location is the session's only: a restart opens the
  // location's note that was open before it.
  const lastLocationNote = useRef(activeNote);
  if (!noteData?.[activeNote]?.outside) lastLocationNote.current = activeNote;
  const savedNote = lastLocationNote.current;
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("boojy-ui-state", JSON.stringify({ activeNote: savedNote, expanded }));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [savedNote, expanded]);

  // Persist full note data to localStorage (web only)
  useEffect(() => {
    if (isNative) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ noteData, activeNote, expanded, customFolders }),
        );
      } catch {
        showToast("Failed to save — storage may be full", "warning");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [noteData, activeNote, expanded, customFolders]);

  // Safety net: flush noteData to localStorage on page unload (web only)
  const beforeunloadDataRef = useRef({ noteData, activeNote, expanded, customFolders });
  beforeunloadDataRef.current = { noteData, activeNote, expanded, customFolders };

  useEffect(() => {
    if (isNative) return;
    const flush = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(beforeunloadDataRef.current));
      } catch {}
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);
}
