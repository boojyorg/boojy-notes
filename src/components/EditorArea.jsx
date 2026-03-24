import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { useSettings } from "../context/SettingsContext";
import { useEditorContext } from "../context/EditorContext";
import { getAPI } from "../services/apiProvider";
import { BreadcrumbChevron } from "./Icons";
import StarField from "./StarField";
import EditableBlock from "./EditableBlock";
import FloatingToolbar from "./FloatingToolbar";
import BacklinksPanel from "./BacklinksPanel";
import LinkTooltip from "./LinkTooltip";
import LinkEditPopover from "./LinkEditPopover";
import LinkContextMenu from "./LinkContextMenu";
import { getBlockFromNode, placeCaret, isEditableBlock } from "../utils/domHelpers";
import FindBar from "./FindBar";

const EMPTY_FORMATS = {
  bold: false,
  italic: false,
  code: false,
  link: false,
  strikethrough: false,
  highlight: false,
};

const EditorArea = memo(
  function EditorArea({
    textOnlyEditForEditor,
    note,
    activeNote,
    editorFadeIn,
    backlinks,
    onWikilinkClick,
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
    const { TEXT, ACCENT } = theme;
    const { accentColor, editorBg, collapsed } = useLayout();
    const { settingsFontSize } = useSettings();

    // Find bar state
    const [findBarOpen, setFindBarOpen] = useState(false);

    // Link tooltip state
    const [linkTooltip, setLinkTooltip] = useState(null);
    const tooltipTimer = useRef(null);
    const editorContainerRef = useRef(null);

    // Clean up tooltip timer on unmount to prevent state updates on unmounted component
    useEffect(() => () => clearTimeout(tooltipTimer.current), []);

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
        }}
      >
        {theme.starField && <StarField mode="editor" seed={activeNote || "__empty__"} />}
        {note ? (
          <div
            key={activeNote}
            style={{
              padding: "12px 56px 80px 56px",
              maxWidth: collapsed ? 840 : 720,
              marginLeft: 40,
              marginRight: "auto",
              width: "100%",
              opacity: editorFadeIn ? 1 : 0,
              transform: editorFadeIn ? "translateY(0)" : "translateY(4px)",
              transition: "max-width 0.2s ease, opacity 0.2s ease, transform 0.2s ease",
              position: "relative",
              zIndex: Z.BASE,
            }}
          >
            {/* Breadcrumb */}
            {note.path && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  marginBottom: 16,
                  fontSize: 12,
                }}
              >
                {note.path.map((seg, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {i > 0 && <BreadcrumbChevron />}
                    <span
                      style={{
                        color: i < note.path.length - 1 ? TEXT.secondary : TEXT.muted,
                        cursor: i < note.path.length - 1 ? "pointer" : "default",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        if (i < note.path.length - 1) e.target.style.color = ACCENT.primary;
                      }}
                      onMouseLeave={(e) => {
                        if (i < note.path.length - 1) e.target.style.color = TEXT.secondary;
                      }}
                    >
                      {seg}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Title */}
            <h1
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
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: TEXT.primary,
                margin: "0 0 16px",
                lineHeight: 1.3,
                letterSpacing: "-0.4px",
                outline: "none",
                position: "relative",
              }}
            />

            {/* Title separator */}
            <div
              style={{
                height: 1,
                marginBottom: 20,
                background: `linear-gradient(90deg, ${accentColor}33, ${accentColor}0D, transparent)`,
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
                  onClose={() => setFindBarOpen(false)}
                />
              )}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="region"
                aria-label="Note editor"
                onKeyDown={(e) => {
                  // Cmd+F: toggle find bar
                  const mod = e.ctrlKey || e.metaKey;
                  if (mod && (e.key === "f" || e.key === "F") && !e.shiftKey) {
                    e.preventDefault();
                    setFindBarOpen((v) => !v);
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
                onInput={handleEditorInput}
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
                      <EditableBlock
                        key={block.id + "-" + block.type}
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
                    );
                  });
                })()}
              </div>
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
        ) : null}
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

    // Custom comparator: avoid re-render on pure text edits
    // Compare note by block structure (ids + types), not by reference
    const pBlocks = prev.note?.content?.blocks;
    const nBlocks = next.note?.content?.blocks;
    if (pBlocks !== nBlocks) {
      if (!pBlocks || !nBlocks || pBlocks.length !== nBlocks.length) return false;
      for (let i = 0; i < pBlocks.length; i++) {
        if (
          pBlocks[i].id !== nBlocks[i].id ||
          pBlocks[i].type !== nBlocks[i].type ||
          pBlocks[i].indent !== nBlocks[i].indent
        )
          return false;
        // Code blocks manage their own textarea — must re-render on text/lang changes
        if (
          pBlocks[i].type === "code" &&
          (pBlocks[i].text !== nBlocks[i].text || pBlocks[i].lang !== nBlocks[i].lang)
        )
          return false;
        // Table blocks — must re-render when rows or alignments change
        if (
          pBlocks[i].type === "table" &&
          (pBlocks[i].rows !== nBlocks[i].rows || pBlocks[i].alignments !== nBlocks[i].alignments)
        )
          return false;
      }
    }
    // Check path changed (folder move / breadcrumb)
    if (prev.note?.path !== next.note?.path) return false;
    const result =
      prev.activeNote === next.activeNote &&
      prev.editorFadeIn === next.editorFadeIn &&
      prev.toolbarState === next.toolbarState &&
      prev.noteTitleSet === next.noteTitleSet &&
      prev.linkPopover === next.linkPopover &&
      prev.selectedImageBlockId === next.selectedImageBlockId &&
      prev.lightbox === next.lightbox &&
      prev.backlinks === next.backlinks;
    const dt = performance.now() - t0;
    if (dt > 0.5)
      console.warn(
        `[perf] EditorArea memo comparator: ${dt.toFixed(2)}ms, blocks: ${next.note?.content?.blocks?.length}`,
      );
    return result;
  },
);

export default EditorArea;
