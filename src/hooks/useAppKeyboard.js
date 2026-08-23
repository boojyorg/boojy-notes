import { useEffect, useRef } from "react";
import { SCALE_OPTIONS } from "../constants/data";

/**
 * Global keyboard shortcuts for the app shell.
 * Extracted from BoojyNotes.jsx for readability.
 */
export function useAppKeyboard({
  activeNote,
  noteData,
  uiScale,
  settingsOpen,
  overlayOpen,
  blockDrag,
  sidebarDrag,
  titleRef,
  searchInputRef,
  // Actions
  undo,
  redo,
  createNote,
  setSettingsOpen,
  revealSidebar,
  closeOverlay,
  setUiScale,
  cancelBlockDrag,
  cancelSidebarDrag,
}) {
  // Refs for values read inside handler — avoids stale closures
  const activeNoteRef = useRef(activeNote);
  activeNoteRef.current = activeNote;
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const uiScaleRef = useRef(uiScale);
  uiScaleRef.current = uiScale;
  const overlayOpenRef = useRef(overlayOpen);
  overlayOpenRef.current = overlayOpen;

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && blockDrag.current.active) {
        e.preventDefault();
        cancelBlockDrag();
        return;
      }
      if (e.key === "Escape" && sidebarDrag.current.active) {
        e.preventDefault();
        cancelSidebarDrag();
        return;
      }
      if (e.key === "Escape" && settingsOpen) {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }
      // Esc dismisses an open overlay sidebar. Ordered after the drags and
      // Settings, which are more modal than it is, and it is a no-op when the
      // sidebar is in flow — Esc must never hide a sidebar the user can see
      // sitting in the layout.
      if (e.key === "Escape" && overlayOpenRef.current) {
        e.preventDefault();
        closeOverlay();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (mod && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (mod && e.key === "n") {
        e.preventDefault();
        const curActive = activeNoteRef.current;
        const curNoteData = noteDataRef.current;
        if (curActive && curNoteData[curActive]?._draft) {
          if (titleRef.current) {
            titleRef.current.focus();
          }
          return;
        }
        createNote(null);
        return;
      }
      if (mod && e.key === "p") {
        e.preventDefault();
        // Reveal, however the sidebar is currently painted — at narrow widths
        // un-collapsing would leave the search field off-screen.
        revealSidebar();
        setTimeout(() => searchInputRef.current?.focus(), 250);
        return;
      }
      // Zoom shortcuts: Cmd+Plus / Cmd+Minus / Cmd+0
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const cur = uiScaleRef.current;
        const next = SCALE_OPTIONS.find((s) => s > cur);
        if (next) setUiScale(next);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        const cur = uiScaleRef.current;
        const next = [...SCALE_OPTIONS].reverse().find((s) => s < cur);
        if (next) setUiScale(next);
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        setUiScale(100);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen]); // eslint-disable-line react-hooks/exhaustive-deps
}
