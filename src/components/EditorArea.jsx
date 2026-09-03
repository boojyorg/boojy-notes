import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { EMPTY_FORMATS } from "../hooks/useInlineFormatting";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { useSettings } from "../context/SettingsContext";
import { useEditorContext } from "../context/EditorContext";
import { getAPI } from "../services/apiProvider";
import { CHROME_INSET, CHROME_BTN } from "./EditorChrome";
import StarField from "./StarField";
import EditableBlock from "./EditableBlock";
import BlockErrorBoundary from "./BlockErrorBoundary";
import BlockDragHandle from "./BlockDragHandle";
import FloatingToolbar from "./FloatingToolbar";
import BacklinksPanel from "./BacklinksPanel";
import LinkTooltip from "./LinkTooltip";
import LinkEditPopover from "./LinkEditPopover";
import OnboardingHint from "./OnboardingHint";
import LinkContextMenu from "./LinkContextMenu";
import { getBlockFromNode, placeCaret, isEditableBlock } from "../utils/domHelpers";
import { haveEditorBlockRenderChanges } from "../utils/editorBlockRenderChanges";
import FindBar from "./FindBar";
import { ramp } from "../utils/fluidLength";

/*
 * The note name is a FILE LABEL, not the document's heading.
 *
 * It reads at label rank — small, muted, medium weight — so it can never
 * compete with a real Markdown H1 in the body. A note whose file is
 * `boojy-notes-design-demo-v1.2.md` and whose first block is `# Notes Demo
 * v1.2` shows both, and they read as file-then-document rather than as two
 * titles. The filename and the H1 stay independent: editing the heading never
 * renames the file.
 *
 * Vertically it joins the one optical row the app already has. The sidebar
 * header centres its children at 25px (height CHROME_INSET + CHROME_BTN, 8px
 * of top padding); EditorChrome pins ··· at CHROME_INSET with a CHROME_BTN-tall
 * button, centring it at 26px. Putting the label's line-box centre at 26px
 * lines it up with the wordmark, the toggle and the ···.
 */
const LABEL_FONT_SIZE = 13.5;
const LABEL_LINE_HEIGHT = 1.4;
const LABEL_ROW_CENTER = CHROME_INSET + CHROME_BTN / 2;
const LABEL_TOP = Math.round(LABEL_ROW_CENTER - (LABEL_FONT_SIZE * LABEL_LINE_HEIGHT) / 2);
/** Air between the label row and the first Markdown block. */
const LABEL_GAP = 26;
/** Kept clear on the label's right so a long name truncates before the ···. */
const LABEL_RIGHT_RESERVE = 48;
/**
 * Negative inset so the hover tint can have padding without moving the text.
 */
const LABEL_PAD_X = 5;
/**
 * Kept clear on the label's LEFT, but only while the panel toggle is pinned to
 * the viewport corner. At full padding the label starts well clear of it; once
 * the gutters tighten (see below) the two would collide. Measured to the hover
 * pill rather than the text, so what you see keeps 8px of air from the toggle.
 */
const LABEL_LEFT_RESERVE = CHROME_INSET + CHROME_BTN + 8 + LABEL_PAD_X;

/*
 * The writing column is fluid, because the window is.
 *
 * Width should change how much room the prose has, never what the app is. So
 * as the window narrows the column gives up its decorative left offset first
 * and its gutters second — losing them in that order keeps text comfortable
 * for roughly 200px longer than shrinking both at once would.
 *
 * Both ramps are linear between two anchors and clamped at each end. The
 * offset is fully spent at 560px of editor width, which is exactly the floor
 * at which the sidebar stops fitting (MIN_EDITOR_WIDTH) — by the time the
 * sidebar leaves the layout there is no offset left to lose.
 *
 * Driven by viewport math rather than container queries on purpose:
 * `container-type` applies layout containment, which would make the editor
 * scroller a containing block for its `position: fixed` descendants (the slash
 * menu, the floating toolbar, the link popovers) and quietly re-anchor them.
 */
/** Side gutters: COL_PAD_MIN at COL_PAD_FROM of editor width, MAX at _TO. */
const COL_PAD_MIN = 24;
const COL_PAD_MAX = 56;
const COL_PAD_FROM = 400;
const COL_PAD_TO = 800;
/** Decorative left offset: 0 at the editor floor, COL_OFFSET_MAX at _TO. */
const COL_OFFSET_MAX = 40;
const COL_OFFSET_FROM = 560;
const COL_OFFSET_TO = 880;
/** The drag handle between sidebar and editor also eats width. */
const SIDEBAR_HANDLE_W = 4;

