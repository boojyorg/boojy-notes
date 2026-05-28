import { useEffect } from "react";
import { isElectron } from "../utils/platform";
import { getAPI } from "../services/apiProvider";

/**
 * Keeps document.title (and the native window title on Electron) in sync
 * with the active note's title.
 */
export function useDocumentTitle(activeNote, activeNoteTitle) {
  useEffect(() => {
    const title = activeNoteTitle ? activeNoteTitle + " - Boojy Notes" : "Boojy Notes";
    document.title = title;
    if (isElectron) getAPI()?.setWindowTitle(title);
  }, [activeNote, activeNoteTitle]);
}
