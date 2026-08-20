import { createContext, useState, useEffect, useContext, useMemo, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { usePanelResize } from "../hooks/usePanelResize";
import { useSidebarFits } from "../hooks/useSidebarFits";

const LayoutContext = createContext(null);

export function LayoutProvider({ children }) {
  const { theme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);

  const [chromeBg, setChromeBg] = useState(theme.BG.dark);
  const [editorBg, setEditorBg] = useState(theme.BG.editor);
  const [accentColor, setAccentColor] = useState(theme.ACCENT.primary);
  const [selectionStyle, setSelectionStyle] = useState("B");
  const [topBarEdge, setTopBarEdge] = useState("B");
  const [createBtnStyle, setCreateBtnStyle] = useState("A");

  // Theme-driven color reset
  useEffect(() => {
    setChromeBg(theme.BG.dark);
    setEditorBg(theme.BG.editor);
    setAccentColor(theme.ACCENT.primary);
  }, [theme.BG.dark, theme.BG.editor, theme.ACCENT.primary]);

  /**
   * Geometry only: is there room for the sidebar beside a usable editor?
   * Kept strictly separate from `collapsed`, which is what the user asked for
   * and must never be rewritten by a window resize.
   */
  const sidebarFits = useSidebarFits(sidebarWidth);

  const sidebarHandles = useRef([]);

  const { isDragging, startDrag } = usePanelResize({
    sidebarHandles,
    setSidebarWidth,
    chromeBg,
  });

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      sidebarWidth,
      setSidebarWidth,
      sidebarFits,
      chromeBg,
      setChromeBg,
      editorBg,
      setEditorBg,
      accentColor,
      setAccentColor,
      selectionStyle,
      setSelectionStyle,
      topBarEdge,
      setTopBarEdge,
      createBtnStyle,
      setCreateBtnStyle,
      sidebarHandles,
      isDragging,
      startDrag,
    }),
    [
      collapsed,
      sidebarWidth,
      sidebarFits,
      chromeBg,
      editorBg,
      accentColor,
      selectionStyle,
      topBarEdge,
      createBtnStyle,
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
