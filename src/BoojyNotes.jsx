import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  Fragment,
} from "react";
import { useNoteData, useNoteDataActions } from "./context/NoteDataContext";
import { useSettings } from "./context/SettingsContext";
import { useLayout } from "./context/LayoutContext";
import { useSidebar } from "./context/SidebarContext";
import { useOverlay } from "./context/OverlayContext";
import { useSync } from "./hooks/useSync";
import { useFileSystem } from "./hooks/useFileSystem";
import { useQuitFlush } from "./hooks/useQuitFlush";
import { useNoteNavigation } from "./hooks/useNoteNavigation";
import { useNoteCrud } from "./hooks/useNoteCrud";
import { useBlockOperations } from "./hooks/useBlockOperations";
import { useInlineFormatting } from "./hooks/useInlineFormatting";
import { useBlockDrag } from "./hooks/useBlockDrag";
import { useSidebarDrag } from "./hooks/useSidebarDrag";
import { useMultiSelect } from "./hooks/useMultiSelect";
import { useEditorHandlers } from "./hooks/useEditorHandlers";
import { useTheme } from "./hooks/useTheme";
import { useSplitView } from "./hooks/useSplitView";
import { useTabDrag } from "./hooks/useTabDrag";
import { loadFromStorage } from "./utils/storage";
import { Z } from "./constants/zIndex";
import { getBacklinksForNote } from "./utils/backlinkIndex";
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
import ConfirmDialog from "./components/ConfirmDialog";
import ConflictToast from "./components/ConflictToast";
import { useToast } from "./hooks/useToast";
import { useAppKeyboard } from "./hooks/useAppKeyboard";
import { useAppPersistence } from "./hooks/useAppPersistence";
import useOnboardingHints from "./hooks/useOnboardingHints";
import { useNoteStats } from "./hooks/useNoteStats";
import { useWebNags } from "./hooks/useWebNags";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { useSearchNavigation } from "./hooks/useSearchNavigation";
import { useTagHandlers } from "./hooks/useTagHandlers";
import { useExportImport } from "./hooks/useExportImport";
import { useWikilinkHandlers } from "./hooks/useWikilinkHandlers";
import { useEditorFocusUX } from "./hooks/useEditorFocusUX";
import { isElectron, isWeb } from "./utils/platform";
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
    unflushedNotes,
  } = useNoteDataActions();

  const { settingsOpen, setSettingsOpen, setSettingsTab, uiScale, setUiScale, user, profile } =
    useSettings();

  const {
    collapsed,
    setCollapsed,
    sidebarWidth,
    chromeBg,
    editorBg,
    accentColor,
    activeTabBg,
    tabFlip,
    setTabFlip,
    sidebarHandles,
    isDragging,
    startDrag,
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
    confirmState,
    requestConfirm,
    resolveConfirm,
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

  const { activeHint, dismissHint } = useOnboardingHints({
    noteCount: Object.keys(noteData).filter((id) => !noteData[id]._draft).length,
    isMobile,
    isEditorFocused: !!activeNote,
  });

  // Keep document + native window title in sync with the active note
  useDocumentTitle(activeNote, noteData[activeNote]?.title);

  const [, forceRender] = useState(0);
  const [toolbarState, setToolbarState] = useState(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // ── Onboarding & persistence warning toasts (web only) ────────────
  const { onboardingToast, setOnboardingToast, persistenceWarning, setPersistenceWarning } =
    useWebNags({ noteData, user });

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
  // On desktop, cloud sync is opt-in per device (off by default — local-only).
  // Passing a null user keeps every sync trigger inert, even when a Supabase
  // session was silently restored from a previous run.
  // Desktop dogfood build (w/c 2026-06-15): sync is disabled & hidden on desktop —
  // the engine stays dormant (null user below) and the Settings toggle is hidden.
  // Reversible: restore the localStorage opt-in here + the desktop Sync section in
  // ProfileTab to bring it back. Web (parked) is unchanged.
  const [syncEnabled, setSyncEnabled] = useState(() => !isElectron);
  const toggleSyncEnabled = useCallback((next) => {
    setSyncEnabled(next);
    try {
      localStorage.setItem("boojy-sync-enabled", next ? "1" : "0");
    } catch {
      // storage unavailable — the toggle still applies for this session
    }
  }, []);
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
  } = useSync(
    syncEnabled ? user : null,
    profile,
    noteData,
    setNoteData,
    activeNote,
    editedNoteHint,
    syncGeneration,
  );
  const {
    isElectron: isDesktop,
    notesDir,
    loading: fsLoading,
    changeNotesDir,
    flushToDisk,
  } = useFileSystem(
    noteData,
    setNoteData,
    setCustomFolders,
    trashedNotesRef,
    syncGeneration,
    setSidebarOrder,
    showToast,
  );
  useQuitFlush(flushToDisk, noteDataRef, unflushedNotes);
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
    moveBlock,
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
    moveBlock,
    onError: showToast,
  });
  // Search-result navigation (clear multi-select on search; scroll + highlight on open)
  const { handleSearchResultOpen } = useSearchNavigation({
    search,
    clearSelectionRef,
    blockRefs,
    accentColor,
    openNote,
  });

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

  // Export (PDF/DOCX) + import handlers, plus the Electron menu-bar listener
  const { handleExportPdf, handleExportDocx, handleImportIntoFolder } = useExportImport({
    noteData,
    activeNoteRef,
    noteDataRef,
    isElectron,
  });

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
    blockDrag,
    sidebarDrag,
    titleRef,
    searchInputRef,
    undo,
    redo,
    createNote,
    setSettingsOpen,
    setCollapsed,
    setActivePaneId,
    setUiScale,
    setTabFlip,
    splitPane,
    closeSplit,
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

  // Floating-toolbar positioning + focus/caret placement (single-pane only)
  useEditorFocusUX({
    splitState,
    splitStateRef,
    activeNote,
    editorRef,
    editorScrollRef,
    blockRefs,
    focusBlockId,
    focusCursorPos,
    noteDataRef,
    setToolbarState,
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
    if (isMobile) return; // On mobile, null activeNote = show sidebar
    createDraftNote();
  }, [activeNote, fsLoading, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Derived data ────────────────────────────────────────────────────
  const note = activeNote ? noteData[activeNote] : null;
  const noteTitle = note?.title;
  const { wordCount, charCount, charCountNoSpaces, readingTime } = useNoteStats(
    note?.content?.blocks,
  );

  // Wikilink + backlink wiring (title set, backlinks, click/cmd-click/select)
  const {
    noteTitleSet,
    backlinkIndex,
    currentBacklinks,
    handleWikilinkClick,
    handleWikilinkCmdClick,
    handleWikilinkSelect,
  } = useWikilinkHandlers({
    noteData,
    noteDataRef,
    activeNote,
    note,
    textOnlyEdit,
    openNote,
    createNote,
    splitState,
    getOtherPaneId,
    openNoteInPane,
    splitPaneWithNote,
    wikilinkMenuRef,
    setWikilinkMenu,
    syncGeneration,
    commitNoteData,
    blockRefs,
    focusBlockId,
    focusCursorPos,
  });

  // Tag interactions (sidebar filter on click; token-replace + caret restore on select)
  const { handleTagClick, handleTagSelect } = useTagHandlers({
    setSearch,
    tagMenuRef,
    noteDataRef,
    commitTextChange,
    syncGeneration,
    focusBlockId,
    focusCursorPos,
    setTagMenu,
  });

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

  // On web, deleting is permanent (no Trash to recover from) — confirm first.
  // On desktop, deleteNote moves to the OS trash, so it's recoverable; skip the prompt.
  const confirmDeleteNote = useCallback(
    async (id) => {
      const note = noteDataRef.current?.[id];
      if (isWeb) {
        const ok = await requestConfirm({
          title: "Delete note?",
          message: `"${note?.title || "Untitled"}" will be permanently deleted. This can't be undone.`,
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return false;
      }
      deleteNote(id);
      return true;
    },
    [deleteNote, requestConfirm, noteDataRef],
  );

  const confirmDeleteFolder = useCallback(
    async (folderPath) => {
      if (isWeb) {
        const name = folderPath.split("/").pop();
        const ok = await requestConfirm({
          title: "Delete folder?",
          message: `"${name}" and all notes inside it will be permanently deleted. This can't be undone.`,
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
      }
      deleteFolder(folderPath);
    },
    [deleteFolder, requestConfirm],
  );

  const bulkDeleteNotes = useCallback(
    async (ids) => {
      if (isWeb && ids.length > 0) {
        const ok = await requestConfirm({
          title: `Delete ${ids.length} note${ids.length !== 1 ? "s" : ""}?`,
          message: "These will be permanently deleted. This can't be undone.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
      }
      for (const id of ids) deleteNote(id);
      clearSelection();
    },
    [deleteNote, clearSelection, requestConfirm],
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
        note={note}
        noteTitle={noteTitle}
        createNote={createNote}
        onMorePress={() => setMoreMenuOpen(true)}
        onTitlePress={() => {
          const el = titleRef.current;
          if (!el) return;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          el.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }}
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
            isMobile={isMobile}
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
                activeHint={activeHint}
                dismissHint={dismissHint}
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
                        if (!file) return;
                        const blocks = noteDataRef.current[activeNote]?.content?.blocks;
                        const afterIndex = blocks ? blocks.length - 1 : 0;
                        saveAndInsertImage(activeNote, afterIndex, file);
                      });
                    }
                  }}
                />
              )}
            </EditorProvider>
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
            // EditorMoreMenu shows its own delete confirmation, so call the raw
            // delete here (avoids a second ConfirmDialog on web).
            deleteNote(id);
            setActiveNote(null);
          }}
          onMoveToFolder={(id, folder) => bulkMoveNotes([id], folder)}
          folderList={folderList}
          showToast={showToast}
        />
      )}

      {/* === Overlays === */}
      <ContextMenu
        ctxMenu={ctxMenu}
        setCtxMenu={setCtxMenu}
        openNote={openNote}
        duplicateNote={duplicateNote}
        deleteNote={confirmDeleteNote}
        deleteFolder={confirmDeleteFolder}
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
          syncEnabled={syncEnabled}
          onToggleSyncEnabled={toggleSyncEnabled}
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
          isSyncing={syncState === "syncing"}
          onConfirm={confirmFirstSync}
          onCancel={cancelFirstSync}
        />
      )}

      <ConfirmDialog
        confirm={confirmState}
        accentColor={accentColor}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />

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
              theme={theme}
              onDismiss={() => dismissToast(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
