import { useEffect, useRef } from "react";

/** A menu that is open: a closed one's leaving copy (`useExitGhost`) keeps its role for a moment. */
const OPEN_MENU = '[role="menu"]:not(.motion-ghost)';

/**
 * Escape closes a modal surface (Settings, first-run setup, the phone's
 * Settings page). Heard on the document, so it runs before the shell's
 * window listener, and only for an Escape nothing above has taken. A menu
 * opened from inside owns Escape even in the frame before focus reaches it,
 * when its own document listener, added after this one, would hear the key
 * second. `onClose` is read through a ref, so the listener is added once per
 * open and keeps its place before any menu's.
 */
export function useModalEscape(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(OPEN_MENU)) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
}
