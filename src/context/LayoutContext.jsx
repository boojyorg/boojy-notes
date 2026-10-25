import {
  createContext,
  useState,
  useContext,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { useTheme } from "../hooks/useTheme";
import { usePanelResize } from "../hooks/usePanelResize";
import { useFullScreen } from "../hooks/useFullScreen";
import { useWindowWidth } from "../hooks/useWindowWidth";
import { SIDEBAR_DEFAULT_W, SIDEBAR_MAX_W, sidebarWidthFor } from "../constants/layout";
import {
  readMarkdownViewNotes,
  withMarkdownView,
  writeMarkdownViewNotes,
} from "../utils/markdownViewNotes";

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
  const accentColor = theme.ACCENT.primary; // marks and fills

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
   * sidebar is painted: at every width the sidebar pushes the editor, as it
   * does in Apple Notes and Obsidian, and the editor column shrinks. Never an
   * overlay, which would be a second identity for the same panel.
   */
  const sidebarVisible = !collapsed;

  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);

  /** Make the sidebar visible without toggling it away if it already is. */
  const revealSidebar = useCallback(() => setCollapsed(false), []);

  /** The phone's other screen: the note, with Home (the sidebar) put away. */
  const hideSidebar = useCallback(() => setCollapsed(true), []);

  /**
   * The Markdown view (SourceView): the note shown as its file. Per note, and
   * remembered across restarts (`markdownViewNotes`); a new note opens
   * formatted. Read through `useSourceView`. Only the switch in EditorArea
   * turns it on or off, because the caret's place is read on the way; Version
   * History sets it aside while it looks back.
   */
  const [markdownViewNotes, setMarkdownViewNotes] = useState(readMarkdownViewNotes);
  const setNoteSourceView = useCallback(
    (noteId, on) => setMarkdownViewNotes((ids) => withMarkdownView(ids, noteId, on)),
    [],
  );
  useEffect(() => writeMarkdownViewNotes(markdownViewNotes), [markdownViewNotes]);

  const sidebarHandles = useRef([]);

  const { isDragging, startDrag } = usePanelResize({
    sidebarHandles,
    setSidebarWidth,
    maxWidth: sidebarMaxWidth,
    handleActiveBg: theme.sidebarHandle.active,
    handleHoverBg: theme.sidebarHandle.hover,
    handleRestBg: theme.BG.divider,
    sidebarWidth,
  });

  const value = useMemo(
    () => ({
      collapsed,
      sidebarWidth,
      setSidebarWidth,
      sidebarVisible,
      fullScreen,
      toggleSidebar,
      revealSidebar,
      hideSidebar,
      markdownViewNotes,
      setNoteSourceView,
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
      hideSidebar,
      markdownViewNotes,
      setNoteSourceView,
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

/** Whether `noteId` is in the Markdown view, and the switch for it. */
export function useSourceView(noteId) {
  const { markdownViewNotes, setNoteSourceView } = useLayout();
  const on = !!noteId && markdownViewNotes.includes(noteId);
  const setOn = useCallback(
    (next) => {
      if (noteId) setNoteSourceView(noteId, next);
    },
    [noteId, setNoteSourceView],
  );
  return [on, setOn];
}
