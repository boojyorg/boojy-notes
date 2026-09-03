import { useEffect, useRef } from "react";
import { SCALE_OPTIONS } from "../constants/data";

/**
 * Global keyboard shortcuts for the app shell.
 *
 * The window listener is registered once. Everything it reads — state AND the
 * action callbacks — goes through `latest`, a ref refreshed on every render,
 * so a stale closure can never act on an old note or an old layout. This used
 * to capture the callbacks directly (re-registering only when Settings
 * toggled), and two of them are render-bound: `revealSidebar` closes over
 * whether the sidebar is an overlay, and `cancelBlockDrag` used to write to
 * whichever note was active when it was captured (see useBlockDrag).
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
  const latest = useRef(null);
  latest.current = {
    activeNote,
    noteData,
    uiScale,
    settingsOpen,
    overlayOpen,
    undo,
    redo,
    createNote,
    setSettingsOpen,
    revealSidebar,
    closeOverlay,
    setUiScale,
    cancelBlockDrag,
    cancelSidebarDrag,
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: every input is read through `latest` or a stable ref
  useEffect(() => {
    const handler = (e) => {
      const L = latest.current;
      if (e.key === "Escape" && blockDrag.current.active) {
        e.preventDefault();
        L.cancelBlockDrag();
        return;
      }
      if (e.key === "Escape" && sidebarDrag.current.active) {
        e.preventDefault();
        L.cancelSidebarDrag();
        return;
      }
      if (e.key === "Escape" && L.settingsOpen) {
        e.preventDefault();
        L.setSettingsOpen(false);
        return;
      }
      // Esc dismisses an open overlay sidebar. Ordered after the drags and
      // Settings, which are more modal than it is, and it is a no-op when the
      // sidebar is in flow — Esc must never hide a sidebar the user can see
      // sitting in the layout.
      if (e.key === "Escape" && L.overlayOpen) {
        e.preventDefault();
        L.closeOverlay();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        L.undo();
      }
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        L.redo();
      }
      if (mod && e.key === "y") {
        e.preventDefault();
        L.redo();
      }
      if (mod && e.key === "n") {
        e.preventDefault();
        if (L.activeNote && L.noteData[L.activeNote]?._draft) {
          if (titleRef.current) {
            titleRef.current.focus();
          }
          return;
        }
        L.createNote(null);
        return;
      }
      if (mod && e.key === "p") {
        e.preventDefault();
        // Reveal, however the sidebar is currently painted — at narrow widths
        // un-collapsing would leave the search field off-screen.
        L.revealSidebar();
        setTimeout(() => searchInputRef.current?.focus(), 250);
        return;
      }
      // Zoom shortcuts: Cmd+Plus / Cmd+Minus / Cmd+0
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const next = SCALE_OPTIONS.find((s) => s > L.uiScale);
        if (next) L.setUiScale(next);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        const next = [...SCALE_OPTIONS].reverse().find((s) => s < L.uiScale);
        if (next) L.setUiScale(next);
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        L.setUiScale(100);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
