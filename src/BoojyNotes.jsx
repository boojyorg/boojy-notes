import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { trace } from "./utils/trace";
import { useNoteData, useNoteDataActions } from "./context/NoteDataContext";
import { useSettings } from "./context/SettingsContext";
import { useLayout } from "./context/LayoutContext";
import { panelTransition } from "./tokens/motion";
import { useSidebar } from "./context/SidebarContext";
import { useOverlay } from "./context/OverlayContext";
import { useFileSystem } from "./hooks/useFileSystem";
import { useQuitFlush } from "./hooks/useQuitFlush";
import { useActiveNote } from "./hooks/useActiveNote";
import { useNoteCrud } from "./hooks/useNoteCrud";
import { useBlockOperations } from "./hooks/useBlockOperations";
import { EMPTY_FORMATS, useInlineFormatting } from "./hooks/useInlineFormatting";
import { useBlockDrag } from "./hooks/useBlockDrag";
import { useSidebarDrag } from "./hooks/useSidebarDrag";
import { useMultiSelect } from "./hooks/useMultiSelect";
import { useEditorHandlers } from "./hooks/useEditorHandlers";
import { useTheme } from "./hooks/useTheme";
import { Z } from "./constants/zIndex";
const SettingsModal = React.lazy(() => import("./components/settings/SettingsModal"));
const SetupDialog = React.lazy(() => import("./components/settings/SetupDialog"));
import { FolderOpenIcon } from "./components/Icons";
import ContextMenu from "./components/ContextMenu";
import PathTreeMenu from "./components/PathTreeMenu";
import { ancestorFolders, parentFolder, sharedFolder } from "./utils/pathTree";
import SlashMenu from "./components/SlashMenu";
import WikilinkMenu from "./components/WikilinkMenu";
import TagMenu from "./components/TagMenu";
import TopBarMobile from "./components/mobile/TopBarMobile";
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
import EditorChrome from "./components/EditorChrome";
import ConfirmDialog from "./components/ConfirmDialog";
import { useToast } from "./hooks/useToast";
import UiScaleChip from "./components/UiScaleChip";
import { atScale } from "./utils/uiScale";
import { useAppKeyboard } from "./hooks/useAppKeyboard";
import { useAppPersistence } from "./hooks/useAppPersistence";
import { useNoteStats } from "./hooks/useNoteStats";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { useResolvedTitle } from "./hooks/useResolvedTitle";
import { getCaretOffset, placeCaret } from "./utils/domHelpers";
import { deletionPrompt, trashedToast } from "./utils/deletionPrompt";
import { useSearchNavigation } from "./hooks/useSearchNavigation";
import SearchPalette from "./components/SearchPalette";
import { useTagHandlers } from "./hooks/useTagHandlers";
import { useWikilinkHandlers } from "./hooks/useWikilinkHandlers";
import { useEditorFocusUX } from "./hooks/useEditorFocusUX";
import { isElectron, isWeb } from "./utils/platform";
import { resolveAttachmentUrl } from "./utils/attachmentUrl";
import { getAPI } from "./services/apiProvider";
import { useIsMobile } from "./hooks/useIsMobile";

