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
  blockDrag,
  sidebarDrag,
  titleRef,
  searchInputRef,
  // Actions
  undo,
  redo,
  createNote,
  setSettingsOpen,
  setCollapsed,
  setUiScale,
  cancelBlockDrag,
  cancelSidebarDrag,
  setDevOverlay,
}) {
  // Refs for values read inside handler — avoids stale closures
  const activeNoteRef = useRef(activeNote);
  activeNoteRef.current = activeNote;
  const noteDataRef = useRef(noteData);
  noteDataRef.current = noteData;
  const uiScaleRef = useRef(uiScale);
  uiScaleRef.current = uiScale;

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
        setCollapsed(false);
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
      if (import.meta.env.DEV && mod && e.key === ".") {
        e.preventDefault();
        setDevOverlay((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen]); // eslint-disable-line react-hooks/exhaustive-deps
}
