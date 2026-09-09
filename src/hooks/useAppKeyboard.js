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
 *
 * The closest active surface owns the key (review 2026-09-07, §1.13, §4.6).
 * This handler is the last to see a keystroke, a bubble-phase listener on the
 * window, and it acts only on a key nobody above it has claimed:
 *
 * - a surface that takes a key prevents its default, and a prevented key is
 *   not the shell's (Escape in a menu, a rename field or the palette used to
 *   also close the overlay sidebar beneath it);
 * - a modal dialog or a menu that holds focus owns every key beneath it, so
 *   no shortcut runs over Settings, a confirm dialog or a context menu
 *   (Cmd+N over Settings made a note behind it, Cmd+K opened the palette on
 *   top of it); each of them closes itself on Escape;
 * - a native text field outside the editor (the palette's field, a rename
 *   field, the find bar) owns its editing keys: Cmd+Z there is the field's
 *   undo, not the note's. The title field and a code block's textarea are
 *   the editor's, so the note's undo stays theirs.
 *
 * A surface that needs to run before this handler listens on its element, on
 * the document, or in the capture phase — never on the window in the bubble
 * phase, where a listener registered after this one runs after it and its
 * preventDefault comes too late.
 */
export function useAppKeyboard({
  activeNote,
  noteData,
  uiScale,
  overlayOpen,
  blockDrag,
  sidebarDrag,
  titleRef,
  // Actions
  undo,
  redo,
  createNote,
  revealSidebar,
  openSearch,
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
    overlayOpen,
    undo,
    redo,
    createNote,
    revealSidebar,
    openSearch,
    closeOverlay,
    setUiScale,
    cancelBlockDrag,
    cancelSidebarDrag,
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: every input is read through `latest` or a stable ref
  useEffect(() => {
    const handler = (e) => {
      const L = latest.current;
      // A drag is pointer-modal: Escape cancels it before anything else.
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
      if (e.defaultPrevented) return;
      const owner = focusOwner();
      if (owner === "modal") return;
      // Esc dismisses an open overlay sidebar. It is a no-op when the sidebar
      // is in flow — Esc must never hide a sidebar the user can see sitting in
      // the layout.
      if (e.key === "Escape" && L.overlayOpen) {
        e.preventDefault();
        L.closeOverlay();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && (key === "z" || key === "y")) {
        if (owner === "field") return;
        e.preventDefault();
        if (key === "z" && !e.shiftKey) L.undo();
        else L.redo();
        return;
      }
      if (mod && key === "n") {
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
      // Search is a palette over the window, so it needs no sidebar. Cmd+P
      // opens it; Cmd+K is the editor's link shortcut (2026-09-09), because
      // Boojy Notes has Search, not a command palette.
      if (mod && key === "p") {
        e.preventDefault();
        L.openSearch?.();
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

/**
 * Which kind of surface owns the keys: "modal" for a dialog or menu (every
 * key is its own), "field" for a native text field outside the editor (its
 * editing keys are its own), null when the shell may act. A modal dialog owns
 * them from the moment it is in the DOM, before its focus trap has placed
 * focus a frame later (a Cmd+N inside that frame made a note behind
 * Settings); a menu owns them while it holds focus.
 */
export function focusOwner() {
  if (document.querySelector('[aria-modal="true"]')) return "modal";
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  if (el.closest('[role="menu"]')) return "modal";
  const tag = el.tagName;
  if ((tag === "INPUT" || tag === "TEXTAREA") && !el.closest("[data-editor]")) return "field";
  return null;
}
