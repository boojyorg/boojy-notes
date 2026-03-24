import { createContext, useContext, useMemo } from "react";

/**
 * EditorContext holds STABLE editor values — refs and callbacks that never
 * change reference between renders. This lets us remove ~35 props from
 * EditorArea without breaking its custom memo comparator (which only checks
 * reactive values like toolbarState, linkPopover, etc.).
 *
 * Each pane provides its own EditorContext (split mode creates one per pane).
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
