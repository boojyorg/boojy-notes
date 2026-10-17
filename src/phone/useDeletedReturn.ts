import { useCallback, useEffect, useRef } from "react";
import { isPhone } from "../utils/platform";

/**
 * Recently Deleted on the phone: a deleted note is looked at on the note's
 * screen, chosen from the list on Home, and leaving it any way (‹, Back, its
 * menu's Close, deleted for good) goes back to Home with the list open again.
 * The list closes with Home, so this remembers the way back; a restore, or
 * another note opened, ends the look without it.
 */
export function useDeletedReturn({
  previewing,
  homeShowing,
  activeNote,
  showHome,
  showNote,
  setListOpen,
  closePreview,
}: {
  /** A deleted note is on screen (useRecentlyDeleted's preview). */
  previewing: boolean;
  homeShowing: boolean;
  activeNote: string | null;
  showHome: () => void;
  showNote: () => void;
  setListOpen: (open: boolean) => void;
  closePreview: () => void;
}) {
  const back = useRef(false);
  const latest = useRef({ showHome, showNote, setListOpen, closePreview });
  latest.current = { showHome, showNote, setListOpen, closePreview };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the open note is the trigger
  useEffect(() => {
    back.current = false;
  }, [activeNote]);

  useEffect(() => {
    if (!isPhone || !back.current) return;
    if (previewing) {
      latest.current.setListOpen(false);
      latest.current.showNote();
    } else {
      back.current = false;
      latest.current.showHome();
      latest.current.setListOpen(true);
    }
  }, [previewing]);

  // Home (the ‹) while a deleted note is on screen ends the look.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Home showing is the trigger
  useEffect(() => {
    if (isPhone && homeShowing && previewing) latest.current.closePreview();
  }, [homeShowing]);

  return {
    /** A row was chosen from the list: the note's screen shows once it is read. */
    chose: useCallback(() => {
      if (isPhone) back.current = true;
    }, []),
    /** A restore opens the note instead; the answer puts the way back if it failed. */
    restoring: useCallback(() => {
      const was = back.current;
      back.current = false;
      return () => {
        back.current = was;
      };
    }, []),
  };
}
