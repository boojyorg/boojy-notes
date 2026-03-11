import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "./hooks/useAuth";
import { useSync } from "./hooks/useSync";
import { useFileSystem } from "./hooks/useFileSystem";
import { useHistory } from "./hooks/useHistory";
import { useNoteNavigation } from "./hooks/useNoteNavigation";
import { useNoteCrud } from "./hooks/useNoteCrud";
import { useBlockOperations } from "./hooks/useBlockOperations";
import { useInlineFormatting } from "./hooks/useInlineFormatting";
import { usePanelResize } from "./hooks/usePanelResize";
import { useBlockDrag } from "./hooks/useBlockDrag";
import { useSidebarDrag } from "./hooks/useSidebarDrag";
import { useMultiSelect } from "./hooks/useMultiSelect";
import { useEditorHandlers } from "./hooks/useEditorHandlers";
import { useTerminal } from "./hooks/useTerminal";
import { useSearch } from "./hooks/useSearch";
import { useTheme } from "./hooks/useTheme";
import { useSplitView } from "./hooks/useSplitView";
import { useTabDrag } from "./hooks/useTabDrag";
import { BG, TEXT, ACCENT, SEMANTIC, BRAND } from "./constants/colors";
import { FOLDER_TREE } from "./constants/data";
import { hexToRgb, rgbToHex } from "./utils/colorUtils";
import { setBlockIdCounter, STORAGE_KEY, loadFromStorage } from "./utils/storage";
import { stripMarkdownFormatting } from "./utils/inlineFormatting";
import { blocksToHtml } from "./utils/exportUtils";
import { buildBacklinkIndex, getBacklinksForNote } from "./utils/backlinkIndex";
import { getBlockFromNode, cleanOrphanNodes, placeCaret } from "./utils/domHelpers";
import { sortByOrder, buildTree, collectPaths, filterTree, pathsToTree, naturalCompare } from "./utils/sidebarTree";
import SettingsModal from "./components/SettingsModal";
import ContextMenu from "./components/ContextMenu";
import SlashMenu from "./components/SlashMenu";
import WikilinkMenu from "./components/WikilinkMenu";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import EditorArea from "./components/EditorArea";
import PaneContainer from "./components/PaneContainer";
import SplitDivider from "./components/SplitDivider";
import ImageLightbox from "./components/ImageLightbox";
import TerminalPanel from "./components/terminal/TerminalPanel";

