import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  useDeferredValue,
  Fragment,
} from "react";
import { useNoteData, useNoteDataActions } from "./context/NoteDataContext";
import { useSettings } from "./context/SettingsContext";
import { useLayout } from "./context/LayoutContext";
import { useSidebar } from "./context/SidebarContext";
import { useOverlay } from "./context/OverlayContext";
import { useSync } from "./hooks/useSync";
import { useFileSystem } from "./hooks/useFileSystem";
import { useNoteNavigation } from "./hooks/useNoteNavigation";
import { useNoteCrud } from "./hooks/useNoteCrud";
import { useBlockOperations } from "./hooks/useBlockOperations";
import { useInlineFormatting } from "./hooks/useInlineFormatting";
import { useBlockDrag } from "./hooks/useBlockDrag";
import { useSidebarDrag } from "./hooks/useSidebarDrag";
import { useMultiSelect } from "./hooks/useMultiSelect";
import { useEditorHandlers } from "./hooks/useEditorHandlers";
import { useTerminal } from "./hooks/useTerminal";
import { useTheme } from "./hooks/useTheme";
import { useSplitView } from "./hooks/useSplitView";
import { useTabDrag } from "./hooks/useTabDrag";
import { loadFromStorage } from "./utils/storage";
import { Z } from "./constants/zIndex";
import { stripMarkdownFormatting } from "./utils/inlineFormatting";
import { blocksToHtml } from "./utils/exportUtils";
import { buildBacklinkIndex, getBacklinksForNote } from "./utils/backlinkIndex";
import { getBlockFromNode, cleanOrphanNodes, placeCaret } from "./utils/domHelpers";
const SettingsModal = React.lazy(() => import("./components/SettingsModal"));
import ContextMenu from "./components/ContextMenu";
import SlashMenu from "./components/SlashMenu";
import WikilinkMenu from "./components/WikilinkMenu";
import TagMenu from "./components/TagMenu";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import { EditorProvider } from "./context/EditorContext";
import EditorArea from "./components/EditorArea";
import PaneContainer from "./components/PaneContainer";
import SplitDivider from "./components/SplitDivider";
import ImageLightbox from "./components/ImageLightbox";
const TerminalPanel = React.lazy(() => import("./components/terminal/TerminalPanel"));
import FloatingActionButton from "./components/mobile/FloatingActionButton";
import MobileToolbar from "./components/mobile/MobileToolbar";
import EditorMoreMenu from "./components/mobile/EditorMoreMenu";
import { useKeyboard } from "./hooks/useKeyboard";
import GlobalStyles from "./components/GlobalStyles";
import Toast from "./components/Toast";
import TitleBar from "./components/TitleBar";
import OnboardingToast from "./components/OnboardingToast";
import PersistenceWarning from "./components/PersistenceWarning";
import FirstSyncModal from "./components/FirstSyncModal";
import ConflictToast from "./components/ConflictToast";
import { useToast } from "./hooks/useToast";
import { useAppKeyboard } from "./hooks/useAppKeyboard";
import { useAppPersistence } from "./hooks/useAppPersistence";
import { isElectron, isNative, isWeb, isCapacitor } from "./utils/platform";
import { getAPI } from "./services/apiProvider";
import { useIsMobile } from "./hooks/useIsMobile";

const DevOverlay = import.meta.env.DEV ? React.lazy(() => import("./components/DevOverlay")) : null;

const EMPTY_FORMATS = {
  bold: false,
  italic: false,
  code: false,
  link: false,
  strikethrough: false,
  highlight: false,
};

