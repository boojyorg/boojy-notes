import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { EMPTY_FORMATS } from "../hooks/useInlineFormatting";
import { LABEL_PAD_X } from "../constants/layout";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { useEditorContext } from "../context/EditorContext";
import { getAPI } from "../services/apiProvider";
import { SIDEBAR_HANDLE_W } from "./EditorChrome";
import NotePath, { PATH_FONT } from "./NotePath";
import { parentFolders } from "../utils/pathCrumbs";
import EditableBlock from "./EditableBlock";
import BlockErrorBoundary from "./BlockErrorBoundary";
import BlockDragHandle from "./BlockDragHandle";
import FloatingToolbar from "./FloatingToolbar";
import LinkTooltip from "./LinkTooltip";
import LinkEditPopover from "./LinkEditPopover";
import LinkContextMenu from "./LinkContextMenu";
import {
  getBlockFromNode,
  placeCaret,
  caretLength,
  isEditableBlock,
  isSelectableBlock,
  ownedField,
  linkText,
  titleFieldText,
} from "../utils/domHelpers";
import { haveEditorBlockRenderChanges } from "../utils/editorBlockRenderChanges";
import { listLayout } from "../utils/listStructure";
import { useLinkHoverTooltip } from "../hooks/editor/useLinkHoverTooltip";
import FindBar from "./FindBar";
import { ramp } from "../utils/fluidLength";
import { parseWikilinkTarget, wikilinkMayCreate } from "../utils/wikilinkTarget";
import { panelTransition } from "../tokens/motion";

/*
 * The note name is a FILE LABEL, not the document's heading.
 *
 * It reads at label rank so it can never compete with a real Markdown H1 in
 * the body. A note whose file is `boojy-notes-design-demo-v1.2.md` and whose
 * first block is `# Notes Demo v1.2` shows both, and they read as
 * file-then-document rather than as two titles. The filename and the H1 stay
 * independent: editing the heading never renames the file.
 *
 * On the desktop it sits in the chrome row, centred on the pane behind its
 * folder path (NotePath, 2026-09-15), and the column below it starts where it
 * always did: the body did not move when the name left it. On a touch device
 * there is no chrome row, so the name keeps its place at the head of the
 * column, small and muted.
 */
/** The column's own top padding on the desktop, under the chrome row's 39px:
 *  exactly what the name's row and its gap added up to when they were part
 *  of the column (14px of padding, a 13.5px × 1.4 line box, a 26px gap, less
 *  the row), so the first block did not move by a tenth of a pixel when the
 *  name left. Two specs click the centre of a two-line block and land on its
 *  first line by that tenth; keep the fraction. */
const COLUMN_TOP = 14 + 13.5 * 1.4 + 26 - 39;
const MOBILE_LABEL_FONT_SIZE = 13.5;
const MOBILE_LABEL_LINE_HEIGHT = 1.4;
/** Air between the mobile label and the first Markdown block. */
const MOBILE_LABEL_GAP = 26;

/*
 * The writing column is fluid, because the window is.
 *
 * Width should change how much room the prose has, never what the app is. So
 * as the window narrows the column gives up its decorative left offset first
 * and its gutters second — losing them in that order keeps text comfortable
 * for roughly 200px longer than shrinking both at once would.
 *
 * Both ramps are linear between two anchors and clamped at each end. The
 * offset is fully spent at 640px of editor width and the gutters bottom out
 * at 560px (2026-09-14; they were 560 and 400, so the 600px window still
 * carried 45px gutters and the minimum could go no lower); below that the
 * column only gets narrower. The gutter floor is the drag grip's: 20px plus
 * its 4px gap live in the left padding, and the right side matches it. The
 * sidebar stays in the layout at every width and yields before the note does
 * (`EDITOR_FLOOR_W`), so at the 545px window minimum the editor has 316px
 * beside the narrowest sidebar and 545px alone: prose keeps reading either
 * way, and one click on the toggle gives the room back.
 *
 * Driven by viewport math rather than container queries on purpose:
 * `container-type` applies layout containment, which would make the editor
 * scroller a containing block for its `position: fixed` descendants (the slash
 * menu, the floating toolbar, the link popovers) and quietly re-anchor them.
 */
