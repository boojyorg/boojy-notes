import { createContext, useState, useEffect, useContext, useMemo, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { usePanelResize } from "../hooks/usePanelResize";

const LayoutContext = createContext(null);

export function LayoutProvider({ children }) {
  const { theme, isDark } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [rightPanel, setRightPanel] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [rightPanelWidth, setRightPanelWidth] = useState(220);

  const [chromeBg, setChromeBg] = useState(theme.BG.dark);
  const [editorBg, setEditorBg] = useState(theme.BG.editor);
  const [accentColor, setAccentColor] = useState(theme.ACCENT.primary);
  const [activeTabBg, setActiveTabBg] = useState(isDark ? "#1C1C20" : "#e2e6f2");
  const [tabFlip, setTabFlip] = useState(false);
  const [selectionStyle, setSelectionStyle] = useState("B");
  const [topBarEdge, setTopBarEdge] = useState("B");
  const [createBtnStyle, setCreateBtnStyle] = useState("A");

  // Theme-driven color reset
  useEffect(() => {
    setChromeBg(theme.BG.dark);
    setEditorBg(theme.BG.editor);
    setAccentColor(theme.ACCENT.primary);
    setActiveTabBg(isDark ? "#1C1C20" : "#e2e6f2");
  }, [isDark, theme.BG.dark, theme.BG.editor, theme.ACCENT.primary]);

  const sidebarHandles = useRef([]);
  const rightPanelHandles = useRef([]);

  const { isDragging, startDrag, startRightDrag } = usePanelResize({
    sidebarHandles,
    rightPanelHandles,
    setSidebarWidth,
    setRightPanelWidth,
    chromeBg,
  });

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      rightPanel,
      setRightPanel,
      sidebarWidth,
      setSidebarWidth,
      rightPanelWidth,
      setRightPanelWidth,
      chromeBg,
      setChromeBg,
      editorBg,
      setEditorBg,
      accentColor,
      setAccentColor,
      activeTabBg,
      setActiveTabBg,
      tabFlip,
      setTabFlip,
      selectionStyle,
      setSelectionStyle,
      topBarEdge,
      setTopBarEdge,
      createBtnStyle,
      setCreateBtnStyle,
      sidebarHandles,
      rightPanelHandles,
      isDragging,
      startDrag,
      startRightDrag,
    }),
    [
      collapsed,
      rightPanel,
      sidebarWidth,
      rightPanelWidth,
      chromeBg,
      editorBg,
      accentColor,
      activeTabBg,
      tabFlip,
      selectionStyle,
      topBarEdge,
      createBtnStyle,
      isDragging,
      startDrag,
      startRightDrag,
    ],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
  return ctx;
}