export default function BoojyNotes() {
  const { theme, isDark, themeMode, setThemeMode } = useTheme();

  // ── State ──────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState(() => {
    const ui = (() => {
      try {
        return JSON.parse(localStorage.getItem("boojy-ui-state"));
      } catch {
        return null;
      }
    })();
    if (ui?.expanded) return ui.expanded;
    const saved = loadFromStorage();
    return saved?.expanded || { Boojy: true };
  });
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
  const [collapsed, setCollapsed] = useState(false);
  const [rightPanel, setRightPanel] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [rightPanelWidth, setRightPanelWidth] = useState(220);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsFontSize, setSettingsFontSize] = useState(15);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const {
    user,
    profile,
    signInWithEmail,
    signUpWithEmail,
    signInWithOAuth,
    signOut,
    resendVerification,
  } = useAuth();

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (hash.includes("access_token") || params.has("code")) {
      setSettingsOpen(true);
      setSettingsTab("profile");
    }
  }, []);

  const [editorFadeIn, setEditorFadeIn] = useState(false);
  const [devOverlay, setDevOverlay] = useState(false);
  const [devToast, setDevToast] = useState(null);
  const [chromeBg, setChromeBg] = useState(theme.BG.dark);
  const [editorBg, setEditorBg] = useState(theme.BG.editor);
  const [topBarEdge, setTopBarEdge] = useState("B");
  const [createBtnStyle, setCreateBtnStyle] = useState("A");
  const [accentColor, setAccentColor] = useState(theme.ACCENT.primary);
  const [activeTabBg, setActiveTabBg] = useState("#1C1C20");
  const [tabFlip, setTabFlip] = useState(false);
  const [selectionStyle, setSelectionStyle] = useState("B");

  useEffect(() => {
    setChromeBg(theme.BG.dark);
    setEditorBg(theme.BG.editor);
    setAccentColor(theme.ACCENT.primary);
    setActiveTabBg(isDark ? "#1C1C20" : "#e2e6f2");
  }, [isDark]);

  const [noteData, setNoteData] = useState(() => {
    if (window.electronAPI) return {};
    const saved = loadFromStorage();
    if (saved?.noteData) {
      let maxId = 0;
      for (const n of Object.values(saved.noteData)) {
        for (const b of n.content.blocks) {
          if (b.id?.startsWith("blk-")) {
            const num = parseInt(b.id.slice(4), 10);
            if (num > maxId) maxId = num;
          }
        }
      }
      setBlockIdCounter(maxId);
      return saved.noteData;
    }
    return {};
  });

  // Update native window title when active note or its title changes
  const activeNoteTitle = noteData[activeNote]?.title;
  useEffect(() => {
    const title = activeNoteTitle
      ? activeNoteTitle + " - Boojy Notes"
      : "Boojy Notes";
    window.electronAPI?.setWindowTitle(title);
  }, [activeNote, activeNoteTitle]);

  const [, forceRender] = useState(0);
  const [slashMenu, setSlashMenu] = useState(null);
  const [wikilinkMenu, setWikilinkMenu] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [customFolders, setCustomFolders] = useState(() => {
    if (window.electronAPI) return [];
    const saved = loadFromStorage();
    return saved?.customFolders || [];
  });
  const [trashedNotes, setTrashedNotes] = useState({});
  const [trashExpanded, setTrashExpanded] = useState(false);
  const trashedNotesRef = useRef(new Map());
  const [toolbarState, setToolbarState] = useState(null);
  const [sidebarOrder, setSidebarOrder] = useState({});
  const [dragTooltip, setDragTooltip] = useState(null);
  const dragTooltipCount = useRef({ editor: 0, sidebar: 0 });

  // ── Spell check state ──────────────────────────────────────────────
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [spellCheckLanguages, setSpellCheckLanguages] = useState(["en-US"]);

  // ── Onboarding & persistence warning toasts (web only) ────────────
  const [onboardingToast, setOnboardingToast] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState(false);
  const persistenceShownRef = useRef(false);

  // ── Refs ────────────────────────────────────────────────────────────
  const sidebarHandles = useRef([]);
  const rightPanelHandles = useRef([]);
  const tabScrollRef = useRef(null);
  const searchInputRef = useRef(null);
  const [tabAreaWidth, setTabAreaWidth] = useState(600);
  const blockRefs = useRef({});
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const focusBlockId = useRef(null);
  const focusCursorPos = useRef(null);
  const mouseIsDown = useRef(false);
  const slashMenuRef = useRef(slashMenu);
  slashMenuRef.current = slashMenu;
  const wikilinkMenuRef = useRef(wikilinkMenu);
  wikilinkMenuRef.current = wikilinkMenu;
  const editorScrollRef = useRef(null);
  const sidebarScrollRef = useRef(null);
  const splitContainerRef = useRef(null);

  // ── Shared refs ─────────────────────────────────────────────────────
  const syncGeneration = useRef(0);
  const activeNoteRef = useRef(activeNote);
  activeNoteRef.current = activeNote;

  // ── External hooks ──────────────────────────────────────────────────
  const {
    syncState, lastSynced, storageUsed, storageLimitMB, syncAll,
    conflictToast, dismissConflictToast,
    pendingFirstSync, confirmFirstSync, cancelFirstSync,
  } = useSync(user, profile, noteData, setNoteData, activeNote);
  const {
    isElectron: isDesktop,
    notesDir,
    loading: fsLoading,
    changeNotesDir,
  } = useFileSystem(noteData, setNoteData, setCustomFolders, trashedNotesRef, syncGeneration, setSidebarOrder);

  // ── App hooks ───────────────────────────────────────────────────────
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    commitNoteData,
    commitTextChange,
    pushHistory,
    popHistory,
    isUndoRedo,
    noteDataRef,
  } = useHistory(noteData, setNoteData, syncGeneration, activeNoteRef);
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
  });
  const {
    updateBlockText,
    insertBlockAfter,
    deleteBlock,
    updateBlockProperty,
    insertImageBlock,
    insertFileBlock,
    saveAndInsertImage,
    flipCheck,
    registerBlockRef,
    updateCodeText,
    updateCodeLang,
    updateCallout,
    updateTableRows,
  } = useBlockOperations({
    commitNoteData,
    commitTextChange,
    blockRefs,
    focusBlockId,
    focusCursorPos,
  });

  // Image selection + lightbox state
  const [selectedImageBlockId, setSelectedImageBlockId] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  // Link popover state
  const [linkPopover, setLinkPopover] = useState(null);
  const openLinkEditor = useCallback(() => {
    // getLinkContext is called from within useInlineFormatting
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

  const { isDragging, startDrag, startRightDrag } = usePanelResize({
    sidebarHandles,
    rightPanelHandles,
    setSidebarWidth,
    setRightPanelWidth,
    chromeBg,
  });
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
  const { sidebarDrag, handleSidebarPointerDown, cancelSidebarDrag, persistSidebarOrder } =
    useSidebarDrag({
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
  });
  const {
    terminals,
    activeTerminalId,
    setActiveTerminalId,
    xtermInstances,
    createTerminal,
    closeTerminal,
    renameTerminal,
    restartTerminal,
    clearTerminal,
    markExited,
  } = useTerminal();
  const {
    searchMode,
    searchResults,
    activeResultIndex,
    search: runSearch,
    clearSearch,
    navigateResults,
    getActiveResult,
  } = useSearch(noteData, noteDataRef);

  // Wire search input to fuzzy search — clear multi-select when entering search
  useEffect(() => {
    runSearch(search);
    if (search && clearSelectionRef.current) clearSelectionRef.current();
  }, [search, runSearch]);

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
    if (!window.electronAPI?.readTrash) return;
    if (fsLoading) return;
    (async () => {
      try {
        await window.electronAPI.purgeTrash(null);
        const trashed = await window.electronAPI.readTrash();
        if (trashed && Object.keys(trashed).length > 0) {
          setTrashedNotes(trashed);
        }
      } catch (err) {
        console.error("Failed to load trash", err);
      }
    })();
  }, [fsLoading]);

  // Load settings on mount (spell check, etc.)
  useEffect(() => {
    if (!window.electronAPI?.getSettings) return;
    window.electronAPI.getSettings().then((s) => {
      if (s.spellCheckEnabled !== undefined) setSpellCheckEnabled(s.spellCheckEnabled !== false);
      if (s.spellCheckLanguages) setSpellCheckLanguages(s.spellCheckLanguages);
    });
  }, []);

  // Listen for menu export/import events (use refs to avoid re-registering on every noteData change)
  const handleExportRef = useRef({ pdf: null, docx: null });
  useEffect(() => {
    if (!window.electronAPI) return;
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
  }, []); // eslint-disable-line

  // Editor fade-in + title sync (only in single-pane mode; PaneContainer has its own)
  useEffect(() => {
    if (splitState.splitMode) return;
    setEditorFadeIn(false);
    setSelectedImageBlockId(null);
    setLightbox(null);
    const t = setTimeout(() => setEditorFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [activeNote, splitState.splitMode]);

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

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && blockDrag.current.active) {
        e.preventDefault();
        cancelBlockDrag();
        return;
      }
      if (e.key === "Escape" && sidebarDrag.current.active) {
        e.preventDefault();
        cancelSidebarDrag();
        return;
      }
      if (e.key === "Escape" && settingsOpen) {
        e.preventDefault();
        setSettingsOpen(false);
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (mod && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (mod && e.key === "n") {
        e.preventDefault();
        // If a draft is already active, focus its title instead of creating another
        if (activeNote && noteData[activeNote]?._draft) {
          if (titleRef.current) {
            titleRef.current.focus();
          }
          return;
        }
        createNote(null);
        return;
      }
      if (mod && e.key === "p") {
        e.preventDefault();
        setCollapsed(false);
        setTimeout(() => searchInputRef.current?.focus(), 250);
        return;
      }
      if (mod && e.shiftKey && e.key === "\\") {
        e.preventDefault();
        if (splitState.splitMode) {
          closeSplit();
        } else {
          splitPane("vertical");
        }
        return;
      }
      if (mod && !e.shiftKey && e.key === "\\") {
        e.preventDefault();
        setRightPanel((v) => !v);
        return;
      }
      // Cmd+1 / Cmd+2 to switch active pane
      if (mod && splitState.splitMode && (e.key === "1" || e.key === "2")) {
        e.preventDefault();
        const ids = splitState.splitMode === "vertical" ? ["left", "right"] : ["top", "bottom"];
        setActivePaneId(e.key === "1" ? ids[0] : ids[1]);
        return;
      }
      if (mod && e.shiftKey && (e.key === "T" || e.key === "t")) {
        if (rightPanel) {
          e.preventDefault();
          createTerminal();
          return;
        }
      }
      if (mod && e.shiftKey && (e.key === "W" || e.key === "w")) {
        if (rightPanel && activeTerminalId) {
          e.preventDefault();
          closeTerminal(activeTerminalId);
          return;
        }
      }
      if (import.meta.env.DEV && mod && e.key === ".") {
        e.preventDefault();
        setDevOverlay((v) => !v);
      }
      if (import.meta.env.DEV && mod && e.key === ",") {
        e.preventDefault();
        setTabFlip((v) => {
          const next = !v;
          setDevToast(`Tab style: ${next ? "B" : "A"}`);
          setTimeout(() => setDevToast(null), 1500);
          return next;
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen, rightPanel, activeTerminalId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("boojy-ui-state", JSON.stringify({
          tabs,
          activeNote,
          expanded,
          splitState: getSplitStateForPersistence(),
        }));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [tabs, activeNote, expanded, splitState]);

  useEffect(() => {
    if (window.electronAPI) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ noteData, tabs, activeNote, expanded, customFolders }),
        );
      } catch (e) {
        console.warn("Failed to save to localStorage:", e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [noteData, tabs, activeNote, expanded, customFolders]);

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
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.readMeta) return;
    if (fsLoading) return;
    const loadMeta = async () => {
      const order = {};
      const rootMeta = await window.electronAPI.readMeta("");
      if (rootMeta) order[""] = rootMeta;
      const allPaths = new Set();
      for (const n of Object.values(noteData)) {
        if (n.folder) allPaths.add(n.folder);
      }
      for (const fp of allPaths) {
        const meta = await window.electronAPI.readMeta(fp);
        if (meta) order[fp] = meta;
      }
      setSidebarOrder(order);
    };
    loadMeta();
  }, [fsLoading]);

  // Selection change → floating toolbar (only in single-pane mode; split panes have their own)
  useEffect(() => {
    if (splitStateRef.current.splitMode) return; // PaneContainer handles its own
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
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, [activeNote, splitState.splitMode]);

  // Focus block layout effect (only in single-pane mode; split panes have their own)
  useLayoutEffect(() => {
    if (splitState.splitMode) return; // PaneContainer handles its own
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
      // Scroll cursor into view if it's in the bottom 20% of the editor
      setTimeout(() => {
        const scrollEl = editorScrollRef.current;
        if (!scrollEl) return;
        const blockEl = blockRefs.current[targetId];
        if (!blockEl) return;
        const blockRect = blockEl.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        // If the block's bottom is zero, it hasn't laid out yet — skip
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
  // Reset stale activeNote that points to a deleted/missing note
  // Use a ref to track previously known IDs so we only clean up on actual deletions
  const prevNoteIdsRef = useRef(null);
  useEffect(() => {
    if (fsLoading) return;
    if (activeNote && !noteData[activeNote]) {
      setActiveNote(null);
    }
    // Only check pane tabs when notes were actually removed (not on every text edit)
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
  }, [fsLoading, noteData, activeNote]);

  // Auto-create draft note when no note is active
  useEffect(() => {
    if (fsLoading) return;
    if (activeNote) return;
    createDraftNote();
  }, [activeNote, fsLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Promote draft to real note on first meaningful edit
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

  // Discard empty draft when navigating away
  const prevActiveRef = useRef(null);
  useEffect(() => {
    const prevId = prevActiveRef.current;
    prevActiveRef.current = activeNote;
    if (prevId && prevId !== activeNote && noteDataRef.current[prevId]?._draft) {
      discardDraft(prevId);
    }
  }, [activeNote]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Onboarding toast (Feature A): show after 3rd note for anon web users ──
  useEffect(() => {
    if (window.electronAPI) return;
    if (user) return;
    const noteCount = Object.keys(noteData).filter((id) => !noteData[id]._draft).length;
    if (noteCount >= 3 && !localStorage.getItem("boojy-onboarding-dismissed")) {
      setOnboardingToast(true);
    }
  }, [noteData, user]);

  // Auto-dismiss onboarding toast after 15s
  useEffect(() => {
    if (!onboardingToast) return;
    const t = setTimeout(() => setOnboardingToast(false), 15000);
    return () => clearTimeout(t);
  }, [onboardingToast]);

  // ── Persistence warning (Feature F): show after 5+ notes for anon web users ──
  useEffect(() => {
    if (window.electronAPI) return;
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
  const { wordCount, charCount, charCountNoSpaces, readingTime } = useMemo(() => {
    if (!noteBlocks) return { wordCount: 0, charCount: 0, charCountNoSpaces: 0, readingTime: 1 };
    const plainText = noteBlocks
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
  }, [noteBlocks]);

  // Note title set for broken wikilink detection
  // Stabilise the Set reference: only rebuild when actual titles change (not on every text edit)
  const noteTitlesKey = useMemo(
    () =>
      Object.values(noteData)
        .map((n) => (n.title || "").trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join("\0"),
    [noteData],
  );
  const noteTitleSet = useMemo(() => new Set(noteTitlesKey.split("\0")), [noteTitlesKey]);

  // Backlink index — only rebuild when note structure changes (not on every text edit)
  const backlinkIndex = useMemo(
    () => buildBacklinkIndex(noteDataRef.current),
    [noteTitlesKey, activeNote], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const noteTitle = note?.title;
  const currentBacklinks = useMemo(
    () => (noteTitle ? getBacklinksForNote(backlinkIndex, noteTitle) : []),
    [backlinkIndex, noteTitle],
  );

  // Wikilink click handler — find note by title and open it
  const handleWikilinkClick = useCallback(
    (targetTitle) => {
      const lc = targetTitle.trim().toLowerCase();
      const found = Object.entries(noteDataRef.current).find(([, n]) => (n.title || "").toLowerCase() === lc);
      if (found) {
        openNote(found[0]);
      } else {
        // Create new note with the target title
        createNote(null, targetTitle);
      }
    },
    [openNote, createNote],
  );

  // Wikilink Cmd+Click — open in other pane (or create split)
  const handleWikilinkCmdClick = useCallback(
    (targetTitle) => {
      const lc = targetTitle.trim().toLowerCase();
      const found = Object.entries(noteDataRef.current).find(([, n]) => (n.title || "").toLowerCase() === lc);
      const noteId = found ? found[0] : null;
      if (!noteId) {
        // Create and open in other pane
        createNote(null, targetTitle);
        return;
      }
      if (splitState.splitMode) {
        // Open in the other pane
        const otherPaneId = getOtherPaneId();
        if (otherPaneId) openNoteInPane(noteId, otherPaneId);
      } else {
        // Create split and open in new right pane
        splitPaneWithNote("vertical", noteId);
      }
    },
    [splitState.splitMode, getOtherPaneId, openNoteInPane, splitPaneWithNote, createNote, noteDataRef],
  );

  // Wikilink autocomplete select handler — replace raw [[filter text with [[Title]]
  const handleWikilinkSelect = useCallback(
    (title) => {
      const menu = wikilinkMenuRef.current;
      if (!menu) return;
      const { noteId, blockIndex } = menu;
      const blocks = noteDataRef.current[noteId]?.content?.blocks;
      if (!blocks || !blocks[blockIndex]) return;
      const oldText = blocks[blockIndex].text || "";
      // Find the [[ that opened the menu and replace everything from there to cursor
      const match = oldText.match(/\[\[([^\]]*)$/);
      if (match) {
        const newText = oldText.slice(0, match.index) + `[[${title}]]`;
        commitTextChange((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blocks = [...n.content.blocks];
          blocks[blockIndex] = { ...blocks[blockIndex], text: newText };
          n.content = { ...n.content, blocks };
          next[noteId] = n;
          return next;
        });
        syncGeneration.current++;
        // Place cursor after the closing ]]
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
    ],
  );

  // ── Export handlers ─────────────────────────────────────────────────
  const handleExportPdf = useCallback(
    (noteId) => {
      const n = noteData[noteId];
      if (!n || !window.electronAPI?.exportPdf) return;
      const html = blocksToHtml(n.content.blocks, n.title);
      window.electronAPI.exportPdf({ html, title: n.title });
    },
    [noteData],
  );

  const handleExportDocx = useCallback(
    (noteId) => {
      const n = noteData[noteId];
      if (!n || !window.electronAPI?.exportDocx) return;
      window.electronAPI.exportDocx({ blocks: n.content.blocks, title: n.title });
    },
    [noteData],
  );
  // Keep export refs in sync for IPC handler (defined earlier to avoid re-registering on every noteData change)
  handleExportRef.current.pdf = handleExportPdf;
  handleExportRef.current.docx = handleExportDocx;

  // ── Import handler for folder context menu ─────────────────────────
  const handleImportIntoFolder = useCallback((folderId) => {
    if (!window.electronAPI?.importMarkdown) return;
    window.electronAPI.importMarkdown({ targetFolder: folderId });
  }, []);

  // ── Spell check handlers ───────────────────────────────────────────
  const handleToggleSpellCheck = useCallback(
    (enabled) => {
      setSpellCheckEnabled(enabled);
      if (window.electronAPI?.toggleSpellcheck) {
        window.electronAPI.toggleSpellcheck({ enabled, languages: spellCheckLanguages });
      }
    },
    [spellCheckLanguages],
  );

  const handleChangeSpellCheckLanguages = useCallback(
    (languages) => {
      setSpellCheckLanguages(languages);
      if (window.electronAPI?.toggleSpellcheck) {
        window.electronAPI.toggleSpellcheck({ enabled: spellCheckEnabled, languages });
      }
    },
    [spellCheckEnabled],
  );

  const { derivedRootNotes, folderNoteMap } = useMemo(() => {
    const roots = [];
    const map = {};
    for (const [id, n] of Object.entries(noteData)) {
      if (n._draft) continue; // Hide drafts from sidebar
      if (n.folder) {
        if (!map[n.folder]) map[n.folder] = [];
        map[n.folder].push(id);
      } else {
        roots.push(id);
      }
    }
    return { derivedRootNotes: roots, folderNoteMap: map };
  }, [noteData]);

  const { allFolders, knownPaths } = useMemo(() => {
    const allPaths = new Set([...customFolders, ...Object.keys(folderNoteMap)]);
    const folders = [...FOLDER_TREE, ...pathsToTree([...allPaths])];
    const paths = new Set(collectPaths(folders));
    return { allFolders: folders, knownPaths: paths };
  }, [customFolders, folderNoteMap]);

  const { folderTree, sortedRootNotes } = useMemo(() => {
    const rawFolderTree = buildTree(allFolders, folderNoteMap, sidebarOrder);
    const hasRootOrder = sidebarOrder[""]?.folderOrder?.length > 0;
    const tree = hasRootOrder
      ? sortByOrder(rawFolderTree, sidebarOrder[""].folderOrder, (f) => f.name)
      : [...rawFolderTree].sort((a, b) => naturalCompare(a.name, b.name));
    const sorted = sortByOrder(derivedRootNotes, sidebarOrder[""]?.noteOrder, (id) => id);
    return { folderTree: tree, sortedRootNotes: sorted };
  }, [allFolders, folderNoteMap, sidebarOrder, derivedRootNotes]);

  const { filteredTree, fNotes } = useMemo(() => {
    const lc = (s) => s.toLowerCase();
    const filtered = filterTree(folderTree, search ? lc(search) : "", noteData);
    const notes = search
      ? sortedRootNotes.filter((n) => noteData[n] && lc(noteData[n].title).includes(lc(search)))
      : sortedRootNotes;
    return { filteredTree: filtered, fNotes: notes };
  }, [folderTree, search, noteData, sortedRootNotes]);

  // ── Multi-select ────────────────────────────────────────────────────
  const { selectedNotes, handleNoteClick, clearSelection, removeFromSelection } =
    useMultiSelect({ filteredTree, fNotes, expanded, openNote });

  // Keep refs in sync for useSidebarDrag (which is instantiated earlier)
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

  const folderList = useMemo(() => [...knownPaths].sort(), [knownPaths]);

  // ── UI helpers ──────────────────────────────────────────────────────
  const hBg = (el, c) => {
    el.style.background = c;
  };

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
    if (syncState === "syncing") return { ...base, animation: "syncGlow 2s ease-in-out infinite" };
    if (syncState === "error")
      return { ...base, boxShadow: `0 0 0 2.5px ${theme.BG.dark}, 0 0 0 4.5px ${theme.SEMANTIC.error}` };
    if (syncState === "offline") return { ...base, opacity: 0.4 };
    return base;
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: theme.BG.darkest,
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: theme.TEXT.primary,
        overflow: "hidden",
        fontSize: 13,
        transition: `background-color ${theme.transitionMs}ms ease, color ${theme.transitionMs}ms ease`,
      }}
    >
      {/* Title bar with traffic lights and centered title (desktop only) */}
      {isDesktop && (
        <div
          style={{
            height: 28,
            background: chromeBg,
            WebkitAppRegion: "drag",
            flexShrink: 0,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: theme.TEXT.secondary,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "40%",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {activeNote && noteData[activeNote]
              ? noteData[activeNote].title + " - Boojy Notes"
              : "Boojy Notes"}
          </span>
        </div>
      )}
      <TopBar
        chromeBg={chromeBg}
        accentColor={accentColor}
        topBarEdge={topBarEdge}
        tabFlip={tabFlip}
        activeTabBg={activeTabBg}
        sidebarWidth={sidebarWidth}
        rightPanelWidth={rightPanelWidth}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        canUndo={canUndo}
        canRedo={canRedo}
        undo={undo}
        redo={redo}
        tabs={tabs}
        activeNote={activeNote}
        noteData={noteData}
        newTabId={newTabId}
        closingTabs={closingTabs}
        setActiveNote={setActiveNote}
        closeTab={closeTab}
        setSettingsOpen={setSettingsOpen}
        setSettingsTab={setSettingsTab}
        syncState={syncState}
        syncDotStyle={syncDotStyle}
        rightPanel={rightPanel}
        setRightPanel={setRightPanel}
        note={note}
        wordCount={wordCount}
        charCount={charCount}
        charCountNoSpaces={charCountNoSpaces}
        readingTime={readingTime}
        startDrag={startDrag}
        startRightDrag={startRightDrag}
        isDragging={isDragging}
        sidebarHandles={sidebarHandles}
        rightPanelHandles={rightPanelHandles}
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
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar wrapper */}
        <div
          style={{
            width: collapsed ? 0 : sidebarWidth,
            minWidth: collapsed ? 0 : sidebarWidth,
            background: chromeBg,
            display: "flex",
            flexShrink: 0,
            overflow: "hidden",
            position: "relative",
            transition: "width 0.2s ease, min-width 0.2s ease",
          }}
        >
          <Sidebar
            search={search}
            setSearch={setSearch}
            searchFocused={searchFocused}
            setSearchFocused={setSearchFocused}
            searchInputRef={searchInputRef}
            sidebarWidth={sidebarWidth}
            accentColor={accentColor}
            selectionStyle={selectionStyle}
            filteredTree={filteredTree}
            fNotes={fNotes}
            noteData={noteData}
            activeNote={activeNote}
            expanded={expanded}
            toggle={toggle}
            openNote={openNote}
            setCtxMenu={setCtxMenu}
            renamingFolder={renamingFolder}
            setRenamingFolder={setRenamingFolder}
            renameFolder={renameFolder}
            createFolder={createFolder}
            createNote={createNote}
            handleSidebarPointerDown={handleSidebarPointerDown}
            sidebarScrollRef={sidebarScrollRef}
            trashedNotes={trashedNotes}
            trashExpanded={trashExpanded}
            setTrashExpanded={setTrashExpanded}
            emptyAllTrash={emptyAllTrash}
            searchMode={searchMode}
            searchResults={searchResults}
            activeResultIndex={activeResultIndex}
            navigateResults={navigateResults}
            clearSearch={clearSearch}
            handleSearchResultOpen={handleSearchResultOpen}
            getActiveResult={getActiveResult}
            selectedNotes={selectedNotes}
            handleNoteClick={handleNoteClick}
            clearSelection={clearSelection}
          />
        </div>

        {/* Sidebar drag handle — bottom */}
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
            sidebarHandles.current.forEach((h) => h && (h.style.background = theme.ACCENT.primary))
          }
          onMouseLeave={() => {
            if (!isDragging.current)
              sidebarHandles.current.forEach((h) => h && (h.style.background = chromeBg));
          }}
        />

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
              const paneIds = splitState.splitMode === "vertical" ? ["left", "right"] : ["top", "bottom"];
              return paneIds.map((pId, idx) => {
                const pane = splitState.panes[pId];
                if (!pane) return null;
                const paneActiveNote = pane.activeNote;
                const paneNote = paneActiveNote ? noteData[paneActiveNote] : null;
                const paneNoteTitle = paneNote?.title;
                const paneBacklinks = paneNoteTitle ? getBacklinksForNote(backlinkIndex, paneNoteTitle) : [];
                return (
                  <React.Fragment key={pId}>
                    {idx > 0 && (
                      <SplitDivider
                        splitMode={splitState.splitMode}
                        dividerPosition={splitState.dividerPosition}
                        setDividerPosition={setDividerPosition}
                        onSnapClose={(side) => {
                          // Snap-closing a side closes that pane
                          closeSplit();
                        }}
                        containerRef={splitContainerRef}
                      />
                    )}
                    <div style={{
                      flex: idx === 0
                        ? `0 0 ${splitState.dividerPosition}%`
                        : `0 0 ${100 - splitState.dividerPosition}%`,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}>
                      <PaneContainer
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
                          // Check if pane becomes empty after tab close
                          setTimeout(() => closePaneIfEmpty(pId), 200);
                        }}
                        tabFlip={tabFlip}
                        activeTabBg={activeTabBg}
                        chromeBg={chromeBg}
                        accentColor={accentColor}
                        editorBg={editorBg}
                        settingsFontSize={settingsFontSize}
                        setNoteData={setNoteData}
                        commitNoteData={commitNoteData}
                        commitTextChange={commitTextChange}
                        syncGeneration={syncGeneration}
                        slashMenuRef={slashMenuRef}
                        setSlashMenu={setSlashMenu}
                        wikilinkMenuRef={wikilinkMenuRef}
                        setWikilinkMenu={setWikilinkMenu}
                        onWikilinkClick={handleWikilinkClick}
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
                  </React.Fragment>
                );
              });
            })()}
          </div>
        ) : (
          <EditorArea
            onEditorClick={clearSelection}
            note={note}
            activeNote={activeNote}
            editorFadeIn={editorFadeIn}
            editorRef={editorRef}
            editorScrollRef={editorScrollRef}
            titleRef={titleRef}
            blockRefs={blockRefs}
            noteDataRef={noteDataRef}
            focusBlockId={focusBlockId}
            focusCursorPos={focusCursorPos}
            forceRender={forceRender}
            accentColor={accentColor}
            editorBg={editorBg}
            settingsFontSize={settingsFontSize}
            handleEditorKeyDown={handleEditorKeyDown}
            handleEditorInput={handleEditorInput}
            handleEditorPaste={handleEditorPaste}
            handleEditorPointerDown={handleEditorPointerDown}
            handleEditorMouseDown={handleEditorMouseDown}
            handleEditorMouseUp={handleEditorMouseUp}
            handleEditorFocus={handleEditorFocus}
            handleEditorDragOver={handleEditorDragOver}
            handleEditorDragLeave={handleEditorDragLeave}
            handleEditorDrop={handleEditorDrop}
            commitTextChange={commitTextChange}
            syncGeneration={syncGeneration}
            flipCheck={flipCheck}
            deleteBlock={deleteBlock}
            registerBlockRef={registerBlockRef}
            insertBlockAfter={insertBlockAfter}
            updateCodeText={updateCodeText}
            updateCodeLang={updateCodeLang}
            updateCallout={updateCallout}
            updateTableRows={updateTableRows}
            updateBlockProperty={updateBlockProperty}
            backlinks={currentBacklinks}
            onWikilinkClick={handleWikilinkClick}
            onWikilinkCmdClick={handleWikilinkCmdClick}
            onOpenBacklink={openNote}
            toolbarState={toolbarState}
            detectActiveFormats={detectActiveFormats}
            applyFormat={applyFormat}
            noteTitleSet={noteTitleSet}
            linkPopover={linkPopover}
            setLinkPopover={setLinkPopover}
            reReadBlockFromDom={reReadBlockFromDom}
            selectedImageBlockId={selectedImageBlockId}
            setSelectedImageBlockId={setSelectedImageBlockId}
            lightbox={lightbox}
            setLightbox={setLightbox}
            openNote={openNote}
          />
        )}

        {/* Right panel drag handle — bottom */}
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
            rightPanelHandles.current.forEach((h) => h && (h.style.background = theme.ACCENT.primary))
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

        {/* Right panel */}
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
          <TerminalPanel
            terminals={terminals}
            activeTerminalId={activeTerminalId}
            setActiveTerminalId={setActiveTerminalId}
            xtermInstances={xtermInstances}
            createTerminal={createTerminal}
            closeTerminal={closeTerminal}
            renameTerminal={renameTerminal}
            restartTerminal={restartTerminal}
            clearTerminal={clearTerminal}
            markExited={markExited}
            chromeBg={chromeBg}
            activeTabBg={activeTabBg}
            isOpen={rightPanel}
          />
        </div>
      </div>

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
            style={{ position: "fixed", inset: 0, zIndex: 199 }}
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
            zIndex: 1100,
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

      <SettingsModal
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        accentColor={accentColor}
        fontSize={settingsFontSize}
        setFontSize={setSettingsFontSize}
        user={user}
        profile={profile}
        authActions={{
          signInWithEmail,
          signUpWithEmail,
          signInWithOAuth,
          signOut,
          resendVerification,
        }}
        syncState={syncState}
        lastSynced={lastSynced}
        storageUsed={storageUsed}
        storageLimitMB={storageLimitMB}
        onSync={syncAll}
        noteData={noteData}
        setActiveNote={setActiveNote}
        setSettingsOpenFromParent={setSettingsOpen}
        isDesktop={isDesktop}
        notesDir={notesDir}
        changeNotesDir={changeNotesDir}
        spellCheckEnabled={spellCheckEnabled}
        spellCheckLanguages={spellCheckLanguages}
        onToggleSpellCheck={handleToggleSpellCheck}
        onChangeSpellCheckLanguages={handleChangeSpellCheckLanguages}
      />

      {/* Dev toast */}
      {import.meta.env.DEV && devToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: theme.BG.elevated,
            border: `1px solid ${theme.BG.divider}`,
            borderRadius: 8,
            padding: "6px 16px",
            fontSize: 12,
            color: theme.TEXT.primary,
            fontWeight: 500,
            zIndex: 200,
            animation: "fadeIn 0.15s ease",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {devToast}
        </div>
      )}

      {/* Dev gear button */}
      {import.meta.env.DEV && (
        <button
          onClick={() => setDevOverlay((v) => !v)}
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: `1px solid ${theme.BG.divider}`,
            background: devOverlay ? theme.BG.surface : `${theme.BG.elevated}aa`,
            color: devOverlay ? theme.ACCENT.primary : theme.TEXT.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            zIndex: 201,
            fontSize: 14,
            transition: "background 0.15s, color 0.15s, transform 0.15s",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.color = theme.ACCENT.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.color = devOverlay ? theme.ACCENT.primary : theme.TEXT.muted;
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85" />
          </svg>
        </button>
      )}

      {/* Dev tools overlay */}
      {import.meta.env.DEV &&
        devOverlay &&
        (() => {
          const aRgb = hexToRgb(accentColor);
          const cRgb = hexToRgb(chromeBg);
          const eRgb = hexToRgb(editorBg);
          const tRgb = hexToRgb(activeTabBg);
          const sliderTrack = {
            width: "100%",
            height: 4,
            appearance: "none",
            WebkitAppearance: "none",
            background: theme.BG.divider,
            borderRadius: 2,
            outline: "none",
            cursor: "pointer",
          };
          const sliderCss = `
          .dev-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${theme.TEXT.primary}; cursor: pointer; border: 2px solid ${theme.BG.elevated}; }
          .dev-slider::-webkit-slider-runnable-track { height: 4px; background: ${theme.BG.divider}; border-radius: 2px; }
        `;
          const channels = ["R", "G", "B"];
          const rgbSliders = (rgb, setter) =>
            channels.map((ch, i) => (
              <div
                key={ch}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: i < 2 ? 4 : 0,
                }}
              >
                <span
                  style={{
                    width: 10,
                    fontSize: 10,
                    color: ch === "R" ? "#E57373" : ch === "G" ? "#81C784" : "#64B5F6",
                    fontWeight: 600,
                  }}
                >
                  {ch}
                </span>
                <input
                  className="dev-slider"
                  type="range"
                  min="0"
                  max="255"
                  value={rgb[i]}
                  style={sliderTrack}
                  onChange={(e) => {
                    const next = [...rgb];
                    next[i] = +e.target.value;
                    setter(rgbToHex(...next));
                  }}
                />
                <span style={{ width: 24, textAlign: "right", fontSize: 10, color: theme.TEXT.muted }}>
                  {rgb[i]}
                </span>
              </div>
            ));
          return (
            <div
              style={{
                position: "fixed",
                bottom: 52,
                right: 16,
                width: 280,
                background: theme.BG.elevated,
                border: `1px solid ${theme.BG.divider}`,
                borderRadius: 10,
                padding: 16,
                zIndex: 200,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                fontSize: 12,
                color: theme.TEXT.secondary,
                fontFamily: "inherit",
                animation: "slideUp 0.15s ease",
              }}
            >
              <style>{sliderCss}</style>
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontWeight: 600, color: theme.TEXT.primary, fontSize: 13 }}>
                  Dev Tools
                </span>
                <button
                  onClick={() => setDevOverlay(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: theme.TEXT.muted,
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  {"\u2715"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>Top Bar Edge</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 5,
                    overflow: "hidden",
                    border: `1px solid ${theme.BG.divider}`,
                    marginLeft: "auto",
                  }}
                >
                  {["A", "B", "C", "D"].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setTopBarEdge(s);
                        setDevToast(
                          `Top bar: ${s === "A" ? "Shadow+line" : s === "B" ? "Shadow" : s === "C" ? "Line" : "None"}`,
                        );
                        setTimeout(() => setDevToast(null), 1500);
                      }}
                      style={{
                        background: topBarEdge === s ? theme.TEXT.primary : "transparent",
                        color: topBarEdge === s ? theme.BG.darkest : theme.TEXT.muted,
                        border: "none",
                        padding: "3px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.12s, color 0.12s",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>Create Buttons</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 5,
                    overflow: "hidden",
                    border: `1px solid ${theme.BG.divider}`,
                    marginLeft: "auto",
                  }}
                >
                  {["A", "B", "C"].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setCreateBtnStyle(s);
                        setDevToast(
                          `Create btns: ${s === "A" ? "Default" : s === "B" ? "Ghost" : "Accent"}`,
                        );
                        setTimeout(() => setDevToast(null), 1500);
                      }}
                      style={{
                        background: createBtnStyle === s ? theme.TEXT.primary : "transparent",
                        color: createBtnStyle === s ? theme.BG.darkest : theme.TEXT.muted,
                        border: "none",
                        padding: "3px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.12s, color 0.12s",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>Selection</span>
                <div
                  style={{
                    display: "flex",
                    borderRadius: 5,
                    overflow: "hidden",
                    border: `1px solid ${theme.BG.divider}`,
                    marginLeft: "auto",
                  }}
                >
                  {["A", "B"].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSelectionStyle(s);
                        setDevToast(`Selection: ${s === "A" ? "Glow bar" : "Pill"}`);
                        setTimeout(() => setDevToast(null), 1500);
                      }}
                      style={{
                        background: selectionStyle === s ? theme.TEXT.primary : "transparent",
                        color: selectionStyle === s ? theme.BG.darkest : theme.TEXT.muted,
                        border: "none",
                        padding: "3px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.12s, color 0.12s",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>Theme</span>
                <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${theme.BG.divider}`, marginLeft: "auto" }}>
                  {["night", "day", "auto"].map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setThemeMode(s);
                        setDevToast(`Theme: ${s}`);
                        setTimeout(() => setDevToast(null), 1500);
                      }}
                      style={{
                        background: themeMode === s ? theme.TEXT.primary : "transparent",
                        color: themeMode === s ? theme.BG.darkest : theme.TEXT.muted,
                        border: "none",
                        padding: "3px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.12s, color 0.12s",
                        textTransform: "capitalize",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: 1, background: theme.BG.divider }} />
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span>Accent Color</span>
                  <code style={{ color: accentColor }}>{accentColor}</code>
                </div>
                {rgbSliders(aRgb, setAccentColor)}
                <div
                  style={{
                    height: 8,
                    marginTop: 6,
                    borderRadius: 3,
                    background: accentColor,
                    border: `1px solid ${theme.BG.divider}`,
                  }}
                />
              </div>
              <div style={{ height: 1, background: theme.BG.divider }} />
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span>Active Tab BG</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <code style={{ color: theme.TEXT.primary }}>{activeTabBg}</code>
                    <button
                      onClick={() => {
                        setTabFlip(!tabFlip);
                        setDevToast(`Tab flip: ${!tabFlip ? "ON" : "OFF"}`);
                        setTimeout(() => setDevToast(null), 1500);
                      }}
                      style={{
                        background: tabFlip ? theme.TEXT.primary : "transparent",
                        color: tabFlip ? theme.BG.darkest : theme.TEXT.muted,
                        border: `1px solid ${theme.BG.divider}`,
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "background 0.12s, color 0.12s",
                      }}
                    >
                      FLIP
                    </button>
                  </div>
                </div>
                {rgbSliders(tRgb, setActiveTabBg)}
                <div
                  style={{
                    height: 8,
                    marginTop: 6,
                    borderRadius: 3,
                    background: activeTabBg,
                    border: `1px solid ${theme.BG.divider}`,
                  }}
                />
              </div>
              <div style={{ height: 1, background: theme.BG.divider }} />
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span>Chrome BG</span>
                  <code style={{ color: theme.TEXT.primary }}>{chromeBg}</code>
                </div>
                {rgbSliders(cRgb, setChromeBg)}
                <div
                  style={{
                    height: 8,
                    marginTop: 6,
                    borderRadius: 3,
                    background: chromeBg,
                    border: `1px solid ${theme.BG.divider}`,
                  }}
                />
              </div>
              <div style={{ height: 1, background: theme.BG.divider }} />
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span>Editor BG</span>
                  <code style={{ color: theme.TEXT.primary }}>{editorBg}</code>
                </div>
                {rgbSliders(eRgb, setEditorBg)}
                <div
                  style={{
                    height: 8,
                    marginTop: 6,
                    borderRadius: 3,
                    background: editorBg,
                    border: `1px solid ${theme.BG.divider}`,
                  }}
                />
              </div>
              <div style={{ height: 1, background: theme.BG.divider }} />
              <button
                onClick={() => {
                  setChromeBg(theme.BG.dark);
                  setEditorBg(theme.BG.editor);
                  setAccentColor(theme.ACCENT.primary);
                  setActiveTabBg("#1C1C20");
                  setTabFlip(false);
                }}
                style={{
                  background: "none",
                  border: `1px solid ${theme.BG.divider}`,
                  borderRadius: 4,
                  color: theme.TEXT.muted,
                  fontSize: 11,
                  padding: "4px 10px",
                  cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                Reset colours
              </button>
            </div>
          );
        })()}

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes syncGlow {
          0%, 100% { box-shadow: 0 0 4px ${theme.BRAND.orange}40; }
          50% { box-shadow: 0 0 14px ${theme.BRAND.orange}80, 0 0 24px ${theme.BRAND.orange}30; }
        }
        @keyframes syncDotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInToolbar {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tabSlideIn {
          from { max-width: 0; opacity: 0; padding-left: 0; padding-right: 0; overflow: hidden; }
          to { max-width: 200px; opacity: 1; }
        }
        @keyframes tabSlideOut {
          from { max-width: 200px; opacity: 1; }
          to { max-width: 0; opacity: 0; padding-left: 0; padding-right: 0; overflow: hidden; }
        }
        .sidebar-dragging * { transition: none !important; }
        body.block-dragging { cursor: grabbing !important; user-select: none !important; }
        body.block-dragging * { cursor: grabbing !important; user-select: none !important; }
        [data-drag-slot] { transition: opacity 150ms ease; }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${theme.BG.divider}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${theme.BG.hover}; box-shadow: 0 0 4px ${theme.BG.hover}40; }
        .tab-scroll::-webkit-scrollbar { height: 0px; }
        .tab-scroll::-webkit-scrollbar-track { background: transparent; }
        .tab-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
        .tab-scroll:hover::-webkit-scrollbar { height: 5px; }
        .tab-scroll:hover::-webkit-scrollbar-thumb { background: ${theme.BG.divider}; }
        .editor-scroll::-webkit-scrollbar-thumb { background: transparent; }
        .editor-scroll:hover::-webkit-scrollbar-thumb { background: ${theme.BG.divider}; }
        input::placeholder { color: ${theme.TEXT.muted}; }
        [contenteditable]:focus { outline: none; }
        .checkbox-box:active { transform: scale(0.85); }
        .tab-btn > .tab-close { opacity: 0; width: 0; overflow: hidden; margin-left: 0; transition: opacity 0.15s, width 0.1s, margin-left 0.1s; }
        .tab-btn:hover > .tab-close, .tab-btn.tab-active > .tab-close { opacity: 0.6; width: 16px; margin-left: 5px; }
        .tab-btn > .tab-close:hover { opacity: 1 !important; }
        [data-block-id] code {
          background: ${theme.inlineCode.bg};
          border: 1px solid ${theme.inlineCode.border};
          border-radius: 3px;
          padding: 1px 4px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 0.9em;
        }
        [data-block-id] a {
          color: ${theme.link.color};
          text-decoration: underline;
          text-decoration-color: ${theme.link.underline};
          cursor: pointer;
        }
        [data-block-id] a:hover {
          text-decoration-color: ${theme.link.color};
          background: ${theme.link.hoverBg};
          border-radius: 2px;
        }
        [data-block-id] .external-link-icon {
          font-size: 0.65em;
          opacity: 0.5;
          vertical-align: super;
          user-select: none;
          pointer-events: none;
          margin-left: 1px;
        }
        [data-block-id] a:hover .external-link-icon {
          opacity: 0.8;
        }
        [data-block-id] del {
          text-decoration: line-through;
          text-decoration-color: ${theme.ACCENT.primary};
          text-decoration-thickness: 1.5px;
          color: inherit;
        }
        [data-block-id] mark {
          background: ${theme.mark.bg};
          color: inherit;
          border-radius: 2px;
          padding: 0 2px;
        }
        [data-block-id] .inline-tag {
          color: ${theme.ACCENT.primary};
          opacity: 0.7;
          font-size: 0.92em;
        }
        [data-block-id] .wikilink {
          color: ${theme.wikilink.color};
          text-decoration: underline;
          text-decoration-style: dotted;
          text-decoration-color: ${theme.wikilink.underline};
          cursor: pointer;
        }
        [data-block-id] .wikilink:hover {
          text-decoration-color: ${theme.wikilink.color};
        }
        [data-block-id] .wikilink-broken {
          color: ${theme.wikilinkBroken.color};
          text-decoration-style: dashed;
          text-decoration-color: ${theme.wikilinkBroken.underline};
        }
        [data-block-id] .wikilink-broken:hover {
          color: ${theme.wikilinkBroken.hoverColor};
          text-decoration-color: ${theme.wikilinkBroken.hoverUnderline};
        }
        .code-block {
          position: relative;
          background: ${theme.codeBlockBg};
          border: 1px solid ${theme.codeBlockBorder};
          border-radius: 8px;
          margin: 8px 0;
          padding: 14px 16px;
          transition: border-color 0.15s;
        }
        .code-block:focus-within {
          border-color: ${theme.codeBlockBorderFocus};
        }
        .code-body {
          position: relative;
          overflow: hidden;
        }
        .code-textarea {
          display: block;
          width: 100%;
          min-height: 22px;
          padding: 0;
          margin: 0;
          background: transparent;
          color: transparent;
          -webkit-text-fill-color: transparent;
          caret-color: ${theme.caretColor};
          border: none;
          outline: none;
          resize: none;
          overflow: hidden;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          line-height: 1.6;
          tab-size: 4;
          white-space: pre-wrap;
          word-wrap: break-word;
          position: relative;
          z-index: 1;
        }
        .code-textarea::selection {
          background: ${theme.codeSelection};
          -webkit-text-fill-color: transparent;
        }
        .code-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          margin: 0;
          padding: 0;
          background: transparent;
          border: none;
          pointer-events: none;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          line-height: 1.6;
          tab-size: 4;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: ${theme.TEXT.primary};
          overflow: hidden;
        }
        .code-overlay code {
          display: block;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          background: transparent;
          border: none;
          padding: 0;
          border-radius: 0;
        }
        .code-line {
          position: relative;
          display: block;
        }
        .code-copy-wrapper {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 2;
          opacity: 0;
          transition: opacity 0.15s;
          pointer-events: auto;
        }
        .code-block:hover .code-copy-wrapper {
          opacity: 1;
        }
        .code-copy-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid ${theme.codeCopy.border};
          background: ${theme.codeCopy.bg};
          color: ${theme.codeCopy.color};
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          padding: 0;
        }
        .code-copy-btn:hover {
          background: ${theme.codeCopy.hoverBg};
          color: ${theme.codeCopy.hoverColor};
        }
        .code-lang-anchor {
          position: absolute;
          bottom: 8px;
          right: 10px;
          z-index: 2;
        }
        .code-lang {
          font-size: 11px;
          color: ${theme.codeLang.color};
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          user-select: none;
          cursor: pointer;
          transition: color 0.15s;
        }
        .code-lang:hover {
          color: ${theme.codeLang.hoverColor};
        }
        .code-lang-dropdown {
          position: absolute;
          bottom: calc(100% + 6px);
          right: 0;
          min-width: 140px;
          background: ${theme.BG.elevated};
          border: 1px solid ${theme.BG.divider};
          border-radius: 8px;
          padding: 4px 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          max-height: 260px;
          overflow-y: auto;
        }
        .code-lang-option {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 6px 12px;
          border: none;
          background: none;
          color: ${theme.TEXT.secondary};
          font-size: 12px;
          font-family: inherit;
          cursor: pointer;
          text-align: left;
        }
        .code-lang-option:hover {
          background: ${theme.codeLangOption.hoverBg};
          color: ${theme.TEXT.primary};
        }
        .code-lang-option-active {
          color: ${theme.TEXT.primary};
        }
        /* Code block context menu */
        .code-ctx-menu {
          position: fixed;
          z-index: 9999;
          min-width: 170px;
          background: ${theme.BG.elevated};
          border: 1px solid ${theme.BG.divider};
          border-radius: 8px;
          padding: 4px 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        .code-ctx-item {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 7px 14px;
          font-size: 12.5px;
          color: ${theme.TEXT.primary};
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          position: relative;
          gap: 4px;
        }
        .code-ctx-item:hover {
          background: rgba(255,255,255,0.06);
        }
        .code-ctx-danger { color: #f87171; }
        .code-ctx-danger:hover { background: rgba(248,113,113,0.1); }
        .code-ctx-active { color: ${theme.ACCENT.primary}; }
        .code-ctx-sep {
          height: 1px;
          background: ${theme.BG.divider};
          margin: 4px 0;
        }
        .code-ctx-submenu-trigger {
          position: relative;
        }
        .code-ctx-submenu {
          position: absolute;
          left: 100%;
          top: 0;
          min-width: 150px;
          background: ${theme.BG.elevated};
          border: 1px solid ${theme.BG.divider};
          border-radius: 8px;
          padding: 4px 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        /* Prism.js token colors */
        .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #636980; font-style: italic; }
        .token.punctuation { color: #9B9EB0; }
        .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol { color: #FF9E64; }
        .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin { color: #9ECE6A; }
        .token.operator, .token.entity, .token.url { color: #89DDFF; }
        .token.atrule, .token.attr-value, .token.keyword { color: #BB9AF7; }
        .token.function, .token.class-name { color: #7AA2F7; }
        .token.regex, .token.important, .token.variable { color: #E0AF68; }
        .token.important, .token.bold { font-weight: bold; }
        .token.italic { font-style: italic; }
        /* Callout block styles */
        .callout-block {
          margin: 8px 0;
        }
        .callout-icon-btn:hover {
          background: ${theme.calloutIconHover} !important;
        }
        .callout-title:empty::before {
          content: attr(data-placeholder);
          opacity: 0.35;
          pointer-events: none;
        }
        .callout-body:empty::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.5;
          pointer-events: none;
        }
        .callout-body p { margin: 0; }
        /* Table block styles */
        .table-outer {
          position: relative;
          outline: none;
        }
        .table-block-wrapper {
          overflow-x: auto;
          border-radius: 8px;
          border: 1px solid ${theme.BG.divider};
        }
        .table-block {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .table-block th, .table-block td {
          border: 1px solid ${theme.BG.divider};
          padding: 8px 12px;
          text-align: left;
          outline: none;
          min-width: 80px;
        }
        .table-block th {
          background: ${theme.tableTh};
          font-weight: 600;
          color: ${theme.TEXT.primary};
        }
        .table-block td {
          color: ${theme.TEXT.primary};
          background: transparent;
        }
        .table-block td:focus, .table-block th:focus {
          box-shadow: inset 0 0 0 2px ${theme.ACCENT.primary}50;
        }
        /* Edge zones */
        .table-left-zone { cursor: grab; }
        .table-left-zone:active { cursor: grabbing; }
        .table-top-zone { cursor: grab; }
        .table-top-zone:active { cursor: grabbing; }
        /* Add row/column bars */
        .table-bottom-zone:hover, .table-right-zone:hover {
          background: ${theme.ACCENT.primary}0A;
        }
        /* Preview rows */
        .table-preview-row td {
          background: ${theme.ACCENT.primary}08 !important;
          border-style: dashed !important;
        }
        /* Frontmatter block styles */
        .frontmatter-block {
          border-radius: 8px;
          border: 1px solid ${theme.BG.divider};
          background: ${theme.frontmatter};
          margin: 8px 0;
          overflow: hidden;
        }
        .frontmatter-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          color: ${theme.TEXT.muted};
          transition: color 0.15s;
        }
        .frontmatter-header:hover { color: ${theme.TEXT.secondary}; }
        .frontmatter-body {
          padding: 8px 12px;
          border-top: 1px solid ${theme.BG.divider};
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 12px;
          line-height: 1.6;
          color: ${theme.TEXT.secondary};
          white-space: pre-wrap;
        }
        .empty-block {
          position: relative;
        }
        .empty-block::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.4;
          position: absolute;
          pointer-events: none;
        }
        .empty-title::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.35;
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: none;
        }
      `}</style>

      {/* Onboarding toast (bottom-left, web only) */}
      {onboardingToast && !user && !window.electronAPI && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            background: accentColor,
            color: "#fff",
            padding: "14px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            maxWidth: 380,
            animation: "fadeIn 0.25s ease",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            Your notes are saved locally on this browser. Sign in to sync across devices — free
            with 100MB cloud storage.
            <br />
            <button
              onClick={() => {
                setOnboardingToast(false);
                localStorage.setItem("boojy-onboarding-dismissed", "true");
                setSettingsOpen(true);
                setSettingsTab("profile");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#fff",
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
                fontSize: 13,
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              Sign in
            </button>
          </div>
          <button
            onClick={() => {
              setOnboardingToast(false);
              localStorage.setItem("boojy-onboarding-dismissed", "true");
            }}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
              flexShrink: 0,
            }}
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {/* Persistence warning toast (bottom-left, web only) */}
      {persistenceWarning && !user && !window.electronAPI && !onboardingToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 24,
            background: theme.BG.elevated,
            color: theme.TEXT.primary,
            padding: "14px 20px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: theme.modalShadow,
            maxWidth: 380,
            animation: "fadeIn 0.25s ease",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            border: `1px solid ${theme.BG.divider}`,
          }}
        >
          <div style={{ flex: 1 }}>
            You have {Object.keys(noteData).filter((id) => !noteData[id]._draft).length} notes
            stored only in this browser. Sign in to back them up.
            <br />
            <button
              onClick={() => {
                setPersistenceWarning(false);
                localStorage.setItem("boojy-persistence-warning-dismissed", "true");
                setSettingsOpen(true);
                setSettingsTab("profile");
              }}
              style={{
                background: "none",
                border: "none",
                color: accentColor,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
                fontSize: 13,
                fontWeight: 600,
                marginTop: 6,
              }}
            >
              Sign in
            </button>
          </div>
          <button
            onClick={() => {
              setPersistenceWarning(false);
              localStorage.setItem("boojy-persistence-warning-dismissed", "true");
            }}
            style={{
              background: "none",
              border: "none",
              color: theme.TEXT.muted,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              padding: 0,
              flexShrink: 0,
            }}
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {/* First-sync confirmation modal */}
      {pendingFirstSync && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "fadeIn 0.15s ease",
          }}
          onClick={cancelFirstSync}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: theme.modalBg,
              borderRadius: 14,
              padding: "32px 36px",
              boxShadow: theme.modalShadow,
              maxWidth: 380,
              width: "90%",
              textAlign: "center",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px",
                fontSize: 18,
                fontWeight: 600,
                color: theme.TEXT.primary,
              }}
            >
              Sync your notes
            </h3>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: 14,
                color: theme.TEXT.secondary,
                lineHeight: 1.5,
              }}
            >
              {pendingFirstSync.noteCount} note{pendingFirstSync.noteCount !== 1 ? "s" : ""} will
              be uploaded to your account.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={cancelFirstSync}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: `1px solid ${theme.BG.divider}`,
                  background: "transparent",
                  color: theme.TEXT.secondary,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Not Now
              </button>
              <button
                onClick={confirmFirstSync}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: accentColor,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sync Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict toast notification */}
      {conflictToast && (
        <div
          onClick={() => {
            setActiveNote(conflictToast.conflictId);
            dismissConflictToast();
          }}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: theme.SEMANTIC?.warning || "#f59e0b",
            color: "#000",
            padding: "12px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            maxWidth: 360,
            animation: "fadeIn 0.2s ease",
          }}
        >
          Conflict detected on &ldquo;{conflictToast.noteTitle}&rdquo; — click to view copy
        </div>
      )}
    </div>
  );
}
