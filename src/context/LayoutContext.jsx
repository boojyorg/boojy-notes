import {
  createContext,
  useState,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useTheme } from "../hooks/useTheme";
import { usePanelResize } from "../hooks/usePanelResize";
import { useSidebarFits } from "../hooks/useSidebarFits";

const LayoutContext = createContext(null);

/**
 * Sidebar's own minimum, mirroring the floor `usePanelResize` drags to.
 */
const SIDEBAR_MIN_W = 200;
/**
 * Editor left visible beside an open overlay, so it can never read as a
 * full-screen takeover — the point of the overlay is that the app hasn't
 * changed, only where the sidebar is painted.
 */
const OVERLAY_MIN_PEEK = 120;

/**
 * Scrim behind an open overlay sidebar. Deliberately tunable: "subtle" is the
 * starting judgement (the sidebar should not feel like a heavy modal), and the
 * dev tools (Cmd+.) can flip between these live.
 */
export const OVERLAY_SCRIMS = {
  none: "transparent",
  subtle: "rgba(0,0,0,0.10)",
  dim: "rgba(0,0,0,0.28)",
};

export function LayoutProvider({ children }) {
  const { theme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);

  const [chromeBg, setChromeBg] = useState(theme.BG.dark);
  const [editorBg, setEditorBg] = useState(theme.BG.editor);
  const [accentColor, setAccentColor] = useState(theme.ACCENT.primary);
  const [selectionStyle, setSelectionStyle] = useState("B");
  const [overlayScrim, setOverlayScrim] = useState("subtle");
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

  /*
   * Three questions, three answers — this is the whole point of the split:
   *
   *   collapsed        what the user asked for. Only a toggle writes it.
   *   sidebarFits      whether there is room. Only the window writes it.
   *   overlayOpen      whether the transient panel is showing right now.
   *
   * Presentation is derived from all three, so a resize can never silently
   * rewrite a preference. Widening the window restores exactly the sidebar the
   * user left behind.
   */
  const [overlayOpen, setOverlayOpen] = useState(false);
  const sidebarOverlay = !sidebarFits;
  const sidebarInFlow = sidebarFits && !collapsed;
  const sidebarVisible = sidebarOverlay ? overlayOpen : !collapsed;

  // An overlay left open when the window widens has nothing to overlay; drop it
  // so the state can't come back on the next narrowing.
  useEffect(() => {
    if (sidebarFits) setOverlayOpen(false);
  }, [sidebarFits]);

  /** One toggle, one meaning: show or hide the sidebar, however it's painted. */
  const toggleSidebar = useCallback(() => {
    if (sidebarOverlay) setOverlayOpen((o) => !o);
    else setCollapsed((c) => !c);
  }, [sidebarOverlay]);

  /** Make the sidebar visible without toggling it away if it already is. */
  const revealSidebar = useCallback(() => {
    if (sidebarOverlay) setOverlayOpen(true);
    else setCollapsed(false);
  }, [sidebarOverlay]);

  const closeOverlay = useCallback(() => setOverlayOpen(false), []);

  /**
   * Overlay width preserves whatever width the user dragged the sidebar to,
   * but can't grow past the viewport minus a strip of editor. Pure CSS so a
   * window resize doesn't have to re-render anything to stay correct.
   */
  const overlayWidth = `max(${SIDEBAR_MIN_W}px, min(${sidebarWidth}px, calc(100vw - ${OVERLAY_MIN_PEEK}px)))`;

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
      sidebarOverlay,
      sidebarInFlow,
      sidebarVisible,
      overlayOpen,
      overlayWidth,
      toggleSidebar,
      revealSidebar,
      closeOverlay,
      overlayScrim,
      setOverlayScrim,
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
      sidebarOverlay,
      sidebarInFlow,
      sidebarVisible,
      overlayOpen,
      overlayWidth,
      toggleSidebar,
      revealSidebar,
      closeOverlay,
      overlayScrim,
      setOverlayScrim,
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
