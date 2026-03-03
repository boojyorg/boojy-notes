import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
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
import { useEditorHandlers } from "./hooks/useEditorHandlers";
import { useTerminal } from "./hooks/useTerminal";
import { useSearch } from "./hooks/useSearch";
import { BG, TEXT, ACCENT, SEMANTIC, BRAND } from "./constants/colors";
import { FOLDER_TREE } from "./constants/data";
import { hexToRgb, rgbToHex } from "./utils/colorUtils";
import { setBlockIdCounter, STORAGE_KEY, loadFromStorage } from "./utils/storage";
import { stripMarkdownFormatting } from "./utils/inlineFormatting";
import { buildBacklinkIndex, getBacklinksForNote } from "./utils/backlinkIndex";
import { getBlockFromNode, cleanOrphanNodes, placeCaret } from "./utils/domHelpers";
import { sortByOrder, buildTree, collectPaths, filterTree } from "./utils/sidebarTree";
import SettingsModal from "./components/SettingsModal";
import ContextMenu from "./components/ContextMenu";
import SlashMenu from "./components/SlashMenu";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import EditorArea from "./components/EditorArea";
import TerminalPanel from "./components/terminal/TerminalPanel";

export default function BoojyNotes() {
  // ── State ──────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState(() => {
    const ui = (() => { try { return JSON.parse(localStorage.getItem("boojy-ui-state")); } catch { return null; } })();
    if (ui?.expanded) return ui.expanded;
    const saved = loadFromStorage();
    return saved?.expanded || { "Boojy": true };
  });
  const [activeNote, setActiveNote] = useState(() => {
    const ui = (() => { try { return JSON.parse(localStorage.getItem("boojy-ui-state")); } catch { return null; } })();
    if (ui?.activeNote) return ui.activeNote;
    const saved = loadFromStorage();
    return (saved?.activeNote && saved.noteData?.[saved.activeNote]) ? saved.activeNote : null;
  });
  const [tabs, setTabs] = useState(() => {
    const ui = (() => { try { return JSON.parse(localStorage.getItem("boojy-ui-state")); } catch { return null; } })();
    if (ui?.tabs?.length > 0) return ui.tabs;
    const saved = loadFromStorage();
    if (saved?.tabs) {
      const valid = saved.tabs.filter(id => saved.noteData?.[id]);
      if (valid.length > 0) return valid;
    }
    return [];
  });
  const [collapsed, setCollapsed] = useState(false);
  const [rightPanel, setRightPanel] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [rightPanelWidth, setRightPanelWidth] = useState(220);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [settingsFontSize, setSettingsFontSize] = useState(15);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const { user, profile, signInWithEmail, signUpWithEmail, signInWithOAuth, signOut, resendVerification } = useAuth();

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
  const [chromeBg, setChromeBg] = useState(BG.dark);
  const [editorBg, setEditorBg] = useState(BG.editor);
  const [topBarEdge, setTopBarEdge] = useState("B");
  const [createBtnStyle, setCreateBtnStyle] = useState("A");
  const [accentColor, setAccentColor] = useState(ACCENT.primary);
  const [activeTabBg, setActiveTabBg] = useState("#1C1C20");
  const [tabFlip, setTabFlip] = useState(false);
  const [selectionStyle, setSelectionStyle] = useState("B");
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
  const [, forceRender] = useState(0);
  const [slashMenu, setSlashMenu] = useState(null);
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
  const editorScrollRef = useRef(null);
  const sidebarScrollRef = useRef(null);

  // ── Shared refs ─────────────────────────────────────────────────────
  const syncGeneration = useRef(0);

  // ── External hooks ──────────────────────────────────────────────────
  const { syncState, lastSynced, storageUsed, storageLimitMB, syncAll } = useSync(user, profile, noteData, setNoteData);
  const { isElectron: isDesktop, notesDir, loading: fsLoading, changeNotesDir } = useFileSystem(noteData, setNoteData, setCustomFolders, trashedNotesRef, syncGeneration);

  // ── App hooks ───────────────────────────────────────────────────────
  const { canUndo, canRedo, undo, redo, commitNoteData, commitTextChange, pushHistory, popHistory, isUndoRedo, noteDataRef } = useHistory(noteData, setNoteData, syncGeneration);
  const { toggle, openNote, closeTab, newTabId, closingTabs } = useNoteNavigation({ activeNote, setActiveNote, tabs, setTabs, expanded, setExpanded });
  const { createNote, deleteNote, duplicateNote, renameFolder, deleteFolder, restoreNote, permanentDeleteNote, emptyAllTrash, createFolder } = useNoteCrud({ commitNoteData, noteDataRef, setTabs, setActiveNote, activeNote, setCustomFolders, customFolders, setExpanded, titleRef, trashedNotesRef, setTrashedNotes, setRenamingFolder });
  const { updateBlockText, insertBlockAfter, deleteBlock, insertImageBlock, saveAndInsertImage, flipCheck, registerBlockRef, updateCodeText, updateCodeLang, updateCallout, updateTableRows } = useBlockOperations({ commitNoteData, commitTextChange, blockRefs, focusBlockId, focusCursorPos });

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

  const { applyFormat, detectActiveFormats, reReadBlockFromDom, toggleInlineCode, getLinkContext } = useInlineFormatting({ blockRefs, editorRef, noteDataRef, activeNote, updateBlockText, setToolbarState, onOpenLinkEditor: openLinkEditor });
  getLinkContextRef.current = getLinkContext;

  const { isDragging, startDrag, startRightDrag } = usePanelResize({ sidebarHandles, rightPanelHandles, setSidebarWidth, setRightPanelWidth, chromeBg });
  const { blockDrag, handleEditorPointerDown, cancelBlockDrag } = useBlockDrag({ noteDataRef, activeNote, setNoteData, pushHistory, popHistory, blockRefs, editorRef, editorScrollRef, accentColor, editorBg, setDragTooltip, dragTooltipCount, setToolbarState });
  const { sidebarDrag, handleSidebarPointerDown, cancelSidebarDrag, persistSidebarOrder } = useSidebarDrag({ noteDataRef, setNoteData, expanded, setExpanded, sidebarOrder, setSidebarOrder, customFolders, sidebarScrollRef, accentColor, chromeBg, setDragTooltip, dragTooltipCount });
  const { handleEditorKeyDown, handleEditorInput, handleEditorMouseUp, handleEditorMouseDown, handleEditorFocus, handleEditorPaste, handleEditorDragOver, handleEditorDrop, executeSlashCommand } = useEditorHandlers({ noteDataRef, activeNote, commitNoteData, commitTextChange, blockRefs, editorRef, focusBlockId, focusCursorPos, slashMenuRef, setSlashMenu, syncGeneration, updateBlockText, insertBlockAfter, deleteBlock, saveAndInsertImage, reReadBlockFromDom, toggleInlineCode, applyFormat, mouseIsDown, setToolbarState, onOpenLinkEditor: openLinkEditor });
  const { terminals, activeTerminalId, setActiveTerminalId, xtermInstances, createTerminal, closeTerminal, renameTerminal, restartTerminal, clearTerminal, markExited } = useTerminal();
  const { searchMode, searchResults, activeResultIndex, search: runSearch, clearSearch, navigateResults, getActiveResult } = useSearch(noteData, noteDataRef);

  // Wire search input to fuzzy search
  useEffect(() => { runSearch(search); }, [search, runSearch]);

  const scrollToSearchMatch = useCallback((noteId, matchBlockId) => {
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
      setTimeout(() => { el.style.borderRadius = ""; el.style.transition = ""; }, 1700);
    }, 150);
  }, [accentColor]);

  const handleSearchResultOpen = useCallback((noteId, matchBlockId) => {
    openNote(noteId);
    if (matchBlockId) scrollToSearchMatch(noteId, matchBlockId);
  }, [openNote, scrollToSearchMatch]);

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

  useEffect(() => {
    setEditorFadeIn(false);
    const t = setTimeout(() => setEditorFadeIn(true), 30);
    return () => clearTimeout(t);
  }, [activeNote]);

  const currentTitle = noteData[activeNote]?.content?.title;
  useLayoutEffect(() => {
    if (titleRef.current && currentTitle !== undefined) {
      titleRef.current.innerText = currentTitle;
    }
  }, [activeNote, currentTitle]);

  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setTabAreaWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && blockDrag.current.active) { e.preventDefault(); cancelBlockDrag(); return; }
      if (e.key === "Escape" && sidebarDrag.current.active) { e.preventDefault(); cancelSidebarDrag(); return; }
      if (e.key === "Escape" && settingsOpen) { e.preventDefault(); setSettingsOpen(false); return; }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (mod && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      if (mod && e.key === "y") { e.preventDefault(); redo(); }
      if (mod && e.key === "n") { e.preventDefault(); createNote(null); return; }
      if (mod && e.key === "p") {
        e.preventDefault();
        setCollapsed(false);
        setTimeout(() => searchInputRef.current?.focus(), 250);
        return;
      }
      if (mod && e.key === "\\") { e.preventDefault(); setRightPanel(v => !v); return; }
      if (mod && e.shiftKey && (e.key === "T" || e.key === "t")) {
        if (rightPanel) { e.preventDefault(); createTerminal(); return; }
      }
      if (mod && e.shiftKey && (e.key === "W" || e.key === "w")) {
        if (rightPanel && activeTerminalId) { e.preventDefault(); closeTerminal(activeTerminalId); return; }
      }
      if (import.meta.env.DEV && mod && e.key === ".") { e.preventDefault(); setDevOverlay(v => !v); }
      if (import.meta.env.DEV && mod && e.key === ",") {
        e.preventDefault();
        setTabFlip(v => {
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
        localStorage.setItem("boojy-ui-state", JSON.stringify({ tabs, activeNote, expanded }));
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [tabs, activeNote, expanded]);

  useEffect(() => {
    if (window.electronAPI) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ noteData, tabs, activeNote, expanded, customFolders }));
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
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", () => { if (document.hidden) onBlur(); });
    return () => {
      window.removeEventListener("blur", onBlur);
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

  useEffect(() => {
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) { setToolbarState(null); return; }
      if (!editorRef.current) { setToolbarState(null); return; }
      const range = sel.getRangeAt(0);
      const startBlock = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
      if (!editorRef.current.contains(startBlock)) { setToolbarState(null); return; }
      const rect = range.getBoundingClientRect();
      const editorRect = editorRef.current.getBoundingClientRect();
      let el = startBlock;
      while (el && el !== editorRef.current) {
        if (el.dataset && el.dataset.blockId) break;
        el = el.parentElement;
      }
      if (!el || el === editorRef.current) { setToolbarState(null); return; }
      setToolbarState({
        top: rect.top - editorRect.top - 44,
        left: rect.left - editorRect.left + rect.width / 2,
      });
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, [activeNote]);

  useLayoutEffect(() => {
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
        if (sel.rangeCount && getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)) return;
        const freshEl = blockRefs.current[targetId];
        if (freshEl) placeCaret(freshEl, targetPos);
      });
    }
  });

  // ── Derived data ────────────────────────────────────────────────────
  const note = activeNote ? noteData[activeNote] : null;
  const wordCount = note ? note.content.blocks
    .filter(b => b.text)
    .reduce((sum, b) => sum + stripMarkdownFormatting(b.text).split(/\s+/).filter(Boolean).length, 0) : 0;

  // Backlink index — rebuild when noteData changes
  const backlinkIndex = useMemo(() => buildBacklinkIndex(noteData), [noteData]);
  const currentBacklinks = note ? getBacklinksForNote(backlinkIndex, note.title) : [];

  // Note title set for broken wikilink detection
  const noteTitleSet = useMemo(() => new Set(Object.values(noteData).map(n => n.title?.trim().toLowerCase()).filter(Boolean)), [noteData]);

  // Wikilink click handler — find note by title and open it
  const handleWikilinkClick = useCallback((targetTitle) => {
    const lc = targetTitle.trim().toLowerCase();
    const found = Object.entries(noteData).find(([, n]) =>
      (n.title || "").toLowerCase() === lc
    );
    if (found) {
      openNote(found[0]);
    } else {
      // Create new note with the target title
      createNote(null, targetTitle);
    }
  }, [noteData, openNote, createNote]);

  const derivedRootNotes = [];
  const folderNoteMap = {};
  for (const [id, n] of Object.entries(noteData)) {
    if (n.folder) {
      if (!folderNoteMap[n.folder]) folderNoteMap[n.folder] = [];
      folderNoteMap[n.folder].push(id);
    } else {
      derivedRootNotes.push(id);
    }
  }

  const allFolders = [
    ...FOLDER_TREE,
    ...customFolders.map(name => ({ name, children: [], notes: [] })),
  ];
  const knownPaths = new Set(collectPaths(allFolders));
  for (const path of Object.keys(folderNoteMap)) {
    if (!knownPaths.has(path)) knownPaths.add(path);
  }

  const rawFolderTree = buildTree(allFolders, folderNoteMap, sidebarOrder);
  const folderTree = sortByOrder(rawFolderTree, sidebarOrder[""]?.folderOrder, f => f.name);
  const sortedRootNotes = sortByOrder(derivedRootNotes, sidebarOrder[""]?.noteOrder, id => id);

  const lc = (s) => s.toLowerCase();
  const filteredTree = filterTree(folderTree, search ? lc(search) : "", noteData);
  const fNotes = search
    ? sortedRootNotes.filter((n) => noteData[n] && lc(noteData[n].title).includes(lc(search)))
    : sortedRootNotes;

  // ── UI helpers ──────────────────────────────────────────────────────
  const hBg = (el, c) => { el.style.background = c; };

  const syncDotStyle = () => {
    const base = {
      width: 19, height: 19, borderRadius: "50%",
      background: accentColor, border: "none",
      cursor: "pointer", position: "relative", top: 1,
      transition: "transform 0.15s",
    };
    if (syncState === "syncing") return { ...base, animation: "syncGlow 2s ease-in-out infinite" };
    if (syncState === "error") return { ...base, boxShadow: `0 0 0 2.5px ${BG.dark}, 0 0 0 4.5px ${SEMANTIC.error}` };
    if (syncState === "offline") return { ...base, opacity: 0.4 };
    return base;
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{
      width: "100%", height: "100vh", background: BG.darkest,
      display: "flex", flexDirection: "column",
      fontFamily: "'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: TEXT.primary, overflow: "hidden", fontSize: 13,
    }}>

      <TopBar
        chromeBg={chromeBg} accentColor={accentColor} topBarEdge={topBarEdge}
        tabFlip={tabFlip} activeTabBg={activeTabBg}
        sidebarWidth={sidebarWidth} rightPanelWidth={rightPanelWidth}
        collapsed={collapsed} setCollapsed={setCollapsed}
        canUndo={canUndo} canRedo={canRedo} undo={undo} redo={redo}
        tabs={tabs} activeNote={activeNote} noteData={noteData}
        newTabId={newTabId} closingTabs={closingTabs}
        setActiveNote={setActiveNote} closeTab={closeTab}
        setSettingsOpen={setSettingsOpen} setSettingsTab={setSettingsTab}
        syncState={syncState} syncDotStyle={syncDotStyle}
        rightPanel={rightPanel} setRightPanel={setRightPanel}
        note={note} wordCount={wordCount}
        startDrag={startDrag} startRightDrag={startRightDrag}
        isDragging={isDragging} sidebarHandles={sidebarHandles}
        rightPanelHandles={rightPanelHandles}
        tabScrollRef={tabScrollRef} tabAreaWidth={tabAreaWidth}
      />

      {/* === MAIN AREA === */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Sidebar wrapper */}
        <div style={{
          width: collapsed ? 0 : sidebarWidth,
          minWidth: collapsed ? 0 : sidebarWidth,
          background: chromeBg,
          display: "flex", flexShrink: 0, overflow: "hidden",
          position: "relative",
          transition: "width 0.2s ease, min-width 0.2s ease",
        }}>
          <Sidebar
            search={search} setSearch={setSearch}
            searchFocused={searchFocused} setSearchFocused={setSearchFocused}
            searchInputRef={searchInputRef}
            sidebarWidth={sidebarWidth} accentColor={accentColor}
            selectionStyle={selectionStyle}
            filteredTree={filteredTree} fNotes={fNotes}
            noteData={noteData} activeNote={activeNote}
            expanded={expanded} toggle={toggle} openNote={openNote}
            setCtxMenu={setCtxMenu}
            renamingFolder={renamingFolder} setRenamingFolder={setRenamingFolder}
            renameFolder={renameFolder}
            createFolder={createFolder} createNote={createNote}
            handleSidebarPointerDown={handleSidebarPointerDown}
            sidebarScrollRef={sidebarScrollRef}
            trashedNotes={trashedNotes}
            trashExpanded={trashExpanded} setTrashExpanded={setTrashExpanded}
            emptyAllTrash={emptyAllTrash}
            searchMode={searchMode} searchResults={searchResults}
            activeResultIndex={activeResultIndex}
            navigateResults={navigateResults} clearSearch={clearSearch}
            handleSearchResultOpen={handleSearchResultOpen}
            getActiveResult={getActiveResult}
          />
        </div>

        {/* Sidebar drag handle — bottom */}
        <div
          ref={(el) => { if (el) sidebarHandles.current[1] = el; }}
          onMouseDown={startDrag}
          style={{
            width: 4, cursor: "col-resize",
            background: chromeBg,
            borderRight: `1px solid ${BG.divider}`,
            flexShrink: 0, transition: "background 0.15s",
          }}
          onMouseEnter={() => sidebarHandles.current.forEach(h => h && (h.style.background = ACCENT.primary))}
          onMouseLeave={() => { if (!isDragging.current) sidebarHandles.current.forEach(h => h && (h.style.background = chromeBg)); }}
        />

        <EditorArea
          note={note} activeNote={activeNote} noteData={noteData}
          editorFadeIn={editorFadeIn}
          editorRef={editorRef} editorScrollRef={editorScrollRef}
          titleRef={titleRef} blockRefs={blockRefs}
          noteDataRef={noteDataRef}
          focusBlockId={focusBlockId} focusCursorPos={focusCursorPos}
          forceRender={forceRender}
          accentColor={accentColor} editorBg={editorBg}
          settingsFontSize={settingsFontSize}
          handleEditorKeyDown={handleEditorKeyDown}
          handleEditorInput={handleEditorInput}
          handleEditorPaste={handleEditorPaste}
          handleEditorPointerDown={handleEditorPointerDown}
          handleEditorMouseDown={handleEditorMouseDown}
          handleEditorMouseUp={handleEditorMouseUp}
          handleEditorFocus={handleEditorFocus}
          handleEditorDragOver={handleEditorDragOver}
          handleEditorDrop={handleEditorDrop}
          commitTextChange={commitTextChange}
          syncGeneration={syncGeneration}
          flipCheck={flipCheck} deleteBlock={deleteBlock}
          registerBlockRef={registerBlockRef}
          insertBlockAfter={insertBlockAfter}
          updateCodeText={updateCodeText}
          updateCodeLang={updateCodeLang}
          updateCallout={updateCallout}
          updateTableRows={updateTableRows}
          backlinks={currentBacklinks}
          onWikilinkClick={handleWikilinkClick}
          onOpenBacklink={openNote}
          toolbarState={toolbarState}
          detectActiveFormats={detectActiveFormats}
          applyFormat={applyFormat}
          noteTitleSet={noteTitleSet}
          linkPopover={linkPopover}
          setLinkPopover={setLinkPopover}
          reReadBlockFromDom={reReadBlockFromDom}
        />

        {/* Right panel drag handle — bottom */}
        <div
          ref={(el) => { if (el) rightPanelHandles.current[1] = el; }}
          onMouseDown={startRightDrag}
          style={{
            width: 4, cursor: "col-resize",
            background: BG.editor,
            flexShrink: 0, transition: "background 0.15s",
          }}
          onMouseEnter={() => rightPanelHandles.current.forEach(h => h && (h.style.background = ACCENT.primary))}
          onMouseLeave={() => { if (!isDragging.current) { rightPanelHandles.current[0] && (rightPanelHandles.current[0].style.background = chromeBg); rightPanelHandles.current[1] && (rightPanelHandles.current[1].style.background = BG.editor); } }}
        />

        {/* Right panel */}
        <div style={{
          width: rightPanel ? rightPanelWidth : 0,
          minWidth: rightPanel ? rightPanelWidth : 0,
          background: BG.editor,
          display: "flex", flexDirection: "column",
          overflow: "hidden", flexShrink: 0,
          position: "relative",
          borderLeft: `1px solid ${BG.divider}`,
          transition: isDragging.current ? "none" : "width 0.2s ease, min-width 0.2s ease",
        }}>
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
        ctxMenu={ctxMenu} setCtxMenu={setCtxMenu}
        openNote={openNote} duplicateNote={duplicateNote}
        deleteNote={deleteNote} deleteFolder={deleteFolder}
        createNote={createNote} setRenamingFolder={setRenamingFolder}
        restoreNote={restoreNote} permanentDeleteNote={permanentDeleteNote}
        titleRef={titleRef}
      />

      <SlashMenu
        slashMenu={slashMenu} setSlashMenu={setSlashMenu}
        executeSlashCommand={executeSlashCommand}
      />

      {/* Drag tooltip */}
      {dragTooltip && (
        <div style={{
          position: "fixed",
          top: dragTooltip.y, left: dragTooltip.x,
          transform: "translateX(-50%)",
          background: BG.elevated, border: `1px solid ${BG.divider}`,
          borderRadius: 6, padding: "5px 12px", fontSize: 12,
          color: TEXT.primary, fontWeight: 500, zIndex: 1100,
          pointerEvents: "none", animation: "fadeIn 0.2s ease",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)", whiteSpace: "nowrap",
        }}>{dragTooltip.text}</div>
      )}

      <SettingsModal
        settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}
        settingsTab={settingsTab} setSettingsTab={setSettingsTab}
        accentColor={accentColor}
        fontSize={settingsFontSize} setFontSize={setSettingsFontSize}
        user={user} profile={profile}
        authActions={{ signInWithEmail, signUpWithEmail, signInWithOAuth, signOut, resendVerification }}
        syncState={syncState} lastSynced={lastSynced}
        storageUsed={storageUsed} storageLimitMB={storageLimitMB}
        onSync={syncAll}
        isDesktop={isDesktop} notesDir={notesDir} changeNotesDir={changeNotesDir}
      />

      {/* Dev toast */}
      {import.meta.env.DEV && devToast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: BG.elevated, border: `1px solid ${BG.divider}`,
          borderRadius: 8, padding: "6px 16px", fontSize: 12, color: TEXT.primary,
          fontWeight: 500, zIndex: 200, animation: "fadeIn 0.15s ease",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>{devToast}</div>
      )}

      {/* Dev gear button */}
      {import.meta.env.DEV && <button onClick={() => setDevOverlay(v => !v)} style={{
        position: "fixed", bottom: 16, right: 16, width: 28, height: 28,
        borderRadius: "50%", border: `1px solid ${BG.divider}`,
        background: devOverlay ? BG.surface : `${BG.elevated}aa`,
        color: devOverlay ? ACCENT.primary : TEXT.muted,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", zIndex: 201, fontSize: 14,
        transition: "background 0.15s, color 0.15s, transform 0.15s",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.color = ACCENT.primary; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.color = devOverlay ? ACCENT.primary : TEXT.muted; }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="2.5"/>
          <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85"/>
        </svg>
      </button>}

      {/* Dev tools overlay */}
      {import.meta.env.DEV && devOverlay && (() => {
        const aRgb = hexToRgb(accentColor);
        const cRgb = hexToRgb(chromeBg);
        const eRgb = hexToRgb(editorBg);
        const tRgb = hexToRgb(activeTabBg);
        const sliderTrack = { width: "100%", height: 4, appearance: "none", WebkitAppearance: "none", background: BG.divider, borderRadius: 2, outline: "none", cursor: "pointer" };
        const sliderCss = `
          .dev-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: ${TEXT.primary}; cursor: pointer; border: 2px solid ${BG.elevated}; }
          .dev-slider::-webkit-slider-runnable-track { height: 4px; background: ${BG.divider}; border-radius: 2px; }
        `;
        const channels = ["R", "G", "B"];
        const rgbSliders = (rgb, setter) => channels.map((ch, i) => (
          <div key={ch} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i < 2 ? 4 : 0 }}>
            <span style={{ width: 10, fontSize: 10, color: ch === "R" ? "#E57373" : ch === "G" ? "#81C784" : "#64B5F6", fontWeight: 600 }}>{ch}</span>
            <input className="dev-slider" type="range" min="0" max="255" value={rgb[i]}
              style={sliderTrack}
              onChange={e => { const next = [...rgb]; next[i] = +e.target.value; setter(rgbToHex(...next)); }} />
            <span style={{ width: 24, textAlign: "right", fontSize: 10, color: TEXT.muted }}>{rgb[i]}</span>
          </div>
        ));
        return (
        <div style={{
          position: "fixed", bottom: 52, right: 16, width: 280,
          background: BG.elevated, border: `1px solid ${BG.divider}`,
          borderRadius: 10, padding: 16, zIndex: 200,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 14,
          fontSize: 12, color: TEXT.secondary, fontFamily: "inherit",
          animation: "slideUp 0.15s ease",
        }}>
          <style>{sliderCss}</style>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, color: TEXT.primary, fontSize: 13 }}>Dev Tools</span>
            <button onClick={() => setDevOverlay(false)} style={{
              background: "none", border: "none", color: TEXT.muted, cursor: "pointer", fontSize: 14,
            }}>{"\u2715"}</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Top Bar Edge</span>
            <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${BG.divider}`, marginLeft: "auto" }}>
              {["A", "B", "C", "D"].map(s => (
                <button key={s} onClick={() => {
                  setTopBarEdge(s);
                  setDevToast(`Top bar: ${s === "A" ? "Shadow+line" : s === "B" ? "Shadow" : s === "C" ? "Line" : "None"}`);
                  setTimeout(() => setDevToast(null), 1500);
                }} style={{
                  background: topBarEdge === s ? TEXT.primary : "transparent",
                  color: topBarEdge === s ? BG.darkest : TEXT.muted,
                  border: "none", padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s, color 0.12s",
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Create Buttons</span>
            <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${BG.divider}`, marginLeft: "auto" }}>
              {["A", "B", "C"].map(s => (
                <button key={s} onClick={() => {
                  setCreateBtnStyle(s);
                  setDevToast(`Create btns: ${s === "A" ? "Default" : s === "B" ? "Ghost" : "Accent"}`);
                  setTimeout(() => setDevToast(null), 1500);
                }} style={{
                  background: createBtnStyle === s ? TEXT.primary : "transparent",
                  color: createBtnStyle === s ? BG.darkest : TEXT.muted,
                  border: "none", padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s, color 0.12s",
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Selection</span>
            <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: `1px solid ${BG.divider}`, marginLeft: "auto" }}>
              {["A", "B"].map(s => (
                <button key={s} onClick={() => {
                  setSelectionStyle(s);
                  setDevToast(`Selection: ${s === "A" ? "Glow bar" : "Pill"}`);
                  setTimeout(() => setDevToast(null), 1500);
                }} style={{
                  background: selectionStyle === s ? TEXT.primary : "transparent",
                  color: selectionStyle === s ? BG.darkest : TEXT.muted,
                  border: "none", padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s, color 0.12s",
                }}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: BG.divider }} />
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Accent Color</span>
              <code style={{ color: accentColor }}>{accentColor}</code>
            </div>
            {rgbSliders(aRgb, setAccentColor)}
            <div style={{ height: 8, marginTop: 6, borderRadius: 3, background: accentColor, border: `1px solid ${BG.divider}` }} />
          </div>
          <div style={{ height: 1, background: BG.divider }} />
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span>Active Tab BG</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ color: TEXT.primary }}>{activeTabBg}</code>
                <button onClick={() => {
                  setTabFlip(!tabFlip);
                  setDevToast(`Tab flip: ${!tabFlip ? "ON" : "OFF"}`);
                  setTimeout(() => setDevToast(null), 1500);
                }} style={{
                  background: tabFlip ? TEXT.primary : "transparent",
                  color: tabFlip ? BG.darkest : TEXT.muted,
                  border: `1px solid ${BG.divider}`, borderRadius: 4,
                  padding: "2px 8px", fontSize: 10, fontWeight: 600,
                  cursor: "pointer", transition: "background 0.12s, color 0.12s",
                }}>FLIP</button>
              </div>
            </div>
            {rgbSliders(tRgb, setActiveTabBg)}
            <div style={{ height: 8, marginTop: 6, borderRadius: 3, background: activeTabBg, border: `1px solid ${BG.divider}` }} />
          </div>
          <div style={{ height: 1, background: BG.divider }} />
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Chrome BG</span>
              <code style={{ color: TEXT.primary }}>{chromeBg}</code>
            </div>
            {rgbSliders(cRgb, setChromeBg)}
            <div style={{ height: 8, marginTop: 6, borderRadius: 3, background: chromeBg, border: `1px solid ${BG.divider}` }} />
          </div>
          <div style={{ height: 1, background: BG.divider }} />
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span>Editor BG</span>
              <code style={{ color: TEXT.primary }}>{editorBg}</code>
            </div>
            {rgbSliders(eRgb, setEditorBg)}
            <div style={{ height: 8, marginTop: 6, borderRadius: 3, background: editorBg, border: `1px solid ${BG.divider}` }} />
          </div>
          <div style={{ height: 1, background: BG.divider }} />
          <button onClick={() => { setChromeBg(BG.dark); setEditorBg(BG.editor); setAccentColor(ACCENT.primary); setActiveTabBg("#1C1C20"); setTabFlip(false); }} style={{
            background: "none", border: `1px solid ${BG.divider}`, borderRadius: 4,
            color: TEXT.muted, fontSize: 11, padding: "4px 10px", cursor: "pointer",
            alignSelf: "flex-start",
          }}>Reset colours</button>
        </div>
        );
      })()}

      <style>{`
        .titlebar-drag { -webkit-app-region: drag; -webkit-user-select: none; user-select: none; }
        .no-drag { -webkit-app-region: no-drag; }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes syncGlow {
          0%, 100% { box-shadow: 0 0 4px ${BRAND.orange}40; }
          50% { box-shadow: 0 0 14px ${BRAND.orange}80, 0 0 24px ${BRAND.orange}30; }
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
        ::-webkit-scrollbar-thumb { background: ${BG.divider}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${BG.hover}; box-shadow: 0 0 4px ${BG.hover}40; }
        .tab-scroll::-webkit-scrollbar { height: 0px; }
        .tab-scroll::-webkit-scrollbar-track { background: transparent; }
        .tab-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
        .tab-scroll:hover::-webkit-scrollbar { height: 5px; }
        .tab-scroll:hover::-webkit-scrollbar-thumb { background: ${BG.divider}; }
        .editor-scroll::-webkit-scrollbar-thumb { background: transparent; }
        .editor-scroll:hover::-webkit-scrollbar-thumb { background: ${BG.divider}; }
        input::placeholder { color: ${TEXT.muted}; }
        [contenteditable]:focus { outline: none; }
        .checkbox-box:active { transform: scale(0.85); }
        .tab-btn > .tab-close { opacity: 0; width: 0; overflow: hidden; margin-left: 0; transition: opacity 0.15s, width 0.1s, margin-left 0.1s; }
        .tab-btn:hover > .tab-close, .tab-btn.tab-active > .tab-close { opacity: 0.6; width: 16px; margin-left: 5px; }
        .tab-btn > .tab-close:hover { opacity: 1 !important; }
        [data-block-id] code {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 3px;
          padding: 1px 4px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 0.9em;
        }
        [data-block-id] a {
          color: #6ea8d8;
          text-decoration: underline;
          text-decoration-color: rgba(110,168,216,0.3);
          cursor: pointer;
        }
        [data-block-id] a:hover {
          text-decoration-color: #6ea8d8;
          background: rgba(110,168,216,0.06);
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
          text-decoration-color: ${ACCENT.primary};
          text-decoration-thickness: 1.5px;
          color: inherit;
        }
        [data-block-id] mark {
          background: rgba(164, 202, 206, 0.35);
          color: inherit;
          border-radius: 2px;
          padding: 0 2px;
        }
        [data-block-id] .inline-tag {
          color: ${ACCENT.primary};
          opacity: 0.7;
          font-size: 0.92em;
        }
        [data-block-id] .wikilink {
          color: #A4CACE;
          text-decoration: underline;
          text-decoration-style: dotted;
          text-decoration-color: rgba(164,202,206,0.3);
          cursor: pointer;
        }
        [data-block-id] .wikilink:hover {
          text-decoration-color: #A4CACE;
        }
        [data-block-id] .wikilink-broken {
          color: rgba(255,255,255,0.4);
          text-decoration-style: dashed;
          text-decoration-color: rgba(255,255,255,0.2);
        }
        [data-block-id] .wikilink-broken:hover {
          color: rgba(255,255,255,0.6);
          text-decoration-color: rgba(255,255,255,0.3);
        }
        .code-block-wrapper {
          position: relative;
          border-radius: 8px;
          background: #1a1b26;
          border: 1px solid ${BG.divider};
          overflow: hidden;
          margin: 8px 0;
        }
        .code-block-wrapper pre {
          margin: 0;
          padding: 16px;
          overflow-x: auto;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          line-height: 1.6;
          color: ${TEXT.primary};
          tab-size: 2;
        }
        .code-block-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          background: rgba(255,255,255,0.03);
          border-bottom: 1px solid ${BG.divider};
          font-size: 11px;
          color: ${TEXT.muted};
        }
        .code-block-header select {
          background: transparent;
          border: 1px solid ${BG.divider};
          border-radius: 4px;
          color: ${TEXT.secondary};
          font-size: 11px;
          padding: 2px 6px;
          outline: none;
          cursor: pointer;
        }
        .code-block-header select option {
          background: ${BG.elevated};
          color: ${TEXT.primary};
        }
        .code-block-copy {
          background: transparent;
          border: 1px solid ${BG.divider};
          border-radius: 4px;
          color: ${TEXT.muted};
          font-size: 11px;
          padding: 2px 8px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .code-block-copy:hover {
          color: ${TEXT.primary};
          border-color: ${TEXT.secondary};
        }
        .code-block-textarea {
          width: 100%;
          min-height: 60px;
          padding: 16px;
          background: #1a1b26;
          color: ${TEXT.primary};
          border: none;
          outline: none;
          resize: vertical;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          line-height: 1.6;
          tab-size: 2;
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
          border-radius: 8px;
          border-left: 4px solid;
          padding: 12px 16px;
          margin: 8px 0;
        }
        .callout-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .callout-body {
          font-size: 14px;
          line-height: 1.6;
          opacity: 0.9;
        }
        .callout-body p { margin: 0; }
        /* Table block styles */
        .table-block-wrapper {
          overflow-x: auto;
          margin: 8px 0;
          border-radius: 8px;
          border: 1px solid ${BG.divider};
        }
        .table-block {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .table-block th, .table-block td {
          border: 1px solid ${BG.divider};
          padding: 8px 12px;
          text-align: left;
          outline: none;
          min-width: 80px;
        }
        .table-block th {
          background: rgba(255,255,255,0.04);
          font-weight: 600;
          color: ${TEXT.primary};
        }
        .table-block td {
          color: ${TEXT.primary};
          background: transparent;
        }
        .table-block td:focus, .table-block th:focus {
          box-shadow: inset 0 0 0 2px ${ACCENT.primary}50;
        }
        .table-toolbar {
          display: flex;
          gap: 4px;
          padding: 4px 8px;
          background: rgba(255,255,255,0.03);
          border-top: 1px solid ${BG.divider};
        }
        .table-toolbar button {
          background: transparent;
          border: 1px solid ${BG.divider};
          border-radius: 4px;
          color: ${TEXT.muted};
          font-size: 11px;
          padding: 3px 8px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s;
        }
        .table-toolbar button:hover {
          color: ${TEXT.primary};
          border-color: ${TEXT.secondary};
        }
        /* Frontmatter block styles */
        .frontmatter-block {
          border-radius: 8px;
          border: 1px solid ${BG.divider};
          background: rgba(255,255,255,0.02);
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
          color: ${TEXT.muted};
          transition: color 0.15s;
        }
        .frontmatter-header:hover { color: ${TEXT.secondary}; }
        .frontmatter-body {
          padding: 8px 12px;
          border-top: 1px solid ${BG.divider};
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 12px;
          line-height: 1.6;
          color: ${TEXT.secondary};
          white-space: pre-wrap;
        }
        .empty-block {
          position: relative;
        }
        .empty-block::before {
          content: attr(data-placeholder);
          color: ${TEXT.muted};
          opacity: 0.4;
          position: absolute;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
