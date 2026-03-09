import { memo, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useTheme } from "../hooks/useTheme";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";
import CodeBlock from "./CodeBlock";
import FrontmatterBlock from "./FrontmatterBlock";
import CalloutBlock from "./CalloutBlock";
import TableBlock from "./TableBlock";

function ImageBlock({
  src,
  alt,
  width,
  isSelected,
  onSelect,
  onLightbox,
  onDelete,
  onReplace,
  onCopyImage,
  onUpdateWidth,
  accentColor,
}) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const [hovered, setHovered] = useState(false);
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  const resolvedSrc = src ? (src.startsWith("data:") ? src : `boojy-att://${src}`) : "";

  const [ctxMenu, setCtxMenu] = useState(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = (e) => {
      if (!e.target.closest(".image-context-menu")) setCtxMenu(null);
    };
    const dismissKey = (e) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismissKey);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismissKey);
    };
  }, [ctxMenu]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    setCtxMenu({ top: e.clientY, left: e.clientX });
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (isSelected) {
      onLightbox();
    } else {
      onSelect();
    }
  };

  const handleResizeStart = (e, corner) => {
    e.preventDefault();
    e.stopPropagation();
    const container = containerRef.current?.parentElement;
    if (!container) return;
    const editorWidth = container.offsetWidth;
    const startX = e.clientX;
    const startWidth = ((width || 100) / 100) * editorWidth;

    const onMove = (me) => {
      const dx = corner === "nw" || corner === "sw" ? startX - me.clientX : me.clientX - startX;
      const newPx = Math.max(editorWidth * 0.1, Math.min(editorWidth, startWidth + dx * 2));
      const newPct = Math.round((newPx / editorWidth) * 100);
      dragRef.current = newPct;
      if (containerRef.current) {
        containerRef.current.style.width = newPct + "%";
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (dragRef.current != null) {
        onUpdateWidth(Math.max(10, Math.min(100, dragRef.current)));
        dragRef.current = null;
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (errored || !src) {
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          border: `1.5px dashed ${TEXT.muted}`,
          borderRadius: 6,
          padding: "24px 16px",
          textAlign: "center",
          color: TEXT.muted,
          fontSize: 13,
        }}
      >
        Image not found: {src || "(empty)"}
        {hovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        )}
      </div>
    );
  }

  const handleCorner = (corner) => (e) => handleResizeStart(e, corner);
  const cornerStyle = (pos) => ({
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#fff",
    border: `2px solid ${accentColor}`,
    cursor: pos === "nw" || pos === "se" ? "nwse-resize" : "nesw-resize",
    zIndex: 5,
    ...(pos === "nw" ? { top: -5, left: -5 } : {}),
    ...(pos === "ne" ? { top: -5, right: -5 } : {}),
    ...(pos === "sw" ? { bottom: -5, left: -5 } : {}),
    ...(pos === "se" ? { bottom: -5, right: -5 } : {}),
  });

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        ref={containerRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          position: "relative",
          borderRadius: 6,
          width: `${width || 100}%`,
          border: isSelected
            ? `2px solid ${accentColor}`
            : hovered
              ? `2px solid ${accentColor}55`
              : "2px solid transparent",
          transition: "border-color 0.15s",
          cursor: isSelected ? "zoom-in" : "pointer",
        }}
      >
        {loading && (
          <div
            style={{
              width: "100%",
              height: 120,
              borderRadius: 6,
              background: BG.elevated,
              animation: "img-pulse 1.5s ease-in-out infinite",
            }}
          />
        )}
        <style>{`@keyframes img-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.7; } }`}</style>
        <img
          src={resolvedSrc}
          alt={alt || ""}
          draggable="false"
          loading="lazy"
          onLoad={() => setLoading(false)}
          onError={() => {
            setErrored(true);
            setLoading(false);
          }}
          style={{
            display: loading ? "none" : "block",
            width: "100%",
            borderRadius: 6,
          }}
        />
        {isSelected && !loading && (
          <>
            <div onMouseDown={handleCorner("nw")} style={cornerStyle("nw")} />
            <div onMouseDown={handleCorner("ne")} style={cornerStyle("ne")} />
            <div onMouseDown={handleCorner("sw")} style={cornerStyle("sw")} />
            <div onMouseDown={handleCorner("se")} style={cornerStyle("se")} />
          </>
        )}
      </div>
      {ctxMenu && (
        <div
          className="image-context-menu"
          style={{
            position: "fixed",
            top: ctxMenu.top,
            left: ctxMenu.left,
            background: BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: 8,
            padding: 4,
            minWidth: 180,
            zIndex: 300,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            backdropFilter: "blur(12px)",
          }}
        >
          {[
            {
              label: "View Full Size",
              action: () => {
                setCtxMenu(null);
                onLightbox();
              },
            },
            {
              label: "Replace Image",
              action: () => {
                setCtxMenu(null);
                onReplace();
              },
            },
            {
              label: "Copy Image",
              action: () => {
                setCtxMenu(null);
                onCopyImage();
              },
            },
            {
              label: "Delete",
              action: () => {
                setCtxMenu(null);
                onDelete();
              },
            },
          ].map((item) => (
            <div
              key={item.label}
              onClick={item.action}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                color: TEXT.primary,
                cursor: "pointer",
                borderRadius: 4,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = BG.hover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

function getFileTypePill(filename) {
  const ext =
    filename.lastIndexOf(".") !== -1
      ? filename.slice(filename.lastIndexOf(".") + 1).toUpperCase()
      : "FILE";
  return ext;
}

function formatFriendlyFilename(filename) {
  const name =
    filename.lastIndexOf(".") !== -1 ? filename.slice(0, filename.lastIndexOf(".")) : filename;
  return name.replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function FileBlock({ src, filename, size, onDelete, onOpen, onShowInFolder, accentColor }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const [hovered, setHovered] = useState(false);
  const [fileSize, setFileSize] = useState(size);
  const [ctxMenu, setCtxMenu] = useState(null);

  useEffect(() => {
    if (fileSize == null && src && window.electronAPI?.getFileSize) {
      window.electronAPI.getFileSize(src).then((s) => {
        if (s != null) setFileSize(s);
      });
    }
  }, [src, fileSize]);

  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = (e) => {
      if (!e.target.closest(".file-context-menu")) setCtxMenu(null);
    };
    const dismissKey = (e) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", dismissKey);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismissKey);
    };
  }, [ctxMenu]);

  const handleClick = () => {
    if (onOpen) onOpen();
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ top: e.clientY, left: e.clientX });
  };

  const displayName = formatFriendlyFilename(filename || src || "Unknown");
  const typePill = getFileTypePill(filename || src || "");

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 8,
          border: `1px solid ${BG.divider}`,
          background: hovered ? BG.hover : BG.elevated,
          cursor: "pointer",
          transition: "background 0.15s",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 20, flexShrink: 0 }}>{"\uD83D\uDCCE"}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: TEXT.primary,
              fontSize: 13,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: accentColor,
                background: `${accentColor}18`,
                padding: "1px 6px",
                borderRadius: 3,
                letterSpacing: 0.5,
              }}
            >
              {typePill}
            </span>
            {fileSize != null && (
              <span style={{ fontSize: 11, color: TEXT.muted }}>{formatFileSize(fileSize)}</span>
            )}
          </div>
        </div>
      </div>
      {ctxMenu && (
        <div
          className="file-context-menu"
          style={{
            position: "fixed",
            top: ctxMenu.top,
            left: ctxMenu.left,
            background: BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: 8,
            padding: 4,
            minWidth: 180,
            zIndex: 300,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            backdropFilter: "blur(12px)",
          }}
        >
          {[
            {
              label: "Open File",
              action: () => {
                setCtxMenu(null);
                onOpen();
              },
            },
            {
              label: "Show in Folder",
              action: () => {
                setCtxMenu(null);
                onShowInFolder();
              },
            },
            {
              label: "Copy File Path",
              action: () => {
                setCtxMenu(null);
                navigator.clipboard.writeText(src || "");
              },
            },
            {
              label: "Delete",
              action: () => {
                setCtxMenu(null);
                onDelete();
              },
            },
          ].map((item) => (
            <div
              key={item.label}
              onClick={item.action}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                color: TEXT.primary,
                cursor: "pointer",
                borderRadius: 4,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = BG.hover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EmbedBlock({ block, noteData, accentColor, onNavigate, depth = 0 }) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  if (depth >= 3) {
    return (
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px dashed ${TEXT.muted}`,
          color: TEXT.muted,
          fontSize: 12,
        }}
      >
        Embed depth limit reached
      </div>
    );
  }

  const targetNote = noteData
    ? Object.values(noteData).find(
        (n) => n.title?.toLowerCase() === block.target?.toLowerCase(),
      )
    : null;

  if (!targetNote) {
    return (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 8,
          border: `1px dashed ${TEXT.muted}`,
          color: TEXT.muted,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>&quot;{block.target}&quot; not found</span>
        <button
          onClick={() => onNavigate && onNavigate(block.target, true)}
          style={{
            background: "none",
            border: `1px solid ${TEXT.muted}`,
            borderRadius: 4,
            color: TEXT.muted,
            fontSize: 11,
            padding: "2px 8px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Create note
        </button>
      </div>
    );
  }

  let blocks = targetNote.content?.blocks || [];
  if (block.heading) {
    const idx = blocks.findIndex(
      (b) =>
        ["h1", "h2", "h3"].includes(b.type) &&
        (b.text || "").replace(/\*\*/g, "").replace(/\*/g, "").trim().toLowerCase() ===
          block.heading.toLowerCase(),
    );
    if (idx >= 0) {
      const level = { h1: 1, h2: 2, h3: 3 }[blocks[idx].type];
      let end = blocks.length;
      for (let i = idx + 1; i < blocks.length; i++) {
        const bl = { h1: 1, h2: 2, h3: 3 }[blocks[i].type];
        if (bl && bl <= level) {
          end = i;
          break;
        }
      }
      blocks = blocks.slice(idx, end);
    }
  }

  return (
    <div
      style={{
        borderLeft: `3px solid ${accentColor}`,
        background: `${accentColor}08`,
        borderRadius: 6,
        padding: "12px 16px",
        cursor: "pointer",
      }}
      onClick={() => onNavigate && onNavigate(targetNote.id)}
    >
      <div style={{ fontSize: 12, color: TEXT.secondary, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
        <span>
          {targetNote.title}
          {block.heading ? ` > ${block.heading}` : ""}
        </span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>open &rarr;</span>
      </div>
      <div style={{ fontSize: 13, color: TEXT.primary, pointerEvents: "none" }}>
        {blocks.slice(0, 10).map((b) => {
          if (b.type === "embed") {
            return (
              <div key={b.id} style={{ paddingLeft: 8, borderLeft: `2px solid ${accentColor}40`, margin: "4px 0" }}>
                <EmbedBlock
                  block={b}
                  noteData={noteData}
                  accentColor={accentColor}
                  depth={depth + 1}
                />
              </div>
            );
          }
          return (
            <div
              key={b.id}
              dangerouslySetInnerHTML={{
                __html: inlineMarkdownToHtml(b.text || "", new Set()),
              }}
              style={{ margin: "2px 0" }}
            />
          );
        })}
      </div>
    </div>
  );
}

const EditableBlock = memo(
  function EditableBlock({
    block,
    blockIndex,
    noteId,
    onCheckToggle,
    onDeleteBlock,
    registerRef,
    syncGen,
    accentColor,
    fontSize,
    numberedIndex,
    onUpdateCode,
    onUpdateLang,
    onUpdateCallout,
    onUpdateTableRows,
    noteTitleSet,
    onBlockNav,
    isImageSelected,
    onImageSelect,
    onImageLightbox,
    onImageReplace,
    onImageCopyImage,
    onUpdateBlockProperty,
    onFileOpen,
    onFileShowInFolder,
    noteDataRef,
    onNavigateToNote,
  }) {
    const { theme } = useTheme();
    const { BG, TEXT, ACCENT } = theme;
    const elRef = useRef(null);

    // Set text on mount and force-resync on undo/redo (syncGen changes)
    useLayoutEffect(() => {
      if (elRef.current && block.text !== undefined) {
        if (block.text === "") {
          elRef.current.innerHTML = "<br>";
        } else {
          elRef.current.innerHTML = inlineMarkdownToHtml(block.text, noteTitleSet);
        }
      }
    }, [syncGen, noteTitleSet]); // eslint-disable-line -- only mount + undo/redo, NOT on every keystroke

    useLayoutEffect(() => {
      if (elRef.current) registerRef(block.id, elRef.current);
      return () => registerRef(block.id, null);
    }, [block.id]);

    if (block.type === "spacer") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ padding: "8px 0", userSelect: "none" }}
        >
          <hr style={{ border: "none", borderTop: `1px solid ${BG.divider}`, margin: 0 }} />
        </div>
      );
    }

    if (block.type === "image") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ padding: "8px 0", userSelect: "none" }}
        >
          <ImageBlock
            src={block.src}
            alt={block.alt}
            width={block.width || 100}
            isSelected={isImageSelected}
            accentColor={accentColor}
            onSelect={() => onImageSelect(block.id)}
            onLightbox={() => onImageLightbox(block.src, block.alt)}
            onDelete={() => onDeleteBlock(noteId, blockIndex)}
            onReplace={() => onImageReplace(noteId, blockIndex)}
            onCopyImage={() => onImageCopyImage(block.src)}
            onUpdateWidth={(w) => onUpdateBlockProperty(noteId, blockIndex, { width: w })}
          />
        </div>
      );
    }

    if (block.type === "file") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ padding: "8px 0", userSelect: "none" }}
        >
          <FileBlock
            src={block.src}
            filename={block.filename || block.src}
            size={block.size}
            accentColor={accentColor}
            onDelete={() => onDeleteBlock(noteId, blockIndex)}
            onOpen={() => onFileOpen(block.src)}
            onShowInFolder={() => onFileShowInFolder(block.src)}
          />
        </div>
      );
    }

    if (block.type === "code") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <CodeBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            onUpdateCode={onUpdateCode}
            onUpdateLang={onUpdateLang}
            onBlockNav={onBlockNav}
            onDelete={(idx) => onDeleteBlock(noteId, idx)}
          />
        </div>
      );
    }

    if (block.type === "frontmatter") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <FrontmatterBlock block={block} />
        </div>
      );
    }

    if (block.type === "callout") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <CalloutBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            onUpdateCallout={onUpdateCallout}
            onBlockNav={onBlockNav}
            onDelete={(idx) => onDeleteBlock(noteId, idx)}
          />
        </div>
      );
    }

    if (block.type === "table") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <TableBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            onUpdateTableRows={onUpdateTableRows}
            noteTitleSet={noteTitleSet}
            accentColor={accentColor}
          />
        </div>
      );
    }

    if (block.type === "embed") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ padding: "4px 0", userSelect: "none" }}
        >
          <EmbedBlock
            block={block}
            noteData={noteDataRef?.current}
            accentColor={accentColor}
            onNavigate={(target, create) => {
              if (create && onNavigateToNote) {
                // create=true means we should create the note
                onNavigateToNote(target, true);
              } else if (onNavigateToNote) {
                onNavigateToNote(target);
              }
            }}
          />
        </div>
      );
    }

    if (block.type === "blockquote") {
      return (
        <div
          data-block-id={block.id}
          suppressContentEditableWarning
          style={{
            borderLeft: `3px solid ${accentColor}`,
            paddingLeft: 14,
            margin: "0 0 6px",
            lineHeight: 1.7,
          }}
        >
          <span
            ref={elRef}
            style={{
              color: TEXT.secondary,
              fontStyle: "italic",
              outline: "none",
              display: "block",
              fontSize,
            }}
          />
        </div>
      );
    }

    if (block.type === "p") {
      return (
        <p
          ref={elRef}
          data-block-id={block.id}
          data-placeholder="Type / for commands..."
          className={blockIndex === 0 && block.text === "" ? "empty-block" : undefined}
          style={{
            margin: "0 0 6px",
            lineHeight: 1.7,
            color: TEXT.primary,
            fontSize,
            outline: "none",
          }}
        />
      );
    }

    if (block.type === "h1") {
      return (
        <h1
          ref={elRef}
          data-block-id={block.id}
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: TEXT.primary,
            margin: "8px 0 12px",
            lineHeight: 1.3,
            letterSpacing: "-0.4px",
            outline: "none",
          }}
        />
      );
    }

    if (block.type === "h2") {
      return (
        <h2
          ref={elRef}
          data-block-id={block.id}
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: TEXT.primary,
            margin: "6px 0 10px",
            lineHeight: 1.35,
            letterSpacing: "-0.2px",
            outline: "none",
          }}
        />
      );
    }

    if (block.type === "h3") {
      return (
        <h3
          ref={elRef}
          data-block-id={block.id}
          style={{
            fontSize: 16.5,
            fontWeight: 600,
            color: TEXT.primary,
            margin: "6px 0 6px",
            lineHeight: 1.35,
            outline: "none",
          }}
        />
      );
    }

    if (block.type === "bullet") {
      return (
        <div
          data-block-id={block.id}
          suppressContentEditableWarning
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "2px 0",
            fontSize,
            lineHeight: 1.7,
          }}
        >
          <span
            contentEditable="false"
            suppressContentEditableWarning
            style={{
              color: accentColor,
              marginTop: 6.5,
              flexShrink: 0,
              fontSize: 7,
              userSelect: "none",
            }}
          >
            {"\u25CF"}
          </span>
          <span ref={elRef} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
        </div>
      );
    }

    if (block.type === "numbered") {
      return (
        <div
          data-block-id={block.id}
          suppressContentEditableWarning
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "2px 0",
            fontSize,
            lineHeight: 1.7,
          }}
        >
          <span
            contentEditable="false"
            suppressContentEditableWarning
            style={{
              color: TEXT.secondary,
              flexShrink: 0,
              fontSize,
              userSelect: "none",
              minWidth: 18,
              textAlign: "right",
            }}
          >
            {numberedIndex}.
          </span>
          <span ref={elRef} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
        </div>
      );
    }

    if (block.type === "checkbox") {
      return (
        <div
          data-block-id={block.id}
          suppressContentEditableWarning
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "2.5px 0",
            fontSize,
            lineHeight: 1.6,
          }}
        >
          <div
            className="checkbox-box"
            contentEditable="false"
            suppressContentEditableWarning
            onClick={(e) => {
              e.stopPropagation();
              onCheckToggle(noteId, blockIndex);
            }}
            style={{
              width: 16,
              height: 16,
              borderRadius: 3.5,
              flexShrink: 0,
              cursor: "pointer",
              border: block.checked ? `1.5px solid ${accentColor}` : `1.5px solid ${TEXT.muted}`,
              background: block.checked ? accentColor : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
              userSelect: "none",
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              style={{
                opacity: block.checked ? 1 : 0,
                transform: block.checked ? "scale(1)" : "scale(0.5)",
                transition: "opacity 0.15s, transform 0.15s",
              }}
            >
              <path
                d="M2 5L4.2 7.2L8 3"
                stroke={BG.darkest}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            ref={elRef}
            style={{
              color: block.checked ? TEXT.muted : TEXT.primary,
              textDecoration: block.checked ? "line-through" : "none",
              outline: "none",
              flex: 1,
              transition: "color 0.15s",
            }}
          />
        </div>
      );
    }

    return null;
  },
  (prev, next) => {
    return (
      prev.block.id === next.block.id &&
      prev.block.type === next.block.type &&
      prev.block.checked === next.block.checked &&
      prev.block.src === next.block.src &&
      prev.block.alt === next.block.alt &&
      prev.block.width === next.block.width &&
      prev.block.size === next.block.size &&
      prev.block.lang === next.block.lang &&
      prev.block.calloutType === next.block.calloutType &&
      prev.block.calloutTypeRaw === next.block.calloutTypeRaw &&
      prev.block.title === next.block.title &&
      prev.blockIndex === next.blockIndex &&
      prev.syncGen === next.syncGen &&
      prev.accentColor === next.accentColor &&
      prev.fontSize === next.fontSize &&
      prev.numberedIndex === next.numberedIndex &&
      prev.isImageSelected === next.isImageSelected &&
      (prev.block.text === "") === (next.block.text === "") &&
      (prev.block.text === next.block.text ||
        (prev.block.type !== "code" && prev.block.type !== "callout")) &&
      prev.block.rows === next.block.rows &&
      prev.block.target === next.block.target &&
      prev.block.heading === next.block.heading &&
      prev.block.alignments === next.block.alignments &&
      prev.noteTitleSet === next.noteTitleSet
    );
  },
);

export default EditableBlock;