export default function BoojyNotes() {
  const { theme } = useTheme();
  const { toasts, showToast, dismissToast } = useToast();
  const isMobile = useIsMobile();
  const mobileKeyboard = useKeyboard();

  // ── Contexts ───────────────────────────────────────────────────────
  const { noteData } = useNoteData();
  const {
    syncGeneration,
    activeNoteRef,
    undo,
    redo,
    onActiveNoteChanged,
    commitNoteData,
    adoptNoteData,
    applyExternalNote,
    remapNoteFolders,
    replaceNoteData,
    commitTextChange,
    noteDataRef,
    textOnlyEdit,
    textOnlyEditForEditor,
    unflushedNotes,
  } = useNoteDataActions();

  const { uiScale, setUiScale, settingsOpen, setSettingsOpen } = useSettings();

  const {
    sidebarWidth,
    sidebarVisible,
    revealSidebar,
    toggleSidebar,
    chromeBg,
    accentColor,
    sidebarHandles,
    isDragging,
    startDrag,
  } = useLayout();

  const {
    search,
    setSearch,
    sidebarScrollRef,
    expanded,
    setExpanded,
    customFolders,
    setCustomFolders,
    setRenamingFolder,
    setRenamingNote,
    markNewFolder,
    markNewRows,
    filteredTree,
    fNotes,
    folderList,
    markEdited,
  } = useSidebar();

  const {
    ctxMenu,
    setCtxMenu,
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

  // Undo and redo belong to the open note, so history is told when that
  // changes: it closes the previous note's typing group and re-reads what
  // the newly open note has to undo. The ref above is already the new id.
  // Navigation is not an edit and nothing is pushed or dropped.
  useEffect(() => {
    onActiveNoteChanged();
  }, [activeNote, onActiveNoteChanged]);

  // A persisted note's title is its filename: when a write lands under
  // another basename, the title follows it, in state and in the title field.
  const { onTitleResolved, settleTitle } = useResolvedTitle({
    titleRef,
    activeNoteRef,
    noteDataRef,
    adoptNoteData,
  });

  // The open note changed on disk while edits were pending, and the local
  // version has just been saved as a conflict copy. Continue in the copy: it
  // keeps the note's block ids, so the caret's block and offset carry over
  // through the focus refs the note switch consumes.
  const onExternalConflict = useCallback(
    ({ title, copyId, copyTitle, active = true }) => {
      // The note on screen continues in its copy, caret carried over. A note
      // the user has left keeps its copy as a sidebar row: the toast says so,
      // and nothing jumps away from what they are reading.
      if (active) {
        const sel = window.getSelection();
        const node = sel?.rangeCount ? sel.anchorNode : null;
        const blockEl = (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.(
          "[data-block-id]",
        );
        const blockId = blockEl?.getAttribute("data-block-id");
        const el = blockId ? blockRefs.current[blockId] : null;
        if (el && editorRef.current?.contains(el)) {
          focusBlockId.current = blockId;
          focusCursorPos.current = Math.max(0, getCaretOffset(el));
        }
        setActiveNote(copyId);
      }
      showToast(
        `"${title}" changed outside Boojy Notes. Your edits were kept in "${copyTitle}".`,
        "notice",
      );
    },
    [setActiveNote, showToast],
  );

  // ── External hooks ──────────────────────────────────────────────────
  const {
    isElectron: isDesktop,
    notesDir,
    loading: fsLoading,
    changeNotesDir,
    flushToDisk,
    folderOps,
  } = useFileSystem(noteData, setCustomFolders, syncGeneration, showToast, {
    unflushedNotes,
    latestNoteDataRef: noteDataRef,
    activeNoteRef,
    applyExternalNote,
    adoptNoteData,
    replaceNoteData,
    onExternalConflict,
    onNotesEdited: markEdited,
    onTitleResolved,
    remapNoteFolders,
  });
  useQuitFlush(flushToDisk, noteDataRef, unflushedNotes);
  const revealVault = useCallback(() => {
    if (notesDir) window.electronAPI?.showItemInFolder(notesDir);
  }, [notesDir]);

  // Settings → Change folder… says first that the current notes stay where
  // they are, then opens the picker; the app never moves notes (2026-09-17).
  // Setup skips the question: a first launch has no notes to leave behind.
  const changeNotesDirFromSettings = useCallback(async () => {
    const ok = await requestConfirm({
      title: "Change notes folder?",
      message: "Your current notes will stay where they are.",
      confirmLabel: "Choose folder…",
      confirmIcon: <FolderOpenIcon />,
    });
    if (ok) changeNotesDir();
  }, [requestConfirm, changeNotesDir]);

  // ── First-run setup ──────────────────────────────────────────────────
  // Shown once, on a launch that has never had a notes folder (the main
  // process decides; an existing user's config is settled before the window
  // exists). Every way out saves the choice on screen and lands in the draft
  // note the empty app already opened: Create note puts the caret in its
  // body, a dismissal in its name, as Cmd+N does. Nothing is written until
  // the first keystroke.
  const [firstRun, setFirstRun] = useState(false);
  const [setupFolderExists, setSetupFolderExists] = useState(false);
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.getSetupState) return;
    let cancelled = false;
    window.electronAPI.getSetupState().then((state) => {
      if (!cancelled && state?.firstRun) setFirstRun(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const chooseFolderInSetup = useCallback(async () => {
    await changeNotesDir();
    // A chosen folder is a real one: its path can show it from now on.
    setSetupFolderExists(true);
  }, [changeNotesDir]);
  const finishSetup = useCallback(
    async (how) => {
      setFirstRun(false);
      try {
        await window.electronAPI?.completeSetup?.();
      } catch (err) {
        console.error("completeSetup failed", err);
      }
      requestAnimationFrame(() => {
        const id = activeNoteRef.current;
        const first = id ? noteDataRef.current[id]?.content?.blocks?.[0] : null;
        const el = first ? blockRefs.current[first.id] : null;
        if (how === "create" && el) {
          el.closest('[contenteditable="true"]')?.focus();
          placeCaret(el, 0);
        } else {
          titleRef.current?.focus();
        }
      });
    },
    [activeNoteRef, noteDataRef],
  );
  const toggle = useCallback((n) => setExpanded((p) => ({ ...p, [n]: !p[n] })), [setExpanded]);
  // Opening is side-effect-free for ordering: "Most recent" means most
  // recently modified, and the row must not move under the pointer.
  const openNote = setActiveNote;

  // Start renaming a note where the user can see it: the sidebar row swaps to
  // an inline input (same grammar as folder rename). Only when the sidebar is
  // hidden — e.g. Rename from the editor's ··· with the panel collapsed — does
  // it fall back to focusing the editor title, caret at the end (no select-all
  // wash; judged live 2026-08-23).
  const startNoteRename = useCallback(
    (id) => {
      if (sidebarVisible) {
        setRenamingNote(id);
        return;
      }
      openNote(id);
      setTimeout(() => {
        const el = titleRef.current;
        if (!el) return;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }, 60);
    },
    [sidebarVisible, setRenamingNote, openNote],
  );
  const {
    createNote,
    deleteNote,
    duplicateNote,
    renameNote,
    renameFolder,
    moveFolder,
    deleteFolder,
    createFolder,
    duplicateFolder,
    createDraftNote,
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
    markNewFolder,
    folderOps,
    onError: showToast,
  });
  const {
    updateBlockText,
    insertBlockAfter,
    openCodeBlock,
    openDivider,
    deleteBlock,
    updateBlockProperty,
    saveAndInsertImage,
    flipCheck,
    registerBlockRef,
    updateCodeLang,
    updateCallout,
    updateCalloutTitle,
    updateTableCell,
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

  // The selected whole block (a divider or an image; see isSelectableBlock) + lightbox state
  const [selectedBlockId, setSelectedBlockId] = useState(null);

  // Link popover state
  const [linkPopover, setLinkPopover] = useState(null);
  const openLinkEditor = useCallback(() => {
    if (getLinkContextRef.current) {
      const ctx = getLinkContextRef.current();
      if (ctx) setLinkPopover(ctx);
    }
  }, []);
  const getLinkContextRef = useRef(null);

  const { applyFormat, detectActiveFormats, reReadBlockFromDom, getLinkContext } =
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

  const { blockDrag, startHandleDrag, cancelBlockDrag } = useBlockDrag({
    noteDataRef,
    activeNoteRef,
    commitNoteData,
    blockRefs,
    editorRef,
    editorScrollRef,
    setToolbarState,
  });
  const multiSelectRef = useRef(null);
  const clearSelectionRef = useRef(null);
  // Read by the paste handler (frozen at mount) to paint wikilinks when it
  // repaints a block directly; filled below once useWikilinkHandlers runs.
  const noteTitleSetRef = useRef(null);
  // The drag's moves are the app's own (`moveNotesTo`, `moveFolderTo`,
  // defined below with the selection they clear), read through a ref at drop
  // time; the hook's handlers are made once.
  const moveRef = useRef(null);
  const { sidebarDrag, handleSidebarPointerDown, cancelSidebarDrag } = useSidebarDrag({
    noteDataRef,
    moveNotes: (ids, folder, opts) => moveRef.current?.moveNotesTo(ids, folder, opts),
    sidebarScrollRef,
    selectedNotesRef: multiSelectRef,
    clearSelectionRef: clearSelectionRef,
    moveFolder: (path, parent, opts) => moveRef.current?.moveFolderTo(path, parent, opts),
  });
  const {
    handleEditorKeyDown,
    handleEditorInput,
    handleEditorMouseUp,
    handleEditorMouseDown,
    handleEditorFocus,
    handleEditorPaste,
    handleEditorCopy,
    handleEditorCut,
    handleEditorBeforeInput,
    handleEditorDragOver,
    handleEditorDragLeave,
    handleEditorDrop,
    executeSlashCommand,
  } = useEditorHandlers({
    noteDataRef,
    noteTitleSetRef,
    activeNote,
    commitNoteData,
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
    openCodeBlock,
    openDivider,
    deleteBlock,
    saveAndInsertImage,
    reReadBlockFromDom,
    applyFormat,
    mouseIsDown,
    updateBlockIndent,
    moveBlock,
    selectBlock: setSelectedBlockId,
    onError: showToast,
  });
  // Search-result navigation (clear multi-select on search; scroll + highlight on open)
  // The desktop search palette (Cmd+P). Closing clears the shared search
  // state so the sidebar tree, filtered behind the scrim, comes back whole.
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => {
    if (!isMobile) setSearchOpen(true);
  }, [isMobile]);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearch("");
  }, [setSearch]);
  const { handleSearchResultOpen } = useSearchNavigation({
    search,
    clearSelectionRef,
    blockRefs,
    accentColor,
    openNote,
  });

  // ── Effects ─────────────────────────────────────────────────────────
  // Editor fade-in + title sync
  useEffect(() => {
    setEditorFadeIn(false);
    setSelectedBlockId(null);
    setLightbox(null);
    const t = setTimeout(() => setEditorFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [activeNote]);

  useLayoutEffect(() => {
    const title = noteData[activeNote]?.content?.title;
    trace("title sync effect", activeNote, "syncGen", syncGeneration.current);
    const el = titleRef.current;
    if (el && title !== undefined) {
      // A repaint under the caret (an undo while renaming, a paste elsewhere
      // bumping syncGen) threw it to the start of the name; the offset is
      // remembered and put back, clamped, as a block's repaint does
      // (2026-09-20). A field already holding the text is left alone.
      const focused = document.activeElement === el;
      if (focused && (el.textContent ?? "") === title && title !== "") return;
      const caret = focused ? getCaretOffset(el) : -1;
      if (title === "") {
        el.innerHTML = "<br>";
      } else {
        el.innerText = title;
      }
      if (caret >= 0) placeCaret(el, Math.min(caret, title.length));
    }
  }, [activeNote, syncGeneration.current]); // only on note switch + external sync, NOT every keystroke

  // A rename made elsewhere — the sidebar row, or the filename the write
  // actually produced — reaches the title field as long as the user is not in
  // it. While they are, the field is ahead of state (its commit is debounced)
  // and a repaint would throw the caret to the start, so it is left alone;
  // useResolvedTitle handles that case with the caret preserved.
  const openNoteTitle = noteData[activeNote]?.title;
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el || openNoteTitle === undefined || document.activeElement === el) return;
    if ((el.textContent ?? "") === openNoteTitle) return;
    if (openNoteTitle === "") el.innerHTML = "<br>";
    else el.textContent = openNoteTitle;
  }, [openNoteTitle]);

  // The scale's own feedback: a shortcut says what it changed the scale to,
  // Cmd+0 included, and a press at either end of the range answers with the
  // scale it is on. Settings' own control needs none of this — the figure is
  // beside the buttons — so only the keyboard path raises it.
  const [scaleHint, setScaleHint] = useState(null);
  const hideScaleHint = useCallback(() => setScaleHint(null), []);
  const setUiScaleByKey = useCallback(
    (next) => {
      setUiScale(next);
      setScaleHint({ at: Date.now(), scale: next });
    },
    [setUiScale],
  );

  useAppKeyboard({
    activeNote,
    noteData,
    uiScale,
    blockDrag,
    sidebarDrag,
    titleRef,
    undo,
    redo,
    createNote,
    createFolder,
    revealSidebar,
    toggleSidebar,
    openSearch,
    openSettings: () => setSettingsOpen(true),
    setUiScale: setUiScaleByKey,
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

  // Registered once. Both cancel functions read the drag's own state through
  // refs (useBlockDrag keys its restore by the note the drag started in), so
  // the mount-time capture is safe — don't hand them anything render-bound.
  useEffect(() => {
    // Unconditional: each cancel handles the inactive case itself, and a
    // press on the grip (or a held sidebar row) that never became a drag
    // still holds window listeners. Guarded on `.active`, a press followed
    // by Cmd-Tab left them, and the next pointer movement started a phantom
    // drag with no button down that hid the grip app-wide and dropped a block
    // on the next click (2026-09-20).
    const onBlur = () => {
      cancelBlockDrag();
      cancelSidebarDrag();
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
    mouseIsDown,
  });

  // ── Ghost note (draft) effects ────────────────────────────────────────
  useEffect(() => {
    if (fsLoading) return;
    if (activeNote && !noteData[activeNote]) {
      setActiveNote(null);
    }
  }, [fsLoading, noteData, activeNote]);

  useEffect(() => {
    if (fsLoading) return;
    if (activeNote) return;
    if (isMobile) return; // On mobile, null activeNote = show sidebar
    createDraftNote();
  }, [activeNote, fsLoading, isMobile]);

  // A draft ends at the keystroke that first gives it text (useHistory's
  // commitTextChange), never here on state: read 300 ms late, the discard
  // below and the quit flush saw a draft and lost the text.
  const prevActiveRef = useRef(null);
  useEffect(() => {
    const prevId = prevActiveRef.current;
    prevActiveRef.current = activeNote;
    if (prevId && prevId !== activeNote && noteDataRef.current[prevId]?._draft) {
      discardDraft(prevId);
    }
  }, [activeNote]);

  // ── Derived data ────────────────────────────────────────────────────
  const note = activeNote ? noteData[activeNote] : null;
  const noteTitle = note?.title;
  const { wordCount, charCount } = useNoteStats(note?.content?.blocks);

  // Wikilink wiring (title set, click/select)
  const { noteTitleSet, handleWikilinkClick, handleWikilinkSelect } = useWikilinkHandlers({
    noteData,
    noteDataRef,
    textOnlyEdit,
    openNote,
    createNote,
    wikilinkMenuRef,
    setWikilinkMenu,
    syncGeneration,
    commitNoteData,
    focusBlockId,
    focusCursorPos,
    showToast,
  });
  noteTitleSetRef.current = noteTitleSet;

  // Tag interactions (sidebar filter on click; token-replace + caret restore on select)
  const { handleTagClick, handleTagSelect } = useTagHandlers({
    setSearch,
    openSearch,
    tagMenuRef,
    noteDataRef,
    blockRefs,
    noteTitleSetRef,
    commitNoteData,
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

  // Deletion asks only when it should, in words that say what happens
  // (utils/deletionPrompt owns the wording). Desktop moves a note's file to the
  // OS Trash: a single note goes at once with a quiet toast; a folder or a bulk
  // selection asks first. The folder on disk and any file in it that is not a
  // note are never touched. Web deletion is permanent, so every kind asks.
  const askBeforeDeleting = useCallback(
    async (kind, ctx) => {
      const prompt = deletionPrompt(kind, { ...ctx, isWeb });
      return prompt ? requestConfirm(prompt) : true;
    },
    [requestConfirm],
  );

  const confirmDeleteNote = useCallback(
    async (id) => {
      const note = noteDataRef.current?.[id];
      if (!(await askBeforeDeleting("note", { count: 1, name: note?.title }))) return false;
      deleteNote(id);
      if (!isWeb) showToast(trashedToast(note?.title), "done", { icon: "trash" });
      return true;
    },
    [deleteNote, askBeforeDeleting, noteDataRef, showToast],
  );

  const confirmDeleteFolder = useCallback(
    async (folderPath) => {
      const count = Object.values(noteDataRef.current || {}).filter(
        (n) => n.folder && (n.folder === folderPath || n.folder.startsWith(`${folderPath}/`)),
      ).length;
      const name = folderPath.split("/").pop();
      if (!(await askBeforeDeleting("folder", { count, name }))) return;
      deleteFolder(folderPath);
    },
    [deleteFolder, askBeforeDeleting, noteDataRef],
  );

  const bulkDeleteNotes = useCallback(
    async (ids) => {
      if (!(await askBeforeDeleting("bulk", { count: ids.length }))) return;
      for (const id of ids) deleteNote(id);
      clearSelection();
    },
    [deleteNote, clearSelection, askBeforeDeleting],
  );

  // A location is a change of record, adopted without an undo entry; undo
  // never moves a file (see restoreSnapshot in useHistory).
  const bulkMoveNotes = useCallback(
    (ids, folder) => {
      adoptNoteData((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          if (next[id]) next[id] = { ...next[id], folder: folder || null };
        }
        return next;
      });
      clearSelection();
    },
    [adoptNoteData, clearSelection],
  );

  // ── Moving, from wherever it was asked ──────────────────────────────
  // Move to… (every menu), a drag in the sidebar and a drag in the path's
  // popup end here (2026-09-20). Where the thing landed is shown, not
  // announced: the destination and the folders above it open in the sidebar
  // and the moved rows wear the row pill for a beat (`markNewRows`), if the
  // sidebar is showing; a hidden sidebar keeps the state and is never
  // reopened for it. A drag made in the sidebar itself skips the reveal —
  // the pointer is already on the destination.
  const revealInSidebar = useCallback(
    (folder, rows) => {
      const open = folder ? [...ancestorFolders(folder), folder] : [];
      if (open.length > 0)
        setExpanded((prev) => {
          if (open.every((f) => prev[f])) return prev;
          const next = { ...prev };
          for (const f of open) next[f] = true;
          return next;
        });
      markNewRows(rows);
    },
    [setExpanded, markNewRows],
  );
  const moveNotesTo = useCallback(
    (ids, folder, { reveal = true } = {}) => {
      const dest = folder || null;
      // Only what actually changes place is written or lit; a note dropped on
      // the folder it is in stays exactly as it was, pending edits included.
      const moving = ids.filter(
        (id) => noteDataRef.current[id] && (noteDataRef.current[id].folder || null) !== dest,
      );
      if (moving.length === 0) {
        clearSelection();
        return;
      }
      bulkMoveNotes(moving, dest);
      if (reveal) revealInSidebar(dest, { notes: moving });
    },
    [noteDataRef, bulkMoveNotes, clearSelection, revealInSidebar],
  );
  const moveFolderTo = useCallback(
    (path, parent, { reveal = true } = {}) => {
      // The disk names the folder's final path (a de-duplicated name), so the
      // reveal waits for the answer.
      moveFolder(path, parent || null).then((landed) => {
        if (landed && reveal) revealInSidebar(parent || null, { folder: landed });
      });
    },
    [moveFolder, revealInSidebar],
  );
  moveRef.current = { moveNotesTo, moveFolderTo };

  // The Move to… picker: what is being moved and where the menu that asked
  // for it stood. `subject` is `{ kind: "notes", ids }` or `{ kind: "folder", path }`.
  const [movePicker, setMovePicker] = useState(null);
  const openMovePicker = useCallback((subject, anchor) => setMovePicker({ subject, anchor }), []);
  const closeMovePicker = useCallback(() => setMovePicker(null), []);
  const pickTarget = React.useMemo(() => {
    if (!movePicker) return null;
    const { subject } = movePicker;
    if (subject.kind === "folder") {
      return {
        label: `Move “${subject.path.split("/").pop()}” to`,
        current: parentFolder(subject.path),
        excluded: subject.path,
        onPick: (folder) => moveFolderTo(subject.path, folder),
      };
    }
    const { ids } = subject;
    const label =
      ids.length === 1
        ? `Move “${noteData[ids[0]]?.title || "Untitled"}” to`
        : `Move ${ids.length} notes to`;
    return {
      label,
      // Spread over more than one folder, the picker ticks nothing.
      current: sharedFolder(ids.map((id) => noteData[id]?.folder ?? null)),
      onPick: (folder) => moveNotesTo(ids, folder),
    };
  }, [movePicker, noteData, moveFolderTo, moveNotesTo]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div
      data-testid="app-ground"
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

      {/* Minimal chrome: two pinned controls instead of a top strip (desktop/web).
          The old desktop TitleBar (28px faux title strip) is gone — the window
          uses hiddenInset traffic lights over the sidebar header instead. */}
      {!isMobile && (
        <EditorChrome
          activeNote={activeNote}
          // Its own menu type: the active note's actions plus Settings, never
          // the sidebar's multi-selection, and open with no note at all.
          onNoteActions={({ x, y }) => setCtxMenu({ x, y, type: "header", id: activeNote })}
          onNewNote={() => createNote(null)}
          onOpenSearch={openSearch}
        />
      )}
      {isMobile && (
        <TopBarMobile
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
      )}

      {/* === MAIN AREA === */}
      <div
        id="main-content"
        style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}
      >
        {/* Sidebar wrapper */}
        <div
          className={isMobile ? undefined : "panel-motion"}
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
                  // In the layout at every width: the editor beside it gets
                  // narrower, never covered. Kept mounted while hidden so drag
                  // queries and scroll position survive.
                  width: sidebarVisible ? sidebarWidth : 0,
                  minWidth: sidebarVisible ? sidebarWidth : 0,
                  background: chromeBg,
                  display: "flex",
                  flexShrink: 0,
                  overflow: "hidden",
                  position: "relative",
                  transition: panelTransition("width", "min-width"),
                }
          }
        >
          <Sidebar
            activeNote={activeNote}
            toggle={toggle}
            openNote={openNote}
            renameNote={renameNote}
            setCtxMenu={setCtxMenu}
            ctxMenuNoteId={ctxMenu?.type === "note" ? ctxMenu.id : null}
            ctxMenuFolderId={ctxMenu?.type === "folder" ? ctxMenu.id : null}
            renameFolder={renameFolder}
            createFolder={createFolder}
            createNote={createNote}
            handleSidebarPointerDown={handleSidebarPointerDown}
            handleSearchResultOpen={handleSearchResultOpen}
            selectedNotes={selectedNotes}
            handleNoteClick={handleNoteClick}
            clearSelection={clearSelection}
            isMobile={isMobile}
            onOpenSearch={openSearch}
          />
          {isMobile && !activeNote && (
            <FloatingActionButton
              onNewNote={() => createNote(null)}
              onNewFolder={() => createFolder()}
            />
          )}
        </div>
        {/* Sidebar drag handle — desktop only, and only while the sidebar is
            showing. Hidden when collapsed (its 4px fill + 1px border left a
            hairline strip down the left edge instead of the sidebar fully
            disappearing). */}
        {!isMobile && sidebarVisible && (
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
              handleEditorCut,
              handleEditorBeforeInput,
              startHandleDrag,
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
              updateBlockText,
              updateCodeLang,
              updateCallout,
              updateCalloutTitle,
              updateTableCell,
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
              syncGen={syncGeneration.current}
              note={note}
              activeNote={activeNote}
              editorFadeIn={editorFadeIn}
              onWikilinkClick={handleWikilinkClick}
              onTagClick={handleTagClick}
              toolbarState={isMobile ? null : toolbarState}
              noteTitleSet={noteTitleSet}
              linkPopover={linkPopover}
              setLinkPopover={setLinkPopover}
              selectedBlockId={selectedBlockId}
              setSelectedBlockId={setSelectedBlockId}
              lightbox={lightbox}
              setLightbox={setLightbox}
              openNote={openNote}
              onPathRowPointerDown={handleSidebarPointerDown}
              onTitleBlur={settleTitle}
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
      {searchOpen && !isMobile && (
        <SearchPalette onOpenResult={handleSearchResultOpen} onClose={closeSearch} />
      )}
      <ContextMenu
        ctxMenu={ctxMenu}
        setCtxMenu={setCtxMenu}
        duplicateNote={duplicateNote}
        deleteNote={confirmDeleteNote}
        deleteFolder={confirmDeleteFolder}
        duplicateFolder={duplicateFolder}
        createNote={createNote}
        createFolder={createFolder}
        setRenamingFolder={setRenamingFolder}
        onRenameNote={startNoteRename}
        selectedNotes={selectedNotes}
        selectedCount={selectedCount}
        bulkDeleteNotes={bulkDeleteNotes}
        onMoveTo={openMovePicker}
        wordCount={wordCount}
      />
      {pickTarget && (
        <PathTreeMenu
          anchor={movePicker.anchor}
          scope=""
          initialExpanded={[]}
          activeNote={null}
          onClose={closeMovePicker}
          pick={pickTarget}
        />
      )}

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

      {lightbox && (
        <ImageLightbox
          src={resolveAttachmentUrl(lightbox.src)}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}

      <React.Suspense fallback={null}>
        <SettingsModal
          isMobile={isMobile}
          isDesktop={isDesktop}
          notesDir={notesDir}
          changeNotesDir={changeNotesDirFromSettings}
          revealNotesDir={isElectron ? revealVault : undefined}
        />
        {firstRun && !isMobile && (
          <SetupDialog
            notesDir={notesDir}
            folderExists={setupFolderExists}
            onChooseFolder={chooseFolderInSetup}
            onReveal={revealVault}
            onDone={finishSetup}
          />
        )}
      </React.Suspense>

      <GlobalStyles />

      <ConfirmDialog
        confirm={confirmState}
        accentColor={accentColor}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />

      <UiScaleChip
        // Settings says the figure itself, so the chip stands down while it is
        // open: two readouts of one number, one of them floating over the app.
        hint={settingsOpen ? null : scaleHint}
        onHide={hideScaleHint}
        left={24 + (isMobile || !sidebarVisible ? 0 : sidebarWidth)}
      />

      {toasts.length > 0 && (
        <div
          className={isMobile ? undefined : "panel-motion"}
          style={{
            position: "fixed",
            bottom: 24,
            // At the foot of the editor, not of the window: the sidebar is the
            // one surface whose rows a toast could hide, and the row a
            // deletion just took away is the worst thing to cover. It travels
            // with the panel on the panel's own clock.
            left: 24 + (isMobile || !sidebarVisible ? 0 : sidebarWidth),
            // Never wider than the pane it stands in: at the window's minimum
            // the editor is 316px and a 360px toast would hang off the edge.
            // Divided by the UI scale, because `vw` ignores the zoom it is
            // made of (`atScale`).
            maxWidth: atScale(`100vw - ${(isMobile || !sidebarVisible ? 0 : sidebarWidth) + 48}px`),
            transition: isMobile ? undefined : panelTransition("left"),
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
              kind={t.kind}
              icon={t.icon}
              theme={theme}
              onDismiss={() => dismissToast(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