// "Does this note have any content?" — drives the starfield fade. Media blocks
// (image/file/embed/table) count as content even with no text; everything else
// counts only if it has non-whitespace text. A fresh note is a single empty `p`
// → false → stars show.
const MEDIA_BLOCK_TYPES = new Set(["image", "file", "embed", "table"]);
function blocksHaveContent(blocks) {
  if (!blocks) return false;
  return blocks.some((b) =>
    MEDIA_BLOCK_TYPES.has(b.type) ? true : (b.text || "").trim().length > 0,
  );
}

const EditorArea = memo(
  function EditorArea({
    isMobile,
    textOnlyEditForEditor,
    note,
    activeNote,
    editorFadeIn,
    backlinks,
    onWikilinkClick,
    onTagClick,
    onOpenBacklink,
    toolbarState,
    noteTitleSet,
    linkPopover,
    setLinkPopover,
    selectedImageBlockId,
    setSelectedImageBlockId,
    lightbox,
    setLightbox,
    openNote: openNoteProp,
    onEditorClick,
    onWikilinkCmdClick,
    activeHint,
    dismissHint,
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
      handleEditorPointerDown,
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
      updateCodeText,
      updateCodeLang,
      updateCallout,
      updateTableRows,
      updateBlockProperty,
      detectActiveFormats,
      applyFormat,
      reReadBlockFromDom,
    } = useEditorContext();
    const { theme } = useTheme();
    const { TEXT, BG } = theme;
    const { accentColor, editorBg, sidebarInFlow, sidebarVisible, sidebarWidth } = useLayout();
    const { settingsFontSize } = useSettings();

    // Find bar state
    const [findBarOpen, setFindBarOpen] = useState(false);
    const [findBarReplace, setFindBarReplace] = useState(false);

    // Link tooltip state
    const [linkTooltip, setLinkTooltip] = useState(null);
    const tooltipTimer = useRef(null);
    const editorContainerRef = useRef(null);
    // Note column (padding + measure) — the drag handle positions against it.
    const columnRef = useRef(null);

    // Clean up tooltip timer on unmount to prevent state updates on unmounted component
    useEffect(() => () => clearTimeout(tooltipTimer.current), []);

    // ── Starfield fade: "note has content" signal ──────────────────────────────
    // Stars show on an empty note and fade out once it has content — tied to
    // CONTENT, not focus. Two sources keep this both correct and instant:
    //  (A) authoritative — recompute from the note's blocks on open/switch and on
    //      any structural change (delete/undo). This handles "open a written note →
    //      no stars" and "emptied → fade back in".
    //  (B) instant — the live DOM on the first keystroke. block.text lags typing by
    //      the 300ms commit debounce, so reading state here would make the fade feel
    //      laggy; we read the DOM instead (per the editor gotchas in CLAUDE.md).
    // (B) only ever turns the fade ON (content just arrived); (A) owns turning it
    // back off, so a media-only note never wrongly fades back in.
    const [noteHasContent, setNoteHasContent] = useState(false);
    const noteHasContentRef = useRef(false);
    const applyHasContent = useCallback((val) => {
      if (noteHasContentRef.current === val) return;
      noteHasContentRef.current = val;
      setNoteHasContent(val);
    }, []);

    // (A) authoritative — blocks identity changes on open/switch/edit-commit/undo.
    // useLayoutEffect (not useEffect) so the correct value is set BEFORE paint:
    // opening a written note must show no stars, with no one-frame flash.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeNote keys the note; blocks identity is the change signal
    useLayoutEffect(() => {
      applyHasContent(blocksHaveContent(note?.content?.blocks));
    }, [activeNote, note?.content?.blocks, applyHasContent]);

    // (B) instant fade-out on first keystroke (reads DOM, pre-debounce)
    const handleContentInput = useCallback(() => {
      if (noteHasContentRef.current) return; // already faded out
      if ((editorRef.current?.textContent || "").trim().length > 0) {
        applyHasContent(true);
      }
    }, [applyHasContent, editorRef]);

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

    const handleEditorMouseMove = useCallback((e) => {
      const link = e.target.closest("a") || e.target.closest(".wikilink");
      if (link) {
        const url =
          link.getAttribute("data-url") ||
          link.getAttribute("href") ||
          link.getAttribute("data-target");
        if (url && (!tooltipTimer.current || tooltipTimer.current._url !== url)) {
          clearTimeout(tooltipTimer.current);
          const timer = setTimeout(() => {
            const containerRect = editorContainerRef.current?.getBoundingClientRect();
            const linkRect = link.getBoundingClientRect();
            if (containerRect) {
              setLinkTooltip({
                url: link.classList.contains("wikilink") ? `[[${url}]]` : url,
                position: {
                  top: linkRect.bottom - containerRect.top + 4,
                  left: linkRect.left - containerRect.left,
                },
              });
            }
          }, 500);
          timer._url = url;
          tooltipTimer.current = timer;
        }
      } else {
        clearTimeout(tooltipTimer.current);
        tooltipTimer.current = null;
        setLinkTooltip(null);
      }
    }, []);

    const handleEditorMouseLeave = useCallback(() => {
      clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
      setLinkTooltip(null);
    }, []);

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

    // Block navigation for code blocks (Escape / ArrowUp / ArrowDown at edges)
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
        if (target.type === "code") {
          // Focus the textarea inside the code block
          const wrapper = editorRef.current?.querySelector(`[data-block-id="${target.id}"]`);
          const ta = wrapper?.querySelector("textarea");
          if (ta) ta.focus();
        } else {
          const el = blockRefs.current[target.id];
          if (el) {
            placeCaret(el, direction === "prev" ? el.textContent?.length || 0 : 0);
          }
        }
      },
      [activeNote, noteDataRef, blockRefs, editorRef, titleRef],
    );

    // Image interaction callbacks
    const handleImageSelect = useCallback(
      (blockId) => {
        setSelectedImageBlockId(blockId);
      },
      [setSelectedImageBlockId],
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

    // Click outside image to deselect
    const handleEditorClick = useCallback(
      (e) => {
        // Don't deselect if clicking on an image block or its context menu
        if (
          !e.target.closest("[data-block-id]")?.querySelector("img") &&
          !e.target.closest(".image-context-menu")
        ) {
          if (selectedImageBlockId) setSelectedImageBlockId(null);
        }
      },
      [selectedImageBlockId, setSelectedImageBlockId],
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
        const isBroken = wikilink.classList.contains("wikilink-broken");
        setLinkCtxMenu({
          position: { top: e.clientY, left: e.clientX },
          linkType: isBroken ? "wikilink-broken" : "wikilink",
          url: target,
          element: wikilink,
        });
      }
    }, []);

    const dismissCtxMenu = useCallback(() => setLinkCtxMenu(null), []);

    // Width the editor actually has: the viewport less whatever the sidebar and
    // its handle are occupying. An overlay sidebar occupies nothing — it's
    // painted on top — so the editor measures the full viewport underneath it.
    // Mobile keeps its own fixed geometry.
    const editorW = `(100vw - ${sidebarInFlow ? sidebarWidth + SIDEBAR_HANDLE_W : 0}px)`;
    const colPad = ramp(editorW, [COL_PAD_FROM, COL_PAD_MIN], [COL_PAD_TO, COL_PAD_MAX]);
    const colOffset = ramp(editorW, [COL_OFFSET_FROM, 0], [COL_OFFSET_TO, COL_OFFSET_MAX]);
    // The toggle is only pinned to the corner while the sidebar isn't showing;
    // that is the only time the label has to step around it.
    const labelIndent = !sidebarVisible
      ? `max(0px, calc(${LABEL_LEFT_RESERVE}px - ${colPad} - ${colOffset}))`
      : "0px";

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
        {theme.starField && (
          <StarField mode="editor" seed={activeNote || "__empty__"} hasContent={noteHasContent} />
        )}
        {note ? (
          <div
            key={activeNote}
            ref={columnRef}
            style={{
              padding: isMobile ? "12px 20px 80px 20px" : `${LABEL_TOP}px ${colPad} 80px ${colPad}`,
              maxWidth: isMobile ? "100%" : sidebarInFlow ? 720 : 840,
              marginLeft: isMobile ? 0 : colOffset,
              marginRight: "auto",
              width: "100%",
              opacity: editorFadeIn ? 1 : 0,
              transform: editorFadeIn ? "translateY(0)" : "translateY(4px)",
              // Padding and margin ease too, so crossing the width at which the
              // sidebar leaves the layout reads as the column breathing out
              // rather than the page re-laying-out under you. `.sidebar-dragging`
              // kills all transitions, so dragging the divider stays 1:1.
              transition:
                "max-width 0.2s ease, padding 0.2s ease, margin-left 0.2s ease, opacity 0.2s ease, transform 0.2s ease",
              position: "relative",
              zIndex: Z.BASE,
            }}
          >
            {activeHint && (
              <OnboardingHint hint={activeHint} onDismiss={dismissHint} accentColor={accentColor} />
            )}
            {/* File label — see the LABEL_* constants for why it looks like this.
                The breadcrumb that used to sit above it is gone: it only ever
                populated for notes created in-session inside a folder, so it
                appeared inconsistently, and a second muted line directly above
                this one reads as a stack of two labels. Location is the
                sidebar's job. */}
            <div
              ref={titleRef}
              contentEditable
              suppressContentEditableWarning
              data-title
              data-placeholder="Untitled"
              role="textbox"
              aria-label="Note title"
              className={!note.title ? "empty-title" : undefined}
              onInput={(e) => {
                const newTitle = e.currentTarget.innerText;
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
                          getBlockFromNode(
                            sel.anchorNode,
                            editorRef.current,
                            blocks,
                            blockRefs.current,
                          )
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
                e.currentTarget.style.color = TEXT.muted;
                e.currentTarget.style.textOverflow = "ellipsis";
                e.currentTarget.style.overflowX = "hidden";
              }}
              onMouseEnter={(e) => {
                if (document.activeElement === e.currentTarget) return;
                e.currentTarget.style.background = BG.surface;
                e.currentTarget.style.color = TEXT.secondary;
              }}
              onMouseLeave={(e) => {
                if (document.activeElement === e.currentTarget) return;
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = TEXT.muted;
              }}
              style={{
                fontSize: LABEL_FONT_SIZE,
                fontWeight: 500,
                color: TEXT.muted,
                lineHeight: LABEL_LINE_HEIGHT,
                margin: `0 ${LABEL_RIGHT_RESERVE}px ${LABEL_GAP}px calc(${-LABEL_PAD_X}px + ${labelIndent})`,
                padding: `0 ${LABEL_PAD_X}px`,
                borderRadius: 4,
                outline: "none",
                position: "relative",
                cursor: "text",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                transition: "background 0.12s, color 0.12s",
              }}
            />

            {/* Blocks */}
            <div ref={editorContainerRef} style={{ position: "relative" }}>
              {findBarOpen && (
                <FindBar
                  editorRef={editorRef}
                  blocks={note.content.blocks}
                  blockRefs={blockRefs}
                  noteId={activeNote}
                  commitTextChange={commitTextChange}
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
                  // Handle image selection keys
                  if (selectedImageBlockId) {
                    if (e.key === "Escape" || e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      setSelectedImageBlockId(null);
                      return;
                    }
                    if (e.key === "Backspace" || e.key === "Delete") {
                      e.preventDefault();
                      const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
                      const idx = blocks.findIndex((b) => b.id === selectedImageBlockId);
                      if (idx >= 0) deleteBlock(activeNote, idx);
                      setSelectedImageBlockId(null);
                      return;
                    }
                    // Printable character: deselect image and let keystroke through
                    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
                      setSelectedImageBlockId(null);
                    }
                  }
                  handleEditorKeyDown(e);
                }}
                onInput={(e) => {
                  handleEditorInput(e);
                  handleContentInput();
                }}
                onPaste={handleEditorPaste}
                onCopy={handleEditorCopy}
                onPointerDown={handleEditorPointerDown}
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
                    if (target) {
                      if (e.metaKey && onWikilinkCmdClick) {
                        onWikilinkCmdClick(target);
                      } else if (onWikilinkClick) {
                        onWikilinkClick(target);
                      }
                    }
                    return;
                  }
                }}
                data-editor
                style={{ outline: "none" }}
              >
                {(() => {
                  let numCounters = {};
                  return note.content.blocks.map((block, i) => {
                    let numberedIndex;
                    if (block.type === "numbered") {
                      const indent = block.indent || 0;
                      numCounters[indent] = (numCounters[indent] || 0) + 1;
                      // Reset deeper-level counters
                      Object.keys(numCounters).forEach((k) => {
                        if (+k > indent) delete numCounters[k];
                      });
                      numberedIndex = numCounters[indent];
                    } else {
                      numCounters = {};
                    }
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
                          onDeleteBlock={deleteBlock}
                          registerRef={registerBlockRef}
                          syncGen={syncGeneration.current}
                          accentColor={accentColor}
                          fontSize={settingsFontSize}
                          numberedIndex={block.type === "numbered" ? numberedIndex : undefined}
                          onUpdateCode={updateCodeText}
                          onUpdateLang={updateCodeLang}
                          onUpdateCallout={updateCallout}
                          onUpdateTableRows={updateTableRows}
                          noteTitleSet={noteTitleSet}
                          onBlockNav={handleBlockNav}
                          isImageSelected={selectedImageBlockId === block.id}
                          onImageSelect={handleImageSelect}
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

            {/* Backlinks panel */}
            <BacklinksPanel
              backlinks={backlinks}
              onOpenNote={onOpenBacklink}
              accentColor={accentColor}
            />

            {/* Link context menu */}
            {linkCtxMenu && (
              <LinkContextMenu
                position={linkCtxMenu.position}
                linkType={linkCtxMenu.linkType}
                url={linkCtxMenu.url}
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
                    text: linkCtxMenu.element.textContent?.replace(/\u2197/g, "") || "",
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
      prev.selectedImageBlockId === next.selectedImageBlockId &&
      prev.lightbox === next.lightbox &&
      prev.backlinks === next.backlinks &&
      prev.activeHint === next.activeHint;
    const dt = performance.now() - t0;
    if (import.meta.env.DEV && dt > 0.5)
      console.warn(
        `[perf] EditorArea memo comparator: ${dt.toFixed(2)}ms, blocks: ${next.note?.content?.blocks?.length}`,
      );
    return result;
  },
);

export default EditorArea;
