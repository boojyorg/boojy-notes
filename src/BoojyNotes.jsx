import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useNoteData, useNoteDataActions } from "./context/NoteDataContext";
import { useSettings } from "./context/SettingsContext";
import { useLayout, SIDEBAR_SCRIM } from "./context/LayoutContext";
import { useSidebar } from "./context/SidebarContext";
import { useOverlay } from "./context/OverlayContext";
import { useFileSystem } from "./hooks/useFileSystem";
import { useQuitFlush } from "./hooks/useQuitFlush";
import { useActiveNote } from "./hooks/useActiveNote";
import { useNoteCrud } from "./hooks/useNoteCrud";
import { useBlockOperations } from "./hooks/useBlockOperations";
import { useInlineFormatting } from "./hooks/useInlineFormatting";
import { useBlockDrag } from "./hooks/useBlockDrag";
import { useSidebarDrag } from "./hooks/useSidebarDrag";
import { useMultiSelect } from "./hooks/useMultiSelect";
import { useEditorHandlers } from "./hooks/useEditorHandlers";
import { useTheme } from "./hooks/useTheme";
import { Z } from "./constants/zIndex";
const SettingsModal = React.lazy(() => import("./components/settings/SettingsModal"));
import ContextMenu from "./components/ContextMenu";
import SlashMenu from "./components/SlashMenu";
import WikilinkMenu from "./components/WikilinkMenu";
import TagMenu from "./components/TagMenu";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import { EditorProvider } from "./context/EditorContext";
import EditorArea from "./components/EditorArea";
import ImageLightbox from "./components/ImageLightbox";
import FloatingActionButton from "./components/mobile/FloatingActionButton";
import MobileToolbar from "./components/mobile/MobileToolbar";
import EditorMoreMenu from "./components/mobile/EditorMoreMenu";
import { useKeyboard } from "./hooks/useKeyboard";
import GlobalStyles from "./components/GlobalStyles";
import Toast from "./components/Toast";
import TitleBar, { TITLE_BAR_H } from "./components/TitleBar";
import EditorChrome from "./components/EditorChrome";
import ConfirmDialog from "./components/ConfirmDialog";
import { useToast } from "./hooks/useToast";
import { useAppKeyboard } from "./hooks/useAppKeyboard";
import { useAppPersistence } from "./hooks/useAppPersistence";
import useOnboardingHints from "./hooks/useOnboardingHints";
import { useNoteStats } from "./hooks/useNoteStats";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { useSearchNavigation } from "./hooks/useSearchNavigation";
import { useTagHandlers } from "./hooks/useTagHandlers";
import { useImport } from "./hooks/useImport";
import { useWikilinkHandlers } from "./hooks/useWikilinkHandlers";
import { useEditorFocusUX } from "./hooks/useEditorFocusUX";
import { isElectron, isWeb } from "./utils/platform";
import { getAPI } from "./services/apiProvider";
import { useIsMobile } from "./hooks/useIsMobile";

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
    unflushedNotes,
  } = useNoteDataActions();

  const { settingsOpen, setSettingsOpen, uiScale, setUiScale } = useSettings();

  const {
    sidebarWidth,
    sidebarOverlay,
    sidebarInFlow,
    sidebarVisible,
    overlayOpen,
    overlayWidth,
    closeOverlay,
    revealSidebar,
    chromeBg,
    editorBg,
    accentColor,
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
    setRenamingFolder,
    filteredTree,
    fNotes,
    folderList,
    markOpened,
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
  // Navigation state: one active note. Opening a note replaces the current one.
  const { activeNote, setActiveNote } = useActiveNote();

  const [editorFadeIn, setEditorFadeIn] = useState(false);

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

  // ── Refs ────────────────────────────────────────────────────────────
  const blockRefs = useRef({});
  const editorRef = useRef(null);
  const titleRef = useRef(null);
  const focusBlockId = useRef(null);
  const focusCursorPos = useRef(null);
  const mouseIsDown = useRef(false);
  const editorScrollRef = useRef(null);

  // ── Sync activeNoteRef from context ─────────────────────────────────
  activeNoteRef.current = activeNote;

  // ── External hooks ──────────────────────────────────────────────────
  const {
    isElectron: isDesktop,
    notesDir,
    loading: fsLoading,
    changeNotesDir,
    flushToDisk,
  } = useFileSystem(noteData, setNoteData, setCustomFolders, syncGeneration, showToast);
  useQuitFlush(flushToDisk, noteDataRef, unflushedNotes);
  const toggle = useCallback((n) => setExpanded((p) => ({ ...p, [n]: !p[n] })), [setExpanded]);
  /**
   * Opening a note dismisses an overlay sidebar — by click or by drag. The
   * overlay is transient navigation; leaving it up over the note you just asked
   * for would mean dismissing it by hand every single time. (Revert: drop the
   * closeOverlay call and openNote goes back to being setActiveNote.)
   */
  const openNote = useCallback(
    (id) => {
      closeOverlay();
      // Recency is stamped here, the one place a note becomes the open one.
      // The promotion is immediate and deliberate: in "Most recent" the row
      // jumps to the top of its list as you click it. (Revert: drop this line
      // and recency stops updating.)
      markOpened(id);
      setActiveNote(id);
    },
    [closeOverlay, markOpened, setActiveNote],
  );
  const {
    createNote,
    deleteNote,
    duplicateNote,
    renameFolder,
    deleteFolder,
    createFolder,
    createDraftNote,
    promoteDraft,
    discardDraft,
  } = useNoteCrud({
    commitNoteData,
    noteDataRef,
    setActiveNote,
    activeNote,
    setCustomFolders,
    customFolders,
    setExpanded,
    titleRef,
    setRenamingFolder,
    markOpened,
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
    customFolders,
    sidebarScrollRef,
    accentColor,
    chromeBg,
    setDragTooltip,
    dragTooltipCount,
    selectedNotesRef: multiSelectRef,
    clearSelectionRef: clearSelectionRef,
    openNote,
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
  // Import handlers, plus the Electron File-menu listener
  const { handleImportIntoFolder } = useImport({
    isElectron,
  });

  // Editor fade-in + title sync
  useEffect(() => {
    setEditorFadeIn(false);
    setSelectedImageBlockId(null);
    setLightbox(null);
    const t = setTimeout(() => setEditorFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [activeNote]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const title = noteData[activeNote]?.content?.title;
    if (titleRef.current && title !== undefined) {
      if (title === "") {
        titleRef.current.innerHTML = "<br>";
      } else {
        titleRef.current.innerText = title;
      }
    }
  }, [activeNote, syncGeneration.current]); // eslint-disable-line -- only on note switch + external sync, NOT every keystroke

  useAppKeyboard({
    activeNote,
    noteData,
    uiScale,
    settingsOpen,
    overlayOpen,
    blockDrag,
    sidebarDrag,
    titleRef,
    searchInputRef,
    undo,
    redo,
    createNote,
    setSettingsOpen,
    revealSidebar,
    closeOverlay,
    setUiScale,
    cancelBlockDrag,
    cancelSidebarDrag,
  });

  useAppPersistence({
    activeNote,
    expanded,
    noteData,
    customFolders,
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

  // NOTE: `.boojy-meta.json` files are deliberately left alone. Boojy no longer
  // reads or writes noteOrder/folderOrder — folders are always alphabetical and
  // notes follow the sort preference — but the files stay on disk untouched, so
  // any foreign keys in them are safe and an old manual arrangement is recoverable.

  // Floating-toolbar positioning + focus/caret placement
  useEditorFocusUX({
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
  useEffect(() => {
    if (fsLoading) return;
    if (activeNote && !noteData[activeNote]) {
      setActiveNote(null);
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
  const { wordCount, charCount } = useNoteStats(note?.content?.blocks);

  // Wikilink + backlink wiring (title set, backlinks, click/cmd-click/select)
  const {
    noteTitleSet,
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
  // On desktop, deleteNote moves the Markdown file to the OS Trash/Recycle Bin,
  // so it remains externally recoverable; skip the prompt.
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
      {/* Minimal chrome: two pinned controls instead of a top strip (desktop/web). */}
      {!isMobile && (
        <EditorChrome
          topOffset={isDesktop ? TITLE_BAR_H : 0}
          activeNote={activeNote}
          onNoteActions={({ x, y }) => setCtxMenu({ x, y, type: "note", id: activeNote })}
        />
      )}
      <TopBar
        isMobile={isMobile}
        activeNote={activeNote}
        setActiveNote={setActiveNote}
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
      />

      {/* === MAIN AREA === */}
      <div
        id="main-content"
        style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}
      >
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
              : sidebarOverlay
                ? {
                    // Too narrow for both: the same sidebar, painted over the
                    // editor instead of beside it. Kept mounted while closed so
                    // drag queries and scroll position survive.
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: overlayWidth,
                    background: chromeBg,
                    borderRight: `1px solid ${theme.BG.divider}`,
                    boxShadow: sidebarVisible ? theme.modalShadow : "none",
                    display: "flex",
                    overflow: "hidden",
                    zIndex: Z.SIDEBAR_OVERLAY,
                    transform: sidebarVisible ? "translateX(0)" : "translateX(-100%)",
                    visibility: sidebarVisible ? "visible" : "hidden",
                    transition: "transform 0.2s ease, visibility 0.2s ease, box-shadow 0.2s ease",
                  }
                : {
                    width: sidebarVisible ? sidebarWidth : 0,
                    minWidth: sidebarVisible ? sidebarWidth : 0,
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
        {/* Scrim behind an open overlay. It stays subtle because the sidebar is
            navigation, not a modal. Click-away closes on mousedown so the
            dismissing press can't also land in the editor. */}
        {!isMobile && sidebarOverlay && (
          <div
            data-testid="sidebar-overlay-scrim"
            aria-hidden="true"
            onMouseDown={closeOverlay}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: Z.SIDEBAR_SCRIM,
              background: SIDEBAR_SCRIM,
              opacity: sidebarVisible ? 1 : 0,
              pointerEvents: sidebarVisible ? "auto" : "none",
              transition: "opacity 0.2s ease",
            }}
          />
        )}
        {/* Sidebar drag handle — desktop only, and only while the sidebar is
            actually in the layout. Hidden when collapsed (its 4px fill + 1px
            border left a hairline strip down the left edge instead of the
            sidebar fully disappearing) and hidden in overlay mode, where it
            would sit over the editor resizing a panel that isn't in flow. */}
        {!isMobile && sidebarInFlow && (
          <div
            ref={(el) => {
              // Assign null on unmount too, so the hover handlers don't restyle a
              // detached node once the sidebar collapses.
              sidebarHandles.current[1] = el;
            }}
            onMouseDown={startDrag}
            style={{
              width: 4,
              cursor: "col-resize",
              background: chromeBg,
              // The sidebar and editor already use different surface tones, so a
              // permanent border would repeat the same separation signal.
              flexShrink: 0,
              transition: "background 0.15s",
            }}
            onMouseEnter={() => {
              // Neutral, never accent: the handle is chrome, and the accent is
              // reserved for identity/focus/markers. Hover is a whisper; the
              // col-resize cursor is what actually announces the affordance.
              if (!isDragging.current) {
                for (const handle of sidebarHandles.current) {
                  if (handle) handle.style.background = theme.sidebarHandle.hover;
                }
              }
            }}
            onMouseLeave={() => {
              if (!isDragging.current) {
                for (const handle of sidebarHandles.current) {
                  if (handle) handle.style.background = chromeBg;
                }
              }
            }}
          />
        )}
        {/* Editor area */}
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
        titleRef={titleRef}
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
          isDesktop={isDesktop}
          notesDir={notesDir}
          changeNotesDir={changeNotesDir}
        />
      </React.Suspense>

      <GlobalStyles />

      <ConfirmDialog
        confirm={confirmState}
        accentColor={accentColor}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />

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