/** Side gutters: COL_PAD_MIN at COL_PAD_FROM of editor width, MAX at _TO. */
const COL_PAD_MIN = 24;
const COL_PAD_MAX = 56;
const COL_PAD_FROM = 560;
const COL_PAD_TO = 800;
/** Decorative left offset: 0 at the editor floor, COL_OFFSET_MAX at _TO. */
const COL_OFFSET_MAX = 40;
const COL_OFFSET_FROM = 640;
const COL_OFFSET_TO = 880;

/** The nearest block that holds a caret, walking from `from` by `step`; -1 when none. */
function nearestTextIndex(blocks, from, step) {
  let i = from;
  while (i >= 0 && i < blocks.length && !isEditableBlock(blocks[i])) i += step;
  return i >= 0 && i < blocks.length ? i : -1;
}

const EditorArea = memo(
  function EditorArea({
    isMobile,
    textOnlyEditForEditor,
    // The current value of the sync generation, passed as a plain prop so the
    // memo comparator can see it change (the ref itself never changes identity).
    syncGen: _syncGen,
    note,
    activeNote,
    editorFadeIn,
    onWikilinkClick,
    onTagClick,
    toolbarState,
    noteTitleSet,
    linkPopover,
    setLinkPopover,
    selectedBlockId,
    setSelectedBlockId,
    lightbox,
    setLightbox,
    openNote: openNoteProp,
    onEditorClick,
  }) {
    const {
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
    } = useEditorContext();
    const { theme } = useTheme();
    const { TEXT, BG } = theme;
    const { accentColor, editorBg, sidebarVisible, sidebarWidth, fullScreen } = useLayout();

    // Find bar state
    const [findBarOpen, setFindBarOpen] = useState(false);
    const [findBarReplace, setFindBarReplace] = useState(false);

    const editorContainerRef = useRef(null);
    // Note column (padding + measure) — the drag handle positions against it.
    const columnRef = useRef(null);

    // The guard against Chromium editing across block roots listens to the
    // native `beforeinput`, the one event that says which roots an edit is
    // about to touch; React's onBeforeInput is synthesised from other events
    // and carries neither the input type nor the target range. The editor
    // element remounts with the note (the column is keyed on it), so the
    // listener follows it.
    const hasNote = !!note;
    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      el.addEventListener("beforeinput", handleEditorBeforeInput);
      return () => el.removeEventListener("beforeinput", handleEditorBeforeInput);
    }, [activeNote, hasNote, editorRef, handleEditorBeforeInput]);

    const onNavigateToNote = useCallback(
      (target, create) => {
        if (create && onWikilinkClick) {
          onWikilinkClick(target);
        } else if (openNoteProp) {
          openNoteProp(target);
        }
      },
      [onWikilinkClick, openNoteProp],
    );

    const activeFormats = useMemo(
      () => (toolbarState ? detectActiveFormats() : EMPTY_FORMATS),
      [toolbarState],
    );

    // Link hover tooltip: the URL or [[target]] under the pointer after a rest.
    const {
      tooltip: linkTooltip,
      onMouseMove: handleEditorMouseMove,
      onMouseLeave: handleEditorMouseLeave,
    } = useLinkHoverTooltip(editorContainerRef);

    // Link popover handlers
    const handleLinkApply = useCallback(
      (url) => {
        if (!linkPopover) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(linkPopover.savedRange);

        if (linkPopover.existingLink) {
          // Update existing link
          linkPopover.existingLink.setAttribute("href", url);
          linkPopover.existingLink.setAttribute("data-url", url);
          if (!linkPopover.existingLink.classList.contains("external-link")) {
            linkPopover.existingLink.className = "external-link";
          }
          // Add icon if missing
          if (!linkPopover.existingLink.querySelector(".external-link-icon")) {
            const icon = document.createElement("span");
            icon.className = "external-link-icon";
            icon.contentEditable = "false";
            icon.textContent = "\u2197";
            linkPopover.existingLink.appendChild(icon);
          }
        } else if (!sel.isCollapsed) {
          // Wrap selection in link
          const range = sel.getRangeAt(0);
          const a = document.createElement("a");
          a.href = url;
          a.className = "external-link";
          a.setAttribute("data-url", url);
          try {
            range.surroundContents(a);
          } catch (_) {
            const frag = range.extractContents();
            a.appendChild(frag);
            range.insertNode(a);
          }
          const icon = document.createElement("span");
          icon.className = "external-link-icon";
          icon.contentEditable = "false";
          icon.textContent = "\u2197";
          a.appendChild(icon);
        } else {
          // No selection — insert link with URL as text
          const range = sel.getRangeAt(0);
          const a = document.createElement("a");
          a.href = url;
          a.className = "external-link bare-url";
          a.setAttribute("data-url", url);
          a.textContent = url;
          const icon = document.createElement("span");
          icon.className = "external-link-icon";
          icon.contentEditable = "false";
          icon.textContent = "\u2197";
          a.appendChild(icon);
          range.insertNode(a);
          range.setStartAfter(a);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        reReadBlockFromDom();
        setLinkPopover(null);
      },
      [linkPopover, reReadBlockFromDom, setLinkPopover],
    );

    const handleLinkRemove = useCallback(() => {
      if (!linkPopover?.existingLink) {
        setLinkPopover(null);
        return;
      }
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(linkPopover.savedRange);
      // Get text without icon
      const textContent = Array.from(linkPopover.existingLink.childNodes)
        .filter((n) => !n.classList?.contains("external-link-icon"))
        .map((n) => n.textContent)
        .join("");
      const textNode = document.createTextNode(textContent);
      linkPopover.existingLink.parentNode.replaceChild(textNode, linkPopover.existingLink);
      reReadBlockFromDom();
      setLinkPopover(null);
    }, [linkPopover, reReadBlockFromDom, setLinkPopover]);

    const handleLinkDismiss = useCallback(() => {
      setLinkPopover(null);
    }, [setLinkPopover]);

    // Block navigation out of a block that owns its fields (Escape / the
    // arrows at the edges of a code block, a callout or a table cell). A text
    // neighbour takes the caret at its near end; a table neighbour takes the
    // caret in its near row (the arrows walk the grid); a divider or image is
    // selected as a whole, never given a caret (its root is in the ref map for
    // the gutter grip, not for the caret).
    const handleBlockNav = useCallback(
      (blockIndex, direction) => {
        const blocks = noteDataRef.current?.[activeNote]?.content?.blocks;
        if (!blocks) return;
        const targetIndex = direction === "prev" ? blockIndex - 1 : blockIndex + 1;
        if (targetIndex < 0) {
          // Focus title
          if (titleRef.current) titleRef.current.focus();
          return;
        }
        if (targetIndex >= blocks.length) return;
        const target = blocks[targetIndex];
        if (target.type === "table") {
          ownedField(editorRef.current, target.id, direction === "prev" ? "end" : "start")?.focus();
          return;
        }
        if (isSelectableBlock(target)) {
          setSelectedBlockId(target.id);
          return;
        }
        const el = blockRefs.current[target.id];
        if (el) {
          placeCaret(el, direction === "prev" ? caretLength(el) : 0);
        } else {
          // A code block or callout: its own first field takes focus.
          ownedField(editorRef.current, target.id)?.focus();
        }
      },
      [activeNote, noteDataRef, blockRefs, editorRef, titleRef, setSelectedBlockId],
    );

    // Whole-block selection: a divider, an image or a table (isSelectableBlock)
    const handleBlockSelect = useCallback(
      (blockId) => {
        setSelectedBlockId(blockId);
      },
      [setSelectedBlockId],
    );

    // Remove a block addressed as a whole (the selected divider, image or
    // table; the table's own Delete table) and land the caret at the start of
    // the next text block, or the end of the previous one if there is none,
    // so a Backspace that arrived from the block below can carry on from where
    // it was. Also the image's and file's own Delete.
    const deleteWholeBlock = useCallback(
      (noteId, idx) => {
        const blocks = noteDataRef.current[noteId]?.content?.blocks || [];
        const next = nearestTextIndex(blocks, idx + 1, 1);
        const prev = nearestTextIndex(blocks, idx - 1, -1);
        if (next >= 0) {
          focusBlockId.current = blocks[next].id;
          focusCursorPos.current = 0;
        } else if (prev >= 0) {
          focusBlockId.current = blocks[prev].id;
          focusCursorPos.current = (blocks[prev].text || "").length;
        }
        deleteBlock(noteId, idx);
        setSelectedBlockId(null);
      },
      [noteDataRef, deleteBlock, focusBlockId, focusCursorPos, setSelectedBlockId],
    );

    // Keys while a whole block is selected. Escape deselects and moves nothing;
    // the arrows put the caret in the nearest text block on that side;
    // Backspace and Delete remove the block (deleteWholeBlock); Enter opens a
    // paragraph under the block; a printable character deselects and types
    // where the caret already is. True when consumed.
    const handleSelectedBlockKey = useCallback(
      (e) => {
        const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
        const idx = blocks.findIndex((b) => b.id === selectedBlockId);
        if (idx < 0) {
          setSelectedBlockId(null);
          return false;
        }
        const nearestText = (from, step) => nearestTextIndex(blocks, from, step);
        if (e.key === "Escape") {
          e.preventDefault();
          setSelectedBlockId(null);
          return true;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const up = e.key === "ArrowUp";
          const target = nearestText(idx + (up ? -1 : 1), up ? -1 : 1);
          setSelectedBlockId(null);
          if (target >= 0) {
            const el = blockRefs.current[blocks[target].id];
            if (el) placeCaret(el, up ? caretLength(el) : 0);
          }
          return true;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          deleteWholeBlock(activeNote, idx);
          return true;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setSelectedBlockId(null);
          insertBlockAfter(activeNote, idx, "p", "");
          return true;
        }
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) setSelectedBlockId(null);
        return false;
      },
      [
        activeNote,
        selectedBlockId,
        setSelectedBlockId,
        noteDataRef,
        blockRefs,
        deleteWholeBlock,
        insertBlockAfter,
      ],
    );

    const handleImageLightbox = useCallback(
      (src, alt) => {
        setLightbox({ src, alt });
      },
      [setLightbox],
    );

    const handleImageReplace = useCallback(
      async (noteId, blockIndex) => {
        const api = getAPI();
        if (!api) return;
        const picked = await api.pickImageFile();
        if (!picked) return;
        const filename = await api.saveImage({
          fileName: picked.fileName,
          dataBase64: picked.dataBase64,
        });
        updateBlockProperty(noteId, blockIndex, { src: filename, width: 100 });
      },
      [updateBlockProperty],
    );

    const handleImageCopyImage = useCallback((src) => {
      const api = getAPI();
      if (api?.copyImageToClipboard) {
        api.copyImageToClipboard(src);
      }
    }, []);

    const handleFileOpen = useCallback(async (src) => {
      const api = getAPI();
      if (!api?.resolveAttachment) return;
      const absPath = await api.resolveAttachment(src);
      if (absPath && api.openPath) api.openPath(absPath);
    }, []);

    const handleFileShowInFolder = useCallback(async (src) => {
      const api = getAPI();
      if (!api?.resolveAttachment) return;
      const absPath = await api.resolveAttachment(src);
      if (absPath && api.showItemInFolder) api.showItemInFolder(absPath);
    }, []);

    // Click outside the selected block to deselect
    const handleEditorClick = useCallback(
      (e) => {
        // A click on a selectable block's own root (its onClick has just set
        // the selection) or on the image's context menu keeps it.
        if (
          !e.target.closest('[data-block-type="image"], [data-block-type="spacer"]') &&
          !e.target.closest(".image-context-menu")
        ) {
          if (selectedBlockId) setSelectedBlockId(null);
        }
      },
      [selectedBlockId, setSelectedBlockId],
    );

    // Right-click context menu for links
    const [linkCtxMenu, setLinkCtxMenu] = useState(null);

    const handleEditorContextMenu = useCallback((e) => {
      const anchor = e.target.closest("a");
      const wikilink = e.target.closest(".wikilink");
      if (!anchor && !wikilink) return; // default context menu
      e.preventDefault();

      if (anchor) {
        const url = anchor.getAttribute("data-url") || anchor.getAttribute("href");
        setLinkCtxMenu({
          position: { top: e.clientY, left: e.clientX },
          linkType: "external",
          url,
          element: anchor,
        });
      } else if (wikilink) {
        const target = wikilink.getAttribute("data-target");
        // Create Note only where a click would create one (a plain name); a
        // broken heading, block or folder-path link gets Open Note, which
        // says why nothing opens rather than offering a note it won't make.
        const creatable =
          wikilink.classList.contains("wikilink-broken") &&
          wikilinkMayCreate(parseWikilinkTarget(target || ""));
        setLinkCtxMenu({
          position: { top: e.clientY, left: e.clientX },
          linkType: creatable ? "wikilink-broken" : "wikilink",
          url: target,
          element: wikilink,
        });
      }
    }, []);

    const dismissCtxMenu = useCallback(() => setLinkCtxMenu(null), []);

    // Width the editor actually has: the viewport less whatever the sidebar and
    // its handle are occupying. Mobile keeps its own fixed geometry.
    const editorW = `(100vw - ${sidebarVisible ? sidebarWidth + SIDEBAR_HANDLE_W : 0}px)`;
    const colPad = ramp(editorW, [COL_PAD_FROM, COL_PAD_MIN], [COL_PAD_TO, COL_PAD_MAX]);
    const colOffset = ramp(editorW, [COL_OFFSET_FROM, 0], [COL_OFFSET_TO, COL_OFFSET_MAX]);
    // The name's field, one element wherever it is rendered: in the chrome
    // row's path band on the desktop, at the head of the column on a touch
    // device. Its handlers are the title's own and do not change with the
    // place; only its rest colours do (primary ink in the band, muted in the
    // column).
    const restColor = isMobile ? TEXT.muted : TEXT.primary;
    // Memoised so the band's measuring effect keys on the folder, not on a
    // fresh array every render.
    const folder = note?.folder;
    const parents = useMemo(() => parentFolders(folder), [folder]);
    const hoverColor = isMobile ? TEXT.secondary : TEXT.primary;
    const titleField = note ? (
      <div
        ref={titleRef}
        contentEditable
        suppressContentEditableWarning
        data-title
        data-placeholder="Untitled"
        role="textbox"
        aria-label="Note title"
        onInput={(e) => {
          const newTitle = titleFieldText(e.currentTarget);
          commitTextChange((prev) => {
            const next = { ...prev };
            const n = { ...next[activeNote] };
            n.title = newTitle;
            n.content = { ...n.content, title: newTitle };
            next[activeNote] = n;
            return next;
          });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const blocks = noteDataRef.current[activeNote].content.blocks;
            const first = blocks.find((b) => isEditableBlock(b));
            if (first) {
              const firstId = first.id;
              const el = blockRefs.current[firstId];
              if (el) {
                placeCaret(el, 0);
                requestAnimationFrame(() => {
                  const sel = window.getSelection();
                  if (
                    sel.rangeCount &&
                    getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)
                  )
                    return;
                  const freshEl = blockRefs.current[firstId];
                  if (freshEl) placeCaret(freshEl, 0);
                });
              } else {
                focusBlockId.current = firstId;
                focusCursorPos.current = 0;
                forceRender((c) => c + 1);
              }
            }
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        onFocus={(e) => {
          // Truncation is a display concern — editing reveals the whole name.
          e.currentTarget.style.background = BG.surface;
          e.currentTarget.style.color = TEXT.primary;
          e.currentTarget.style.textOverflow = "clip";
          e.currentTarget.style.overflowX = "auto";
        }}
        onBlur={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = restColor;
          e.currentTarget.style.textOverflow = "ellipsis";
          e.currentTarget.style.overflowX = "hidden";
        }}
        onMouseEnter={(e) => {
          if (document.activeElement === e.currentTarget) return;
          e.currentTarget.style.background = BG.surface;
          e.currentTarget.style.color = hoverColor;
        }}
        onMouseLeave={(e) => {
          if (document.activeElement === e.currentTarget) return;
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = restColor;
        }}
        style={
          isMobile
            ? {
                fontSize: MOBILE_LABEL_FONT_SIZE,
                fontWeight: 500,
                color: restColor,
                lineHeight: MOBILE_LABEL_LINE_HEIGHT,
                margin: `0 0 ${MOBILE_LABEL_GAP}px ${-LABEL_PAD_X}px`,
                padding: `0 ${LABEL_PAD_X}px`,
                borderRadius: 4,
                outline: "none",
                position: "relative",
                cursor: "text",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                transition: "background 0.12s, color 0.12s",
              }
            : {
                // In the path band: the name's box is its text, and the hover
                // pill's padding is pulled back out with a negative margin so the
                // path centres on the letters, not on the pill.
                ...PATH_FONT,
                color: restColor,
                margin: `0 ${-LABEL_PAD_X}px`,
                padding: `0 ${LABEL_PAD_X}px`,
                borderRadius: 4,
                outline: "none",
                position: "relative",
                cursor: "text",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                // min-width is the stylesheet's: 0, or the placeholder's
                // width while the field is empty (GlobalStyles, [data-title]).
                flex: "1 1 auto",
                transition: "background 0.12s, color 0.12s",
              }
        }
      />
    ) : null;

    return (
      <div
        ref={editorScrollRef}
        className="editor-scroll"
        onMouseDown={onEditorClick}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
          overflowY: "auto",
          background: editorBg,
          position: "relative",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {note && !isMobile && (
          <NotePath
            parents={parents}
            name={note.title}
            collapsed={!sidebarVisible}
            fullScreen={fullScreen}
            bg={editorBg}
            activeNote={activeNote}
            onOpenNote={openNoteProp}
          >
            {titleField}
          </NotePath>
        )}
        {note ? (
          <div
            key={activeNote}
            ref={columnRef}
            className="panel-motion"
            style={{
              padding: isMobile
                ? "12px 20px 80px 20px"
                : `${COLUMN_TOP}px ${colPad} 80px ${colPad}`,
              maxWidth: isMobile ? "100%" : sidebarVisible ? 720 : 840,
              marginLeft: isMobile ? 0 : colOffset,
              marginRight: "auto",
              width: "100%",
              // The fade is opacity alone. No transform, ever: a transformed
              // element is the containing block for every `position: fixed`
              // descendant, and the link, code, image and file menus and the
              // table's create badge open fixed at the pointer's clientX/Y. The
              // 4px lift this used to carry offset them by the column's own
              // left edge and scroll, for the fade's 200ms and, because it
              // ended at translateY(0), for ever after (review 2026-09-07 §3.9).
              opacity: editorFadeIn ? 1 : 0,
              // Padding and margin ease too, so hiding the sidebar reads as the
              // column breathing out rather than the page re-laying-out under
              // you. `.sidebar-dragging` kills all transitions, so dragging the
              // divider stays 1:1.
              transition: `${panelTransition("max-width", "padding", "margin-left")}, opacity 0.2s ease`,
              position: "relative",
              // No z-index: as a stacking context the column kept its own
              // toolbar, find bar and popovers under the path band above it
              // (2026-09-15). Without one the band (Z.PATH_ROW) sits over the
              // blocks and the grip and under everything that floats.
            }}
          >
            {isMobile && titleField}

            {/* Blocks */}
            <div ref={editorContainerRef} style={{ position: "relative" }}>
              {findBarOpen && (
                <FindBar
                  editorRef={editorRef}
                  blocks={note.content.blocks}
                  blockRefs={blockRefs}
                  noteId={activeNote}
                  updateBlockText={updateBlockText}
                  initialShowReplace={findBarReplace}
                  onClose={() => {
                    setFindBarOpen(false);
                    setFindBarReplace(false);
                  }}
                />
              )}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="region"
                aria-label="Note editor"
                onKeyDown={(e) => {
                  // Cmd+F: toggle find bar, Cmd+H: find with replace
                  const mod = e.ctrlKey || e.metaKey;
                  if (mod && (e.key === "f" || e.key === "F") && !e.shiftKey) {
                    e.preventDefault();
                    setFindBarReplace(false);
                    setFindBarOpen((v) => !v);
                    return;
                  }
                  if (mod && (e.key === "h" || e.key === "H") && !e.shiftKey) {
                    e.preventDefault();
                    setFindBarReplace(true);
                    setFindBarOpen(true);
                    return;
                  }
                  // A selected whole block (divider or image) takes the key first.
                  if (selectedBlockId && handleSelectedBlockKey(e)) return;
                  handleEditorKeyDown(e);
                }}
                onInput={handleEditorInput}
                onPaste={handleEditorPaste}
                onCopy={handleEditorCopy}
                onCut={handleEditorCut}
                onMouseMove={handleEditorMouseMove}
                onMouseLeave={handleEditorMouseLeave}
                onContextMenu={handleEditorContextMenu}
                onMouseDown={(e) => {
                  handleEditorMouseDown(e);
                  // Prevent caret placement inside links on click (for instant open feel)
                  if (!e.shiftKey && e.button === 0) {
                    const anchor = e.target.closest("a");
                    const wikilink = e.target.closest(".wikilink");
                    if (anchor || wikilink) e.preventDefault();
                  }
                }}
                onMouseUp={handleEditorMouseUp}
                onFocus={handleEditorFocus}
                onDragOver={handleEditorDragOver}
                onDragLeave={handleEditorDragLeave}
                onDrop={handleEditorDrop}
                onClick={(e) => {
                  handleEditorClick(e);
                  const sel = window.getSelection();
                  // Don't open links if user was selecting text
                  if (sel && !sel.isCollapsed) return;
                  const anchor = e.target.closest("a");
                  if (anchor) {
                    e.preventDefault();
                    const url = anchor.getAttribute("href") || anchor.getAttribute("data-url");
                    if (url) {
                      const api = getAPI();
                      if (api?.openExternal) {
                        api.openExternal(url);
                      } else {
                        window.open(url, "_blank");
                      }
                    }
                    return;
                  }
                  const tag = e.target.closest(".inline-tag");
                  if (tag) {
                    const tagName = tag.getAttribute("data-tag");
                    if (tagName && onTagClick) onTagClick(tagName);
                    return;
                  }
                  const wikilink = e.target.closest(".wikilink");
                  if (wikilink) {
                    e.preventDefault();
                    const target = wikilink.getAttribute("data-target");
                    if (target && onWikilinkClick) onWikilinkClick(target);
                    return;
                  }
                }}
                data-editor
                style={{ outline: "none" }}
              >
                {(() => {
                  const listPositions = listLayout(note.content.blocks);
                  return note.content.blocks.map((block, i) => {
                    const numberedIndex = listPositions[i]?.number;
                    return (
                      <BlockErrorBoundary
                        key={block.id + "-" + block.type}
                        blockId={block.id}
                        onDelete={() => deleteBlock(activeNote, i)}
                      >
                        <EditableBlock
                          block={block}
                          blockIndex={i}
                          noteId={activeNote}
                          onCheckToggle={flipCheck}
                          onDeleteBlock={deleteWholeBlock}
                          registerRef={registerBlockRef}
                          syncGen={syncGeneration.current}
                          accentColor={accentColor}
                          numberedIndex={block.type === "numbered" ? numberedIndex : undefined}
                          onUpdateText={updateBlockText}
                          onUpdateLang={updateCodeLang}
                          onUpdateCallout={updateCallout}
                          onUpdateCalloutTitle={updateCalloutTitle}
                          onUpdateTableCell={updateTableCell}
                          onUpdateTableRows={updateTableRows}
                          noteTitleSet={noteTitleSet}
                          onBlockNav={handleBlockNav}
                          isBlockSelected={selectedBlockId === block.id}
                          onBlockSelect={handleBlockSelect}
                          onImageLightbox={handleImageLightbox}
                          onImageReplace={handleImageReplace}
                          onImageCopyImage={handleImageCopyImage}
                          onUpdateBlockProperty={updateBlockProperty}
                          onFileOpen={handleFileOpen}
                          onFileShowInFolder={handleFileShowInFolder}
                          noteDataRef={noteDataRef}
                          onNavigateToNote={onNavigateToNote}
                        />
                      </BlockErrorBoundary>
                    );
                  });
                })()}
              </div>
              {!isMobile && (
                <BlockDragHandle
                  columnRef={columnRef}
                  editorRef={editorRef}
                  startHandleDrag={startHandleDrag}
                />
              )}
              <FloatingToolbar
                position={toolbarState}
                activeFormats={activeFormats}
                onFormat={applyFormat}
              />
              <LinkTooltip url={linkTooltip?.url} position={linkTooltip?.position} />
              {linkPopover && (
                <LinkEditPopover
                  position={linkPopover.position}
                  initialUrl={linkPopover.url}
                  onApply={handleLinkApply}
                  onRemove={handleLinkRemove}
                  onDismiss={handleLinkDismiss}
                />
              )}
            </div>

            {/* Click to create new block */}
            <div
              style={{ minHeight: 200, cursor: "text" }}
              onMouseDown={(e) => {
                e.preventDefault();
                const blocks = noteDataRef.current[activeNote].content.blocks;
                if (blocks.length > 0) {
                  const lastBlock = blocks[blocks.length - 1];
                  const lastEl = blockRefs.current[lastBlock.id];
                  if (lastEl && (lastEl.innerText || "").trim() === "") {
                    placeCaret(lastEl, 0);
                    const lastId = lastBlock.id;
                    requestAnimationFrame(() => {
                      const sel = window.getSelection();
                      if (
                        sel.rangeCount &&
                        getBlockFromNode(
                          sel.anchorNode,
                          editorRef.current,
                          blocks,
                          blockRefs.current,
                        )
                      )
                        return;
                      const freshEl = blockRefs.current[lastId];
                      if (freshEl) placeCaret(freshEl, 0);
                    });
                    return;
                  }
                }
                insertBlockAfter(activeNote, blocks.length - 1, "p", "");
              }}
            />

            {/* Link context menu */}
            {linkCtxMenu && (
              <LinkContextMenu
                position={linkCtxMenu.position}
                linkType={linkCtxMenu.linkType}
                onOpen={() => {
                  if (linkCtxMenu.linkType === "external") {
                    const api = getAPI();
                    if (api?.openExternal) api.openExternal(linkCtxMenu.url);
                    else window.open(linkCtxMenu.url, "_blank");
                  } else {
                    if (onWikilinkClick) onWikilinkClick(linkCtxMenu.url);
                  }
                  dismissCtxMenu();
                }}
                onCopy={() => {
                  navigator.clipboard.writeText(linkCtxMenu.url);
                  dismissCtxMenu();
                }}
                onEdit={() => {
                  // Position the popover near the link element
                  const containerRect = editorContainerRef.current?.getBoundingClientRect();
                  const linkRect = linkCtxMenu.element.getBoundingClientRect();
                  const pos = containerRect
                    ? {
                        top: linkRect.bottom - containerRect.top + 4,
                        left: linkRect.left - containerRect.left,
                      }
                    : { top: linkCtxMenu.position.top, left: linkCtxMenu.position.left };
                  // Save a range at the link
                  const range = document.createRange();
                  range.selectNodeContents(linkCtxMenu.element);
                  setLinkPopover({
                    existingLink: linkCtxMenu.linkType === "external" ? linkCtxMenu.element : null,
                    url: linkCtxMenu.url,
                    text: linkText(linkCtxMenu.element),
                    position: pos,
                    savedRange: range,
                  });
                  dismissCtxMenu();
                }}
                onRemove={() => {
                  const el = linkCtxMenu.element;
                  const textContent = Array.from(el.childNodes)
                    .filter((n) => !n.classList?.contains("external-link-icon"))
                    .map((n) => n.textContent)
                    .join("");
                  const textNode = document.createTextNode(textContent);
                  el.parentNode.replaceChild(textNode, el);
                  reReadBlockFromDom();
                  dismissCtxMenu();
                }}
                onCreate={() => {
                  if (onWikilinkClick) onWikilinkClick(linkCtxMenu.url);
                  dismissCtxMenu();
                }}
                onDismiss={dismissCtxMenu}
              />
            )}
          </div>
        ) : (
          !isMobile && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: Z.BASE + 1,
                pointerEvents: "none",
              }}
            >
              <div style={{ textAlign: "center", color: `${TEXT.muted}80`, fontSize: 14 }}>
                <div>Select a note from the sidebar</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>or press ⌘N to create one</div>
              </div>
            </div>
          )
        )}
      </div>
    );
  },
  (prev, next) => {
    const t0 = performance.now();

    // A sync-generation bump means the blocks must be repainted from state:
    // undo/redo, an external file change, a paste. It outranks every other
    // shortcut here, because a text-only undo looks exactly like a text-only
    // edit to the checks below — and those exist to *skip* the repaint.
    if (prev.syncGen !== next.syncGen) return false;

    // Fast path: text-only edits don't change block structure, and the
    // contentEditable DOM is already correct — skip the block loop entirely.
    if (next.textOnlyEditForEditor?.current) {
      next.textOnlyEditForEditor.current = false; // consume the flag
      return true;
    }

    // Custom comparator: avoid re-render on pure text edits while still
    // repainting React-owned state such as checkbox checked/unchecked styling.
    const pBlocks = prev.note?.content?.blocks;
    const nBlocks = next.note?.content?.blocks;
    if (haveEditorBlockRenderChanges(pBlocks, nBlocks)) return false;
    const result =
      prev.activeNote === next.activeNote &&
      prev.editorFadeIn === next.editorFadeIn &&
      prev.toolbarState === next.toolbarState &&
      prev.noteTitleSet === next.noteTitleSet &&
      prev.linkPopover === next.linkPopover &&
      prev.selectedBlockId === next.selectedBlockId &&
      prev.lightbox === next.lightbox;
    const dt = performance.now() - t0;
    if (import.meta.env.DEV && dt > 0.5)
      console.warn(
        `[perf] EditorArea memo comparator: ${dt.toFixed(2)}ms, blocks: ${next.note?.content?.blocks?.length}`,
      );
    return result;
  },
);

export default EditorArea;