export default function BoojyNotes() {
  const { theme } = useTheme();
  const { toasts, showToast, dismissToast } = useToast();
  const isMobile = useIsMobile();
  const mobileKeyboard = useKeyboard();

  // ── Contexts ───────────────────────────────────────────────────────
  const { noteData } = useNoteData();
  const {
    setNoteData,
    syncGeneration,
    activeNoteRef,
    undo,
    redo,
    commitNoteData,
    commitTextChange,
    pushHistory,
    popHistory,
    noteDataRef,
    textOnlyEdit,
    textOnlyEditForEditor,
    editedNoteHint,
  } = useNoteDataActions();

  const {
    settingsOpen,
    setSettingsOpen,
    setSettingsTab,
    uiScale,
    setUiScale,
    user,
    profile,
    aiSettings,
    setAISettings,
    updateAISetting,
  } = useSettings();

  const {
    collapsed,
    setCollapsed,
    rightPanel,
    setRightPanel,
    sidebarWidth,
    rightPanelWidth,
    chromeBg,
    editorBg,
    accentColor,
    activeTabBg,
    tabFlip,
    setTabFlip,
    sidebarHandles,
    rightPanelHandles,
    isDragging,
    startDrag,
    startRightDrag,
  } = useLayout();

  const {
    search,
    setSearch,
    searchInputRef,
    sidebarScrollRef,
    expanded,
    setExpanded,
    customFolders,
    setCustomFolders,
    setTrashedNotes,
    trashedNotesRef,
    sidebarOrder,
    setSidebarOrder,
    setRenamingFolder,
    filteredTree,
    fNotes,
    folderList,
  } = useSidebar();

  const {
    ctxMenu,
    setCtxMenu,
    dragTooltip,
    setDragTooltip,
    dragTooltipCount,
    lightbox,
    setLightbox,
    slashMenu,
    setSlashMenu,
    slashMenuRef,
    wikilinkMenu,
    setWikilinkMenu,
    wikilinkMenuRef,
    tagMenu,
    setTagMenu,
    tagMenuRef,
  } = useOverlay();

  // ── State ──────────────────────────────────────────────────────────
  // Split view state — manages tabs + activeNote per pane
  const initialActiveNote = (() => {
    const ui = (() => {
      try {
        return JSON.parse(localStorage.getItem("boojy-ui-state"));
      } catch {
        return null;
      }
    })();
    if (ui?.activeNote) return ui.activeNote;
    const saved = loadFromStorage();
    return saved?.activeNote && saved.noteData?.[saved.activeNote] ? saved.activeNote : null;
  })();
  const initialTabs = (() => {
    const ui = (() => {
      try {
        return JSON.parse(localStorage.getItem("boojy-ui-state"));
      } catch {
        return null;
      }
    })();
    if (ui?.tabs?.length > 0) return ui.tabs;
    const saved = loadFromStorage();
    if (saved?.tabs) {
      const valid = saved.tabs.filter((id) => saved.noteData?.[id]);
      if (valid.length > 0) return valid;
    }
    return [];
  })();
  const {
    splitState,
    splitStateRef,
    activeNote,
    tabs,
    setActiveNote,
    setTabs,
    activePaneId,
    setActivePaneId,
    setDividerPosition,
    splitPane,
    splitPaneWithNote,
    closeSplit,
    closePaneIfEmpty,
    moveTabToPane,
    insertTabInPane,
    moveTabToPaneAtIndex,
    duplicateTabToPane,
    openNoteInPane,
    removeNoteFromAllPanes,
    getOtherPaneId,
    getSplitStateForPersistence,
    setActiveNoteForPane,
    setTabsForPane,
  } = useSplitView({ initialTabs, initialActiveNote });

  const [editorFadeIn, setEditorFadeIn] = useState(false);
  const [devOverlay, setDevOverlay] = useState(false);

  // Update native window title when active note or its title changes
  const activeNoteTitle = noteData[activeNote]?.title;
  const activeNoteContext = useMemo(() => {
    if (!activeNote || !noteData[activeNote]) return "";
    const n = noteData[activeNote];
    return `# ${n.title}\n\n${(n.content?.blocks || []).map((b) => b.text || "").join("\n")}`;
  }, [activeNote, noteData]);
  useEffect(() => {
    const title = activeNoteTitle ? activeNoteTitle + " - Boojy Notes" : "Boojy Notes";
    document.title = title;
    if (isElectron) getAPI()?.setWindowTitle(title);
  }, [activeNote, activeNoteTitle]);

  const [, forceRender] = useState(0);
  const [toolbarState, setToolbarState] = useState(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // ── Onboarding & persistence warning toasts (web only) ────────────
  const [onboardingToast, setOnboardingToast] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState(false);
  const persistenceShownRef = useRef(false);

  // ── Refs ────────────────────────────────────────────────────────────
  const tabScrollRef = useRef(null);
  const [tabAreaWidth, setTabAreaWidth] = useState(600);
  const blockRefs = useRef({});
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const focusBlockId = useRef(null);
  const focusCursorPos = useRef(null);
  const mouseIsDown = useRef(false);
  const editorScrollRef = useRef(null);
  const splitContainerRef = useRef(null);

  // ── Sync activeNoteRef from context ─────────────────────────────────
  activeNoteRef.current = activeNote;

  // ── External hooks ──────────────────────────────────────────────────
  const {
    syncState,
    lastSynced,
    storageUsed,
    storageLimitMB,
    syncAll,
    conflictToast,
    dismissConflictToast,
    pendingFirstSync,
    confirmFirstSync,
    cancelFirstSync,
  } = useSync(user, profile, noteData, setNoteData, activeNote, editedNoteHint);
  const {
    isElectron: isDesktop,
    notesDir,
    loading: fsLoading,
    changeNotesDir,
  } = useFileSystem(
    noteData,
    setNoteData,
    setCustomFolders,
    trashedNotesRef,
    syncGeneration,
    setSidebarOrder,
    showToast,
  );
  const { toggle, openNote, closeTab, newTabId, closingTabs } = useNoteNavigation({
    activeNote,
    setActiveNote,
    tabs,
    setTabs,
    expanded,
    setExpanded,
  });
  const {
    createNote,
    deleteNote,
    duplicateNote,
    renameFolder,
    deleteFolder,
    restoreNote,
    permanentDeleteNote,
    emptyAllTrash,
    createFolder,
    createDraftNote,
    promoteDraft,
    discardDraft,
  } = useNoteCrud({
    commitNoteData,
    noteDataRef,
    setTabs,
    setActiveNote,
    activeNote,
    setCustomFolders,
    customFolders,
    setExpanded,
    titleRef,
    trashedNotesRef,
    setTrashedNotes,
    setRenamingFolder,
    setSidebarOrder,
    onError: showToast,
  });
  const {
    updateBlockText,
    insertBlockAfter,
    deleteBlock,
    updateBlockProperty,
    insertFileBlock,
    saveAndInsertImage,
    flipCheck,
    registerBlockRef,
    updateCodeText,
    updateCodeLang,
    updateCallout,
    updateTableRows,
    updateBlockIndent,
  } = useBlockOperations({
    commitNoteData,
    commitTextChange,
    blockRefs,
    focusBlockId,
    focusCursorPos,
    onError: showToast,
  });

  // Image selection + lightbox state
  const [selectedImageBlockId, setSelectedImageBlockId] = useState(null);

  // Link popover state
  const [linkPopover, setLinkPopover] = useState(null);
  const openLinkEditor = useCallback(() => {
    if (getLinkContextRef.current) {
      const ctx = getLinkContextRef.current();
      if (ctx) setLinkPopover(ctx);
    }
  }, []);
  const getLinkContextRef = useRef(null);

  const { applyFormat, detectActiveFormats, reReadBlockFromDom, toggleInlineCode, getLinkContext } =
    useInlineFormatting({
      blockRefs,
      editorRef,
      noteDataRef,
      activeNote,
      updateBlockText,
      setToolbarState,
      onOpenLinkEditor: openLinkEditor,
    });
  getLinkContextRef.current = getLinkContext;

  const { blockDrag, handleEditorPointerDown, cancelBlockDrag } = useBlockDrag({
    noteDataRef,
    activeNote,
    setNoteData,
    pushHistory,
    popHistory,
    blockRefs,
    editorRef,
    editorScrollRef,
    accentColor,
    editorBg,
    setDragTooltip,
    dragTooltipCount,
    setToolbarState,
  });
  const multiSelectRef = useRef(null);
  const clearSelectionRef = useRef(null);
  const { sidebarDrag, handleSidebarPointerDown, cancelSidebarDrag } = useSidebarDrag({
    noteDataRef,
    setNoteData,
    expanded,
    setExpanded,
    sidebarOrder,
    setSidebarOrder,
    customFolders,
    sidebarScrollRef,
    accentColor,
    chromeBg,
    setDragTooltip,
    dragTooltipCount,
    selectedNotesRef: multiSelectRef,
    clearSelectionRef: clearSelectionRef,
    splitStateRef,
    splitPaneWithNote,
    openNoteInPane,
    insertTabInPane,
  });
  const { handleTabPointerDown } = useTabDrag({
    splitState,
    splitPaneWithNote,
    moveTabToPane,
    moveTabToPaneAtIndex,
    duplicateTabToPane,
    openNoteInPane,
    setTabsForPane,
    closePaneIfEmpty,
    accentColor,
    chromeBg,
  });
  const {
    handleEditorKeyDown,
    handleEditorInput,
    handleEditorMouseUp,
    handleEditorMouseDown,
    handleEditorFocus,
    handleEditorPaste,
    handleEditorCopy,
    handleEditorDragOver,
    handleEditorDragLeave,
    handleEditorDrop,
    executeSlashCommand,
  } = useEditorHandlers({
    noteDataRef,
    activeNote,
    commitNoteData,
    commitTextChange,
    blockRefs,
    editorRef,
    focusBlockId,
    focusCursorPos,
    slashMenuRef,
    setSlashMenu,
    wikilinkMenuRef,
    setWikilinkMenu,
    tagMenuRef,
    setTagMenu,
    syncGeneration,
    updateBlockText,
    insertBlockAfter,
    deleteBlock,
    saveAndInsertImage,
    insertFileBlock,
    reReadBlockFromDom,
    toggleInlineCode,
    applyFormat,
    mouseIsDown,
    setToolbarState,
    onOpenLinkEditor: openLinkEditor,
    updateBlockIndent,
    onError: showToast,
  });
  const {
    terminals,
    activeTerminalId,
    setActiveTerminalId,
    xtermInstances,
    createTerminal,
    createAITab,
    closeTerminal,
    renameTerminal,
    restartTerminal,
    clearTerminal,
    markExited,
  } = useTerminal();

  const handleAIModelChange = useCallback(
    (model) => updateAISetting("model", model),
    [updateAISetting],
  );

  const handleOpenAISettings = useCallback(() => {
    setSettingsOpen(true);
    setSettingsTab("ai");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleAIContext = useCallback(() => {
    setAISettings((prev) => ({ ...prev, sendContext: !prev.sendContext }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Wire search → clear multi-select
  useEffect(() => {
    if (search && clearSelectionRef.current) clearSelectionRef.current();
  }, [search]);

  const scrollToSearchMatch = useCallback(
    (noteId, matchBlockId) => {
      if (!matchBlockId) return;
      setTimeout(() => {
        const el = blockRefs.current[matchBlockId];
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.background = `${accentColor}18`;
        el.style.borderRadius = "6px";
        el.style.transition = "background 0s";
        setTimeout(() => {
          el.style.transition = "background 0.5s ease-out";
          el.style.background = "transparent";
        }, 1200);
        setTimeout(() => {
          el.style.borderRadius = "";
          el.style.transition = "";
        }, 1700);
      }, 150);
    },
    [accentColor],
  );

  const handleSearchResultOpen = useCallback(
    (noteId, matchBlockId) => {
      openNote(noteId);
      if (matchBlockId) scrollToSearchMatch(noteId, matchBlockId);
    },
    [openNote, scrollToSearchMatch],
  );

  // ── Effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    const api = getAPI();
    if (!api?.readTrash) return;
    if (fsLoading) return;
    (async () => {
      try {
        await api.purgeTrash(null);
        const trashed = await api.readTrash();
        if (trashed && Object.keys(trashed).length > 0) {
          setTrashedNotes(trashed);
        }
      } catch (err) {
        console.error("Failed to load trash", err);
        showToast("Failed to load trash");
      }
    })();
  }, [fsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for menu export/import events
  const handleExportRef = useRef({ pdf: null, docx: null });
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    const cleanups = [];
    if (window.electronAPI.onMenuExport) {
      cleanups.push(
        window.electronAPI.onMenuExport((fmt) => {
          const id = activeNoteRef.current;
          if (!id || !noteDataRef.current[id]) return;
          if (fmt === "pdf") handleExportRef.current.pdf?.(id);
          else if (fmt === "docx") handleExportRef.current.docx?.(id);
        }),
      );
    }
    if (window.electronAPI.onMenuImport) {
      cleanups.push(
        window.electronAPI.onMenuImport((fmt) => {
          if (fmt === "markdown") window.electronAPI.importMarkdown();
          else if (fmt === "html") window.electronAPI.importHtml();
          else if (fmt === "folder") window.electronAPI.importFolder();
        }),
      );
    }
    return () => cleanups.forEach((fn) => fn && fn());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Editor fade-in + title sync (only in single-pane mode)
  useEffect(() => {
    if (splitState.splitMode) return;
    setEditorFadeIn(false);
    setSelectedImageBlockId(null);
    setLightbox(null);
    const t = setTimeout(() => setEditorFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [activeNote, splitState.splitMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (splitState.splitMode) return;
    const title = noteData[activeNote]?.content?.title;
    if (titleRef.current && title !== undefined) {
      if (title === "") {
        titleRef.current.innerHTML = "<br>";
      } else {
        titleRef.current.innerText = title;
      }
    }
  }, [activeNote, syncGeneration.current]); // eslint-disable-line -- only on note switch + external sync, NOT every keystroke

  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTabAreaWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useAppKeyboard({
    activeNote,
    noteData,
    splitState,
    uiScale,
    settingsOpen,
    rightPanel,
    activeTerminalId,
    blockDrag,
    sidebarDrag,
    titleRef,
    searchInputRef,
    undo,
    redo,
    createNote,
    setSettingsOpen,
    setCollapsed,
    setRightPanel,
    setActivePaneId,
    setUiScale,
    setTabFlip,
    splitPane,
    closeSplit,
    createTerminal,
    closeTerminal,
    cancelBlockDrag,
    cancelSidebarDrag,
    setDevOverlay,
  });

  useAppPersistence({
    tabs,
    activeNote,
    expanded,
    splitState,
    noteData,
    customFolders,
    getSplitStateForPersistence,
    showToast,
  });

  useEffect(() => {
    const onBlur = () => {
      if (blockDrag.current.active) cancelBlockDrag();
      if (sidebarDrag.current.active) cancelSidebarDrag();
    };
    const onVisChange = () => {
      if (document.hidden) onBlur();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const api = getAPI();
    if (!api?.readMeta) return;
    if (fsLoading) return;
    const loadMeta = async () => {
      const order = {};
      const rootMeta = await api.readMeta("");
      if (rootMeta) order[""] = rootMeta;
      const allPaths = new Set();
      for (const n of Object.values(noteData)) {
        if (n.folder) allPaths.add(n.folder);
      }
      for (const fp of allPaths) {
        const meta = await api.readMeta(fp);
        if (meta) order[fp] = meta;
      }
      setSidebarOrder(order);
    };
    loadMeta();
  }, [fsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync Capacitor status bar style with theme
  useEffect(() => {
    if (!isCapacitor) return;
    import("@capacitor/status-bar")
      .then(({ StatusBar, Style }) => {
        StatusBar.setStyle({ style: theme.starField ? Style.Dark : Style.Light });
      })
      .catch(() => {});
  }, [theme.starField]);

  // Selection change → floating toolbar (only in single-pane mode)
  useEffect(() => {
    if (splitStateRef.current.splitMode) return;
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) {
        setToolbarState(null);
        return;
      }
      if (!editorRef.current) {
        setToolbarState(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const startBlock =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : range.startContainer;
      if (!editorRef.current.contains(startBlock)) {
        setToolbarState(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const editorRect = editorRef.current.getBoundingClientRect();
      let el = startBlock;
      while (el && el !== editorRef.current) {
        if (el.dataset && el.dataset.blockId) break;
        el = el.parentElement;
      }
      if (!el || el === editorRef.current) {
        setToolbarState(null);
        return;
      }
      setToolbarState({
        top: rect.top - editorRect.top - 44,
        left: rect.left - editorRect.left + rect.width / 2,
      });
    };
    let rafId = null;
    const debouncedSelChange = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        onSelChange();
      });
    };
    document.addEventListener("selectionchange", debouncedSelChange);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("selectionchange", debouncedSelChange);
    };
  }, [activeNote, splitState.splitMode]); // eslint-disable-line react-hooks/exhaustive-deps -- splitStateRef is a stable ref

  // Focus block layout effect (only in single-pane mode)
  useLayoutEffect(() => {
    if (splitState.splitMode) return;
    if (focusBlockId.current) {
      cleanOrphanNodes(editorRef.current);
      const targetId = focusBlockId.current;
      const targetPos = focusCursorPos.current ?? 0;
      focusBlockId.current = null;
      focusCursorPos.current = null;
      const el = blockRefs.current[targetId];
      placeCaret(el, targetPos);
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        const blocks = noteDataRef.current[activeNote]?.content?.blocks;
        if (
          sel.rangeCount &&
          getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)
        )
          return;
        const freshEl = blockRefs.current[targetId];
        if (freshEl) placeCaret(freshEl, targetPos);
      });
      setTimeout(() => {
        const scrollEl = editorScrollRef.current;
        if (!scrollEl) return;
        const blockEl = blockRefs.current[targetId];
        if (!blockEl) return;
        const blockRect = blockEl.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        if (blockRect.bottom === 0) return;
        const threshold = scrollRect.top + scrollRect.height * 0.8;
        if (blockRect.bottom > threshold) {
          const overshoot = blockRect.bottom - threshold;
          scrollEl.scrollBy({ top: overshoot + 40, behavior: "smooth" });
        }
      }, 50);
    }
  });

  // ── Ghost note (draft) effects ────────────────────────────────────────
  const prevNoteIdsRef = useRef(null);
  useEffect(() => {
    if (fsLoading) return;
    if (activeNote && !noteData[activeNote]) {
      setActiveNote(null);
    }
    if (splitState.splitMode) {
      const currentIds = Object.keys(noteData);
      const prevIds = prevNoteIdsRef.current;
      if (prevIds && currentIds.length < prevIds.length) {
        const currentSet = new Set(currentIds);
        for (const [, pane] of Object.entries(splitState.panes)) {
          for (const tabId of pane.tabs) {
            if (!currentSet.has(tabId)) {
              removeNoteFromAllPanes(tabId);
            }
          }
        }
      }
      prevNoteIdsRef.current = currentIds;
    }
  }, [fsLoading, noteData, activeNote]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (fsLoading) return;
    if (activeNote) return;
    createDraftNote();
  }, [activeNote, fsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeNote) return;
    const n = noteData[activeNote];
    if (!n?._draft) return;
    const hasTitle = n.title.trim() !== "";
    const hasContent = n.content?.blocks?.some((b) => (b.text || "").trim() !== "");
    if (hasTitle || hasContent) {
      promoteDraft(activeNote);
    }
  }, [noteData, activeNote]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevActiveRef = useRef(null);
  useEffect(() => {
    const prevId = prevActiveRef.current;
    prevActiveRef.current = activeNote;
    if (prevId && prevId !== activeNote && noteDataRef.current[prevId]?._draft) {
      discardDraft(prevId);
    }
  }, [activeNote]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Onboarding toast (web only) ──────────────────────────────────────
  useEffect(() => {
    if (isNative) return;
    if (user) return;
    const noteCount = Object.keys(noteData).filter((id) => !noteData[id]._draft).length;
    if (noteCount >= 3 && !localStorage.getItem("boojy-onboarding-dismissed")) {
      setOnboardingToast(true);
    }
  }, [noteData, user]);

  useEffect(() => {
    if (!onboardingToast) return;
    const t = setTimeout(() => setOnboardingToast(false), 15000);
    return () => clearTimeout(t);
  }, [onboardingToast]);

  // ── Persistence warning (web only) ───────────────────────────────────
  useEffect(() => {
    if (isNative) return;
    if (user) return;
    if (persistenceShownRef.current) return;
    const noteCount = Object.keys(noteData).filter((id) => !noteData[id]._draft).length;
    if (
      noteCount > 5 &&
      localStorage.getItem("boojy-onboarding-dismissed") &&
      !localStorage.getItem("boojy-persistence-warning-dismissed")
    ) {
      setPersistenceWarning(true);
      persistenceShownRef.current = true;
    }
  }, [noteData, user]);

  // ── Derived data ────────────────────────────────────────────────────
  const note = activeNote ? noteData[activeNote] : null;
  const noteBlocks = note?.content?.blocks;
  const deferredBlocks = useDeferredValue(noteBlocks);
  const { wordCount, charCount, charCountNoSpaces, readingTime } = useMemo(() => {
    if (!deferredBlocks)
      return { wordCount: 0, charCount: 0, charCountNoSpaces: 0, readingTime: 1 };
    const plainText = deferredBlocks
      .filter((b) => b.text)
      .map((b) => stripMarkdownFormatting(b.text))
      .join(" ");
    const wc = plainText.trim() ? plainText.trim().split(/\s+/).filter(Boolean).length : 0;
    return {
      wordCount: wc,
      charCount: plainText.length,
      charCountNoSpaces: plainText.replace(/\s/g, "").length,
      readingTime: Math.max(1, Math.ceil(wc / 200)),
    };
  }, [deferredBlocks]);

  // Note title set for broken wikilink detection
  const lastTitlesKey = useRef("");
  const noteTitlesKey = useMemo(() => {
    if (textOnlyEdit.current) {
      textOnlyEdit.current = false;
      return lastTitlesKey.current;
    }
    const key = Object.values(noteData)
      .map((n) => (n.title || "").trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("\0");
    lastTitlesKey.current = key;
    return key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteData]);
  const noteTitleSet = useMemo(() => new Set(noteTitlesKey.split("\0")), [noteTitlesKey]);

  // Backlink index
  const backlinkIndex = useMemo(
    () => buildBacklinkIndex(noteDataRef.current),
    [noteTitlesKey, activeNote], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const noteTitle = note?.title;
  const currentBacklinks = useMemo(
    () => (noteTitle ? getBacklinksForNote(backlinkIndex, noteTitle) : []),
    [backlinkIndex, noteTitle],
  );

  // Wikilink click handler
  const handleWikilinkClick = useCallback(
    (targetTitle) => {
      const lc = targetTitle.trim().toLowerCase();
      const found = Object.entries(noteDataRef.current).find(
        ([, n]) => (n.title || "").toLowerCase() === lc,
      );
      if (found) {
        openNote(found[0]);
      } else {
        createNote(null, targetTitle);
      }
    },
    [openNote, createNote, noteDataRef],
  );

  const handleWikilinkCmdClick = useCallback(
    (targetTitle) => {
      const lc = targetTitle.trim().toLowerCase();
      const found = Object.entries(noteDataRef.current).find(
        ([, n]) => (n.title || "").toLowerCase() === lc,
      );
      const noteId = found ? found[0] : null;
      if (!noteId) {
        createNote(null, targetTitle);
        return;
      }
      if (splitState.splitMode) {
        const otherPaneId = getOtherPaneId();
        if (otherPaneId) openNoteInPane(noteId, otherPaneId);
      } else {
        splitPaneWithNote("vertical", noteId);
      }
    },
    [
      splitState.splitMode,
      getOtherPaneId,
      openNoteInPane,
      splitPaneWithNote,
      createNote,
      noteDataRef,
    ],
  );

  // Wikilink autocomplete select handler
  const handleWikilinkSelect = useCallback(
    (title) => {
      const menu = wikilinkMenuRef.current;
      if (!menu) return;
      const { noteId, blockIndex } = menu;
      const blocks = noteDataRef.current[noteId]?.content?.blocks;
      if (!blocks || !blocks[blockIndex]) return;
      const oldText = blocks[blockIndex].text || "";
      const match = oldText.match(/\[\[([^\]]*)$/);
      if (match) {
        const newText = oldText.slice(0, match.index) + `[[${title}]]`;
        commitTextChange((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const b = [...n.content.blocks];
          b[blockIndex] = { ...b[blockIndex], text: newText };
          n.content = { ...n.content, blocks: b };
          next[noteId] = n;
          return next;
        });
        syncGeneration.current++;
        focusBlockId.current = blocks[blockIndex].id;
        focusCursorPos.current = newText.length;
      }
      setWikilinkMenu(null);
      handleWikilinkClick(title);
    },
    [
      commitTextChange,
      handleWikilinkClick,
      syncGeneration,
      noteDataRef,
      focusBlockId,
      setWikilinkMenu,
      wikilinkMenuRef,
    ],
  );

  // Tag click handler: sets sidebar search to #tagname
  const handleTagClick = useCallback(
    (tagName) => {
      setSearch(`#${tagName}`);
    },
    [setSearch],
  );

  // Tag autocomplete select handler
  const handleTagSelect = useCallback(
    (tag) => {
      const menu = tagMenuRef.current;
      if (!menu) return;
      const { noteId, blockIndex } = menu;
      const blocks = noteDataRef.current[noteId]?.content?.blocks;
      if (!blocks || !blocks[blockIndex]) return;
      const oldText = blocks[blockIndex].text || "";
      const match = oldText.match(/(^|[\s(])#([a-zA-Z][\w/-]*)$/);
      if (match) {
        const newText = oldText.slice(0, match.index + match[1].length) + `#${tag} `;
        commitTextChange((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const b = [...n.content.blocks];
          b[blockIndex] = { ...b[blockIndex], text: newText };
          n.content = { ...n.content, blocks: b };
          next[noteId] = n;
          return next;
        });
        syncGeneration.current++;
        focusBlockId.current = blocks[blockIndex].id;
        focusCursorPos.current = newText.length;
      }
      setTagMenu(null);
    },
    [commitTextChange, syncGeneration, noteDataRef, focusBlockId, setTagMenu, tagMenuRef],
  );

  // ── Export handlers ─────────────────────────────────────────────────
  const handleExportPdf = useCallback(
    (noteId) => {
      const n = noteData[noteId];
      if (!n || !getAPI()?.exportPdf) return;
      const html = blocksToHtml(n.content.blocks, n.title);
      getAPI().exportPdf({ html, title: n.title });
    },
    [noteData],
  );

  const handleExportDocx = useCallback(
    (noteId) => {
      const n = noteData[noteId];
      if (!n || !getAPI()?.exportDocx) return;
      getAPI().exportDocx({ blocks: n.content.blocks, title: n.title });
    },
    [noteData],
  );
  handleExportRef.current.pdf = handleExportPdf;
  handleExportRef.current.docx = handleExportDocx;

  const handleImportIntoFolder = useCallback((folderId) => {
    if (!getAPI()?.importMarkdown) return;
    getAPI().importMarkdown({ targetFolder: folderId });
  }, []);

  // ── Multi-select ────────────────────────────────────────────────────
  const { selectedNotes, handleNoteClick, clearSelection } = useMultiSelect({
    filteredTree,
    fNotes,
    expanded,
    openNote,
  });

  multiSelectRef.current = selectedNotes;
  clearSelectionRef.current = clearSelection;

  const selectedCount = selectedNotes.size;

  const bulkDeleteNotes = useCallback(
    (ids) => {
      for (const id of ids) deleteNote(id);
      clearSelection();
    },
    [deleteNote, clearSelection],
  );

  const bulkMoveNotes = useCallback(
    (ids, folder) => {
      setNoteData((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          if (next[id]) next[id] = { ...next[id], folder: folder || null };
        }
        return next;
      });
      clearSelection();
    },
    [setNoteData, clearSelection],
  );

  // ── UI helpers ──────────────────────────────────────────────────────
  const syncDotStyle = () => {
    const base = {
      width: 19,
      height: 19,
      borderRadius: "50%",
      background: accentColor,
      border: "none",
      cursor: "pointer",
      position: "relative",
      top: 1,
      transition: "transform 0.15s",
    };
    if (syncState === "syncing" || syncState === "retrying")
      return { ...base, animation: "syncGlow 2s ease-in-out infinite" };
    if (syncState === "error")
      return {
        ...base,
        boxShadow: `0 0 0 2.5px ${theme.BG.dark}, 0 0 0 4.5px ${theme.SEMANTIC.error}`,
      };
    if (syncState === "offline") return { ...base, opacity: 0.4 };
    return base;
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: "100%",
        height: `${10000 / uiScale}vh`,
        background: theme.BG.darkest,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: theme.TEXT.primary,
        overflow: "hidden",
        fontSize: 13,
        transition: `background-color ${theme.transitionMs}ms ease, color ${theme.transitionMs}ms ease`,
      }}
    >
      <a
        href="#main-content"
        style={{
          position: "absolute",
          left: "-9999px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          zIndex: Z.ERROR_BOUNDARY,
        }}
        onFocus={(e) => {
          e.target.style.left = "10px";
          e.target.style.top = "10px";
          e.target.style.width = "auto";
          e.target.style.height = "auto";
        }}
        onBlur={(e) => {
          e.target.style.left = "-9999px";
          e.target.style.width = "1px";
          e.target.style.height = "1px";
        }}
      >
        Skip to content
      </a>

      {isDesktop && <TitleBar activeNote={activeNote} noteData={noteData} chromeBg={chromeBg} />}
      <TopBar
        isMobile={isMobile}
        tabs={tabs}
        activeNote={activeNote}
        noteData={noteData}
        newTabId={newTabId}
        closingTabs={closingTabs}
        setActiveNote={setActiveNote}
        closeTab={closeTab}
        syncState={syncState}
        syncDotStyle={syncDotStyle}
        note={note}
        noteTitle={noteTitle}
        createNote={createNote}
        onMorePress={() => setMoreMenuOpen(true)}
        wordCount={wordCount}
        charCount={charCount}
        charCountNoSpaces={charCountNoSpaces}
        readingTime={readingTime}
        tabScrollRef={tabScrollRef}
        tabAreaWidth={tabAreaWidth}
        splitMode={splitState.splitMode}
        onTabPointerDown={handleTabPointerDown}
        panes={splitState.panes}
        activePaneId={activePaneId}
        dividerPosition={splitState.dividerPosition}
        setActiveNoteForPane={setActiveNoteForPane}
        setActivePaneId={setActivePaneId}
        setTabsForPane={setTabsForPane}
        closePaneIfEmpty={closePaneIfEmpty}
      />

      {/* === MAIN AREA === */}
      <div id="main-content" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar wrapper */}
        <div
          style={
            isMobile
              ? {
                  width: activeNote ? 0 : "100%",
                  minWidth: activeNote ? 0 : "100%",
                  background: chromeBg,
                  display: "flex",
                  flexShrink: 0,
                  overflow: "hidden",
                  position: "relative",
                }
              : {
                  width: collapsed ? 0 : sidebarWidth,
                  minWidth: collapsed ? 0 : sidebarWidth,
                  background: chromeBg,
                  display: "flex",
                  flexShrink: 0,
                  overflow: "hidden",
                  position: "relative",
                  transition: "width 0.2s ease, min-width 0.2s ease",
                }
          }
        >
          <Sidebar
            activeNote={activeNote}
            toggle={toggle}
            openNote={openNote}
            setCtxMenu={setCtxMenu}
            renameFolder={renameFolder}
            createFolder={createFolder}
            createNote={createNote}
            handleSidebarPointerDown={handleSidebarPointerDown}
            emptyAllTrash={emptyAllTrash}
            handleSearchResultOpen={handleSearchResultOpen}
            selectedNotes={selectedNotes}
            handleNoteClick={handleNoteClick}
            clearSelection={clearSelection}
          />
          {isMobile && !activeNote && (
            <FloatingActionButton
              onNewNote={() => createNote(null)}
              onNewFolder={() => createFolder()}
            />
          )}
        </div>

        {/* Sidebar drag handle — desktop only */}
        {!isMobile && (
          <div
            ref={(el) => {
              if (el) sidebarHandles.current[1] = el;
            }}
            onMouseDown={startDrag}
            style={{
              width: 4,
              cursor: "col-resize",
              background: chromeBg,
              borderRight: `1px solid ${theme.BG.divider}`,
              flexShrink: 0,
              transition: "background 0.15s",
            }}
            onMouseEnter={() =>
              sidebarHandles.current.forEach(
                (h) => h && (h.style.background = theme.ACCENT.primary),
              )
            }
            onMouseLeave={() => {
              if (!isDragging.current)
                sidebarHandles.current.forEach((h) => h && (h.style.background = chromeBg));
            }}
          />
        )}

        {/* Editor area — single pane or split */}
        {splitState.splitMode ? (
          <div
            ref={splitContainerRef}
            data-split-container
            style={{
              flex: 1,
              display: "flex",
              flexDirection: splitState.splitMode === "vertical" ? "row" : "column",
              overflow: "hidden",
            }}
          >
            {(() => {
              const paneIds =
                splitState.splitMode === "vertical" ? ["left", "right"] : ["top", "bottom"];
              return paneIds.map((pId, idx) => {
                const pane = splitState.panes[pId];
                if (!pane) return null;
                const paneActiveNote = pane.activeNote;
                const paneNote = paneActiveNote ? noteData[paneActiveNote] : null;
                const paneNoteTitle = paneNote?.title;
                const paneBacklinks = paneNoteTitle
                  ? getBacklinksForNote(backlinkIndex, paneNoteTitle)
                  : [];
                return (
                  <Fragment key={pId}>
                    {idx > 0 && (
                      <SplitDivider
                        splitMode={splitState.splitMode}
                        dividerPosition={splitState.dividerPosition}
                        setDividerPosition={setDividerPosition}
                        onSnapClose={() => closeSplit()}
                        containerRef={splitContainerRef}
                      />
                    )}
                    <div
                      style={{
                        flex:
                          idx === 0
                            ? `0 0 ${splitState.dividerPosition}%`
                            : `0 0 ${100 - splitState.dividerPosition}%`,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <PaneContainer
                        textOnlyEditForEditor={textOnlyEditForEditor}
                        paneId={pId}
                        isActive={activePaneId === pId}
                        tabs={pane.tabs}
                        activeNote={paneActiveNote}
                        noteData={noteData}
                        noteDataRef={noteDataRef}
                        newTabId={newTabId}
                        closingTabs={closingTabs}
                        setActiveNote={(noteId) => setActiveNoteForPane(pId, noteId)}
                        closeTab={(e, id) => {
                          e.stopPropagation();
                          setTabsForPane(pId, (prev) => prev.filter((t) => t !== id));
                          if (paneActiveNote === id) {
                            const remaining = pane.tabs.filter((t) => t !== id);
                            setActiveNoteForPane(pId, remaining[remaining.length - 1] || null);
                          }
                          setTimeout(() => closePaneIfEmpty(pId), 200);
                        }}
                        tabFlip={tabFlip}
                        activeTabBg={activeTabBg}
                        chromeBg={chromeBg}
                        setNoteData={setNoteData}
                        commitNoteData={commitNoteData}
                        commitTextChange={commitTextChange}
                        syncGeneration={syncGeneration}
                        slashMenuRef={slashMenuRef}
                        setSlashMenu={setSlashMenu}
                        wikilinkMenuRef={wikilinkMenuRef}
                        setWikilinkMenu={setWikilinkMenu}
                        tagMenuRef={tagMenuRef}
                        setTagMenu={setTagMenu}
                        onWikilinkClick={handleWikilinkClick}
                        onTagClick={handleTagClick}
                        onWikilinkCmdClick={handleWikilinkCmdClick}
                        openNote={(noteId) => openNoteInPane(noteId, pId)}
                        onOpenBacklink={(noteId) => openNoteInPane(noteId, pId)}
                        backlinks={paneBacklinks}
                        noteTitleSet={noteTitleSet}
                        lightbox={lightbox}
                        setLightbox={setLightbox}
                        onPaneClick={setActivePaneId}
                        showTabBar={splitState.splitMode === "horizontal" && idx === 1}
                        tabAreaWidth={tabAreaWidth}
                        onEditorClick={clearSelection}
                        pushHistory={pushHistory}
                        popHistory={popHistory}
                        setDragTooltip={setDragTooltip}
                        dragTooltipCount={dragTooltipCount}
                        onTabPointerDown={handleTabPointerDown}
                      />
                    </div>
                  </Fragment>
                );
              });
            })()}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <EditorProvider
              value={{
                editorRef,
                editorScrollRef,
                titleRef,
                blockRefs,
                noteDataRef,
                focusBlockId,
                focusCursorPos,
                forceRender,
                handleEditorKeyDown,
                handleEditorInput,
                handleEditorPaste,
                handleEditorCopy,
                handleEditorPointerDown,
                handleEditorMouseDown,
                handleEditorMouseUp,
                handleEditorFocus,
                handleEditorDragOver,
                handleEditorDragLeave,
                handleEditorDrop,
                commitTextChange,
                syncGeneration,
                flipCheck,
                deleteBlock,
                registerBlockRef,
                insertBlockAfter,
                updateCodeText,
                updateCodeLang,
                updateCallout,
                updateTableRows,
                updateBlockProperty,
                detectActiveFormats,
                applyFormat,
                reReadBlockFromDom,
              }}
            >
              <EditorArea
                isMobile={isMobile}
                onEditorClick={clearSelection}
                textOnlyEditForEditor={textOnlyEditForEditor}
                note={note}
                activeNote={activeNote}
                editorFadeIn={editorFadeIn}
                backlinks={currentBacklinks}
                onWikilinkClick={handleWikilinkClick}
                onWikilinkCmdClick={handleWikilinkCmdClick}
                onOpenBacklink={openNote}
                toolbarState={isMobile ? null : toolbarState}
                noteTitleSet={noteTitleSet}
                linkPopover={linkPopover}
                setLinkPopover={setLinkPopover}
                selectedImageBlockId={selectedImageBlockId}
                setSelectedImageBlockId={setSelectedImageBlockId}
                lightbox={lightbox}
                setLightbox={setLightbox}
                openNote={openNote}
              />
              {isMobile && (
                <MobileToolbar
                  isVisible={mobileKeyboard.isKeyboardVisible}
                  activeNote={activeNote}
                  note={note}
                  activeFormats={toolbarState ? detectActiveFormats() : EMPTY_FORMATS}
                  onDismiss={() => {
                    document.activeElement?.blur();
                  }}
                  onImageInsert={() => {
                    const api = getAPI();
                    if (api?.pickImageFile) {
                      api.pickImageFile().then((file) => {
                        if (file) saveAndInsertImage(activeNote, note, file);
                      });
                    }
                  }}
                />
              )}
            </EditorProvider>
          </div>
        )}

        {/* Right panel drag handle — desktop only */}
        {!isMobile && (
          <div
            ref={(el) => {
              if (el) rightPanelHandles.current[1] = el;
            }}
            onMouseDown={startRightDrag}
            style={{
              width: 4,
              cursor: "col-resize",
              background: theme.BG.editor,
              flexShrink: 0,
              transition: "background 0.15s",
            }}
            onMouseEnter={() =>
              rightPanelHandles.current.forEach(
                (h) => h && (h.style.background = theme.ACCENT.primary),
              )
            }
            onMouseLeave={() => {
              if (!isDragging.current) {
                rightPanelHandles.current[0] &&
                  (rightPanelHandles.current[0].style.background = chromeBg);
                rightPanelHandles.current[1] &&
                  (rightPanelHandles.current[1].style.background = theme.BG.editor);
              }
            }}
          />
        )}

        {/* Right panel — desktop only */}
        {!isMobile && (
          <div
            style={{
              width: rightPanel ? rightPanelWidth : 0,
              minWidth: rightPanel ? rightPanelWidth : 0,
              background: theme.BG.editor,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              flexShrink: 0,
              position: "relative",
              borderLeft: `1px solid ${theme.BG.divider}`,
              transition: isDragging.current ? "none" : "width 0.2s ease, min-width 0.2s ease",
            }}
          >
            <React.Suspense fallback={null}>
              <TerminalPanel
                terminals={terminals}
                activeTerminalId={activeTerminalId}
                setActiveTerminalId={setActiveTerminalId}
                xtermInstances={xtermInstances}
                createTerminal={createTerminal}
                createAITab={createAITab}
                closeTerminal={closeTerminal}
                renameTerminal={renameTerminal}
                restartTerminal={restartTerminal}
                clearTerminal={clearTerminal}
                markExited={markExited}
                isOpen={rightPanel}
                onAIModelChange={handleAIModelChange}
                onOpenAISettings={handleOpenAISettings}
                noteContext={activeNoteContext}
                sendContext={aiSettings.sendContext}
                onToggleContext={handleToggleAIContext}
              />
            </React.Suspense>
          </div>
        )}
      </div>

      {/* === Mobile More Menu === */}
      {isMobile && (
        <EditorMoreMenu
          open={moreMenuOpen}
          onClose={() => setMoreMenuOpen(false)}
          activeNote={activeNote}
          noteTitle={noteTitle}
          noteData={noteData}
          wordCount={wordCount}
          charCount={charCount}
          onDuplicate={duplicateNote}
          onDelete={(id) => {
            deleteNote(id);
            setActiveNote(null);
          }}
          onMoveToFolder={(id, folder) => bulkMoveNotes([id], folder)}
          folderList={folderList}
        />
      )}

      {/* === Overlays === */}
      <ContextMenu
        ctxMenu={ctxMenu}
        setCtxMenu={setCtxMenu}
        openNote={openNote}
        duplicateNote={duplicateNote}
        deleteNote={deleteNote}
        deleteFolder={deleteFolder}
        createNote={createNote}
        setRenamingFolder={setRenamingFolder}
        restoreNote={restoreNote}
        permanentDeleteNote={permanentDeleteNote}
        titleRef={titleRef}
        onExportPdf={handleExportPdf}
        onExportDocx={handleExportDocx}
        onImport={handleImportIntoFolder}
        selectedNotes={selectedNotes}
        selectedCount={selectedCount}
        bulkDeleteNotes={bulkDeleteNotes}
        bulkMoveNotes={bulkMoveNotes}
        folderList={folderList}
      />

      <SlashMenu
        slashMenu={slashMenu}
        setSlashMenu={setSlashMenu}
        executeSlashCommand={executeSlashCommand}
      />

      {wikilinkMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: Z.MENU_BACKDROP }}
            onMouseDown={() => setWikilinkMenu(null)}
          />
          <WikilinkMenu
            position={wikilinkMenu.rect}
            filter={wikilinkMenu.filter}
            noteData={noteData}
            onSelect={handleWikilinkSelect}
            onDismiss={() => setWikilinkMenu(null)}
          />
        </>
      )}

      {tagMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: Z.MENU_BACKDROP }}
            onMouseDown={() => setTagMenu(null)}
          />
          <TagMenu
            position={tagMenu.rect}
            filter={tagMenu.filter}
            noteData={noteData}
            onSelect={handleTagSelect}
            onDismiss={() => setTagMenu(null)}
          />
        </>
      )}

      {/* Drag tooltip */}
      {dragTooltip && (
        <div
          style={{
            position: "fixed",
            top: dragTooltip.y,
            left: dragTooltip.x,
            transform: "translateX(-50%)",
            background: theme.BG.elevated,
            border: `1px solid ${theme.BG.divider}`,
            borderRadius: 6,
            padding: "5px 12px",
            fontSize: 12,
            color: theme.TEXT.primary,
            fontWeight: 500,
            zIndex: Z.OVERLAY,
            pointerEvents: "none",
            animation: "fadeIn 0.2s ease",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            whiteSpace: "nowrap",
          }}
        >
          {dragTooltip.text}
        </div>
      )}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src.startsWith("data:") ? lightbox.src : `boojy-att://${lightbox.src}`}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}

      <React.Suspense fallback={null}>
        <SettingsModal
          isMobile={isMobile}
          syncState={syncState}
          lastSynced={lastSynced}
          storageUsed={storageUsed}
          storageLimitMB={storageLimitMB}
          onSync={syncAll}
          noteData={noteData}
          setActiveNote={setActiveNote}
          isDesktop={isDesktop}
          notesDir={notesDir}
          changeNotesDir={changeNotesDir}
        />
      </React.Suspense>

      {import.meta.env.DEV && DevOverlay && (
        <React.Suspense fallback={null}>
          <DevOverlay open={devOverlay} onClose={() => setDevOverlay(false)} />
        </React.Suspense>
      )}

      <GlobalStyles />

      {onboardingToast && !user && isWeb && (
        <OnboardingToast
          accentColor={accentColor}
          onSignIn={() => {
            setOnboardingToast(false);
            localStorage.setItem("boojy-onboarding-dismissed", "true");
            setSettingsOpen(true);
            setSettingsTab("profile");
          }}
          onDismiss={() => {
            setOnboardingToast(false);
            localStorage.setItem("boojy-onboarding-dismissed", "true");
          }}
        />
      )}

      {persistenceWarning && !user && isWeb && !onboardingToast && (
        <PersistenceWarning
          noteCount={Object.keys(noteData).filter((id) => !noteData[id]._draft).length}
          accentColor={accentColor}
          onSignIn={() => {
            setPersistenceWarning(false);
            localStorage.setItem("boojy-persistence-warning-dismissed", "true");
            setSettingsOpen(true);
            setSettingsTab("profile");
          }}
          onDismiss={() => {
            setPersistenceWarning(false);
            localStorage.setItem("boojy-persistence-warning-dismissed", "true");
          }}
        />
      )}

      {pendingFirstSync && (
        <FirstSyncModal
          noteCount={pendingFirstSync.noteCount}
          accentColor={accentColor}
          onConfirm={confirmFirstSync}
          onCancel={cancelFirstSync}
        />
      )}

      {conflictToast && (
        <ConflictToast
          noteTitle={conflictToast.noteTitle}
          onClick={() => {
            setActiveNote(conflictToast.conflictId);
            dismissConflictToast();
          }}
        />
      )}

      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            zIndex: Z.TOAST,
          }}
        >
          {toasts.map((t) => (
            <Toast
              key={t.id}
              message={t.message}
              type={t.type}
              onDismiss={() => dismissToast(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
