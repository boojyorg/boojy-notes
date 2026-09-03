import { createContext, useContext, useMemo } from "react";

/**
 * EditorContext holds the editor's refs and handlers so EditorArea's custom
 * memo comparator only has to look at reactive props (toolbarState,
 * linkPopover, …).
 *
 * THE CONTRACT: the value is frozen at mount (`useMemo(..., [])`). Consumers
 * always see the functions from BoojyNotes' FIRST render. That is only safe
 * because every function passed in reads its inputs through refs
 * (`noteDataRef`, `activeNoteRef`, `blockRefs`, `focusBlockId`, …) or through
 * setters, never through a captured value. A handler that closes over
 * `activeNote` (or any render-bound value) will act on a stale note forever —
 * useBlockDrag did exactly that until 2026-09. If you add a handler here,
 * make it ref-based, or route the changing value as an EditorArea prop.
 */
const EditorContext = createContext(null);

export function EditorProvider({ value, children }) {
  // Memoize so the context reference is stable (prevents consumer re-renders)
  // All fields are refs or useCallback outputs — they don't change between renders
  const stable = useMemo(() => value, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <EditorContext.Provider value={stable}>{children}</EditorContext.Provider>;
}

export function useEditorContext() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditorContext must be used within an EditorProvider");
  return ctx;
}
