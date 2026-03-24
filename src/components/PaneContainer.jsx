import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { useLayout } from "../context/LayoutContext";
import { usePaneRefs } from "../hooks/usePaneRefs";
import { useEditorHandlers } from "../hooks/useEditorHandlers";
import { useBlockOperations } from "../hooks/useBlockOperations";
import { useInlineFormatting } from "../hooks/useInlineFormatting";
import { useBlockDrag } from "../hooks/useBlockDrag";
import { getBlockFromNode, cleanOrphanNodes, placeCaret } from "../utils/domHelpers";
import { EditorProvider } from "../context/EditorContext";
import PaneTabBar from "./PaneTabBar";
import EditorArea from "./EditorArea";

export default memo(
  function PaneContainer({
    textOnlyEditForEditor,
    paneId,
    isActive,
    tabs,
    activeNote,
    noteData,
    noteDataRef,
    newTabId,
    closingTabs,
    setActiveNote,
    closeTab,
    tabFlip,
    activeTabBg,
    chromeBg,
    setNoteData,
    commitNoteData,
    commitTextChange,
    syncGeneration,
    slashMenuRef,
    setSlashMenu,
    wikilinkMenuRef,
    setWikilinkMenu,
    onWikilinkClick,
    onWikilinkCmdClick,
    openNote,
    onOpenBacklink,
    backlinks,
    noteTitleSet,
    lightbox,
    setLightbox,
    onPaneClick,
    showTabBar,
    tabAreaWidth,
    onEditorClick,
    pushHistory,
    popHistory,
    setDragTooltip,
    dragTooltipCount,
    onTabPointerDown,
  }) {
    const { theme } = useTheme();
    const { accentColor, editorBg } = useLayout();

    // Per-pane refs
    const { editorRef, editorScrollRef, titleRef, blockRefs, focusBlockId, focusCursorPos } =
      usePaneRefs();

    const [, forceRender] = useState(0);
    const [editorFadeIn, setEditorFadeIn] = useState(false);
    const [toolbarState, setToolbarState] = useState(null);
    const [selectedImageBlockId, setSelectedImageBlockId] = useState(null);
    const [linkPopover, setLinkPopover] = useState(null);
    const mouseIsDown = useRef(false);
    const tabScrollRef = useRef(null);

    const getLinkContextRef = useRef(null);
    const openLinkEditor = useCallback(() => {
      if (getLinkContextRef.current) {
        const ctx = getLinkContextRef.current();
        if (ctx) setLinkPopover(ctx);
      }
    }, []);

    // Block operations for this pane
    const {
      updateBlockText,
      insertBlockAfter,
      deleteBlock,
      updateBlockProperty,
      saveAndInsertImage,
      insertFileBlock,
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
    });

    // Inline formatting for this pane
    const {
      applyFormat,
      detectActiveFormats,
      reReadBlockFromDom,
      toggleInlineCode,
      getLinkContext,
    } = useInlineFormatting({
      blockRefs,
      editorRef,
      noteDataRef,
      activeNote,
      updateBlockText,
      setToolbarState,
      onOpenLinkEditor: openLinkEditor,
    });
    getLinkContextRef.current = getLinkContext;

    // Editor handlers for this pane
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
      updateBlockIndent,
    });

    // Block drag for this pane
    const { handleEditorPointerDown } = useBlockDrag({
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

    const note = activeNote ? noteData[activeNote] : null;

    // Editor fade-in on note switch
    useEffect(() => {
      setEditorFadeIn(false);
      setSelectedImageBlockId(null);
      setLightbox(null);
      const t = setTimeout(() => setEditorFadeIn(true), 30);
      return () => clearTimeout(t);
    }, [activeNote]);

    // Set title content on note switch
    useLayoutEffect(() => {
      const title = noteData[activeNote]?.content?.title;
      if (titleRef.current && title !== undefined) {
        if (title === "") {
          titleRef.current.innerHTML = "<br>";
        } else {
          titleRef.current.innerText = title;
        }
      }
    }, [activeNote, syncGeneration.current]); // eslint-disable-line

    // Selection change → floating toolbar (per-pane)
    useEffect(() => {
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
    }, [activeNote]);

    // Focus block layout effect (per-pane)
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

    const handlePaneClick = useCallback(() => {
      if (onPaneClick) onPaneClick(paneId);
    }, [onPaneClick, paneId]);

    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          minHeight: 0,
        }}
        onMouseDown={handlePaneClick}
      >
        {showTabBar && (
          <PaneTabBar
            tabs={tabs}
            activeNote={activeNote}
            noteData={noteData}
            newTabId={newTabId}
            closingTabs={closingTabs}
            setActiveNote={setActiveNote}
            closeTab={closeTab}
            tabFlip={tabFlip}
            activeTabBg={activeTabBg}
            chromeBg={chromeBg}
            tabAreaWidth={tabAreaWidth}
            tabScrollRef={tabScrollRef}
            onTabPointerDown={onTabPointerDown}
            paneId={paneId}
            variant="pane"
          />
        )}
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
            onEditorClick={onEditorClick}
            textOnlyEditForEditor={textOnlyEditForEditor}
            note={note}
            activeNote={activeNote}
            editorFadeIn={editorFadeIn}
            backlinks={backlinks}
            onWikilinkClick={onWikilinkClick}
            onWikilinkCmdClick={onWikilinkCmdClick}
            onOpenBacklink={onOpenBacklink}
            toolbarState={toolbarState}
            noteTitleSet={noteTitleSet}
            linkPopover={linkPopover}
            setLinkPopover={setLinkPopover}
            selectedImageBlockId={selectedImageBlockId}
            setSelectedImageBlockId={setSelectedImageBlockId}
            lightbox={lightbox}
            setLightbox={setLightbox}
            openNote={openNote}
          />
        </EditorProvider>
      </div>
    );
  },
  (prev, next) => {
    const t0 = performance.now();

    // Skip re-render when only unrelated noteData changed (e.g. typing in other pane)
    if (prev.activeNote !== next.activeNote) return false;
    if (prev.tabs !== next.tabs) return false;
    if (prev.isActive !== next.isActive) return false;
    if (prev.showTabBar !== next.showTabBar) return false;
    if (prev.tabAreaWidth !== next.tabAreaWidth) return false;
    if (prev.activeTabBg !== next.activeTabBg) return false;
    if (prev.chromeBg !== next.chromeBg) return false;
    if (prev.lightbox !== next.lightbox) return false;
    if (prev.backlinks !== next.backlinks) return false;
    if (prev.noteTitleSet !== next.noteTitleSet) return false;
    if (prev.newTabId !== next.newTabId) return false;
    if (prev.closingTabs !== next.closingTabs) return false;
    if (prev.tabFlip !== next.tabFlip) return false;

    // Check if this pane's active note changed structurally
    const pNote = prev.noteData[prev.activeNote];
    const nNote = next.noteData[next.activeNote];
    if (pNote !== nNote) {
      const pBlocks = pNote?.content?.blocks;
      const nBlocks = nNote?.content?.blocks;
      if (!pBlocks || !nBlocks || pBlocks.length !== nBlocks.length) return false;
      for (let i = 0; i < pBlocks.length; i++) {
        if (pBlocks[i].id !== nBlocks[i].id || pBlocks[i].type !== nBlocks[i].type) return false;
        if (
          pBlocks[i].type === "code" &&
          (pBlocks[i].text !== nBlocks[i].text || pBlocks[i].lang !== nBlocks[i].lang)
        )
          return false;
        if (
          pBlocks[i].type === "table" &&
          (pBlocks[i].rows !== nBlocks[i].rows || pBlocks[i].alignments !== nBlocks[i].alignments)
        )
          return false;
      }
      if (pNote?.path !== nNote?.path) return false;
    }

    // Check tab titles for PaneTabBar
    for (const tabId of next.tabs) {
      if (prev.noteData[tabId]?.title !== next.noteData[tabId]?.title) return false;
    }

    const dt = performance.now() - t0;
    if (dt > 0.5) console.warn(`[perf] PaneContainer memo comparator: ${dt.toFixed(2)}ms`);
    return true;
  },
);
