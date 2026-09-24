import { createContext, useState, useContext, useMemo, useRef, useCallback } from "react";
import { useTheme } from "../hooks/useTheme";
import { usePanelResize } from "../hooks/usePanelResize";
import { useFullScreen } from "../hooks/useFullScreen";
import { useWindowWidth } from "../hooks/useWindowWidth";
import { SIDEBAR_DEFAULT_W, SIDEBAR_MAX_W, sidebarWidthFor } from "../constants/layout";

const LayoutContext = createContext(null);

export function LayoutProvider({ children }) {
  const { theme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  /**
   * The width the user dragged to is the preference; what is drawn is that
   * width capped by the room the window has beside an editor at its floor
   * (`sidebarWidthFor`). A resize never rewrites the preference, so widening
   * the window gives the dragged width back, as it gives a hidden sidebar
   * back. The drag clamp reads the same cap, so the divider stops where the
   * window would otherwise squeeze the note.
   */
  const [sidebarPrefWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_W);
  const windowWidth = useWindowWidth();
  const sidebarWidth = sidebarWidthFor(sidebarPrefWidth, windowWidth);
  const sidebarMaxWidth = sidebarWidthFor(SIDEBAR_MAX_W, windowWidth);
  const chromeBg = theme.BG.dark;
  const editorBg = theme.BG.editor;
  const accentColor = theme.ACCENT.primary; // marks and fills
  const accentText = theme.ACCENT.text; // accent as ink (search hits)

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

  /**
   * The Markdown view (SourceView): the note shown as its file. App-wide while
   * it is on, so the next note opens in it too; never saved, so every launch
   * starts in the formatted view (2026-09-24, Tyr's call). Only the switch in
   * EditorArea writes it, because the caret's place is read on the way.
   */
  const [sourceView, setSourceView] = useState(false);

  const sidebarHandles = useRef([]);

  const { isDragging, startDrag } = usePanelResize({
    sidebarHandles,
    setSidebarWidth,
    maxWidth: sidebarMaxWidth,
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
      sourceView,
      setSourceView,
      chromeBg,
      editorBg,
      accentColor,
      accentText,
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
      sourceView,
      chromeBg,
      editorBg,
      accentColor,
      accentText,
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
