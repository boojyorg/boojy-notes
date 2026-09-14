import { createContext, useState, useContext, useMemo, useRef, useCallback } from "react";
import { useTheme } from "../hooks/useTheme";
import { usePanelResize } from "../hooks/usePanelResize";
import { useFullScreen } from "../hooks/useFullScreen";
import { SIDEBAR_DEFAULT_W } from "../constants/layout";

const LayoutContext = createContext(null);

export function LayoutProvider({ children }) {
  const { theme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_W);
  const chromeBg = theme.BG.dark;
  const editorBg = theme.BG.editor;
  const accentColor = theme.ACCENT.primary;

  /**
   * macOS full screen: the traffic lights are gone, so the chrome that clears
   * them (the wordmark, the collapsed control group, the note label behind
   * them) moves back to the ordinary inset. Only the window writes it.
   */
  const fullScreen = useFullScreen();

  /*
   * The sidebar is either in the layout or hidden, and only the user decides
   * which: `collapsed` is written by a toggle and nothing else. The window's
   * width changes how much room the editor has beside it, never where the
   * sidebar is painted. Until 2026-09-14 a narrow window took the sidebar out
   * of the layout and brought it back as an overlay over the note, behind a
   * scrim, with its own open state and a hysteresis band on the threshold; a
   * second identity for the same panel, and the one desktop surface that
   * floated. It is gone: at every width the sidebar pushes the editor, as it
   * does in Apple Notes and Obsidian, and the editor column shrinks.
   */
  const sidebarVisible = !collapsed;

  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);

  /** Make the sidebar visible without toggling it away if it already is. */
  const revealSidebar = useCallback(() => setCollapsed(false), []);

  const sidebarHandles = useRef([]);

  const { isDragging, startDrag } = usePanelResize({
    sidebarHandles,
    setSidebarWidth,
    handleActiveBg: theme.sidebarHandle.active,
  });

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      sidebarWidth,
      setSidebarWidth,
      sidebarVisible,
      fullScreen,
      toggleSidebar,
      revealSidebar,
      chromeBg,
      editorBg,
      accentColor,
      sidebarHandles,
      isDragging,
      startDrag,
    }),
    [
      collapsed,
      sidebarWidth,
      sidebarVisible,
      fullScreen,
      toggleSidebar,
      revealSidebar,
      chromeBg,
      editorBg,
      accentColor,
      isDragging,
      startDrag,
    ],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
  return ctx;
}
