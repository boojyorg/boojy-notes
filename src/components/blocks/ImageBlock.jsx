import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Z } from "../../constants/zIndex";
import { resolveAttachmentUrl } from "../../utils/attachmentUrl";
import { cssZoom } from "../../utils/domHelpers";

function ImageBlock({
  src,
  alt,
  displayWidth,
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
  // A new picture is a new load, so a Replace after an error is not left
  // drawing "Image not found" (state adjusted in render, React's own pattern).
  const [loadSrc, setLoadSrc] = useState(src);
  if (src !== loadSrc) {
    setLoadSrc(src);
    setErrored(false);
    setLoading(true);
  }
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const justDragged = useRef(false);

  const resolvedSrc = src ? resolveAttachmentUrl(src) : "";

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
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    onSelect();
    onLightbox();
  };

  // A resize is the picture's width in CSS pixels, what the file's `|px`
  // means: it starts from the width drawn (the picture's own size included),
  // stops at the column less the frame, and the pointer's travel is divided by
  // the UI scale, which Chromium has already multiplied into it.
  const handleResizeStart = (e, corner) => {
    e.preventDefault();
    e.stopPropagation();
    const box = containerRef.current;
    const img = imgRef.current;
    const column = box?.parentElement;
    if (!box || !img || !column) return;
    const zoom = cssZoom(box);
    const columnWidth = column.offsetWidth - (box.offsetWidth - img.offsetWidth);
    const startX = e.clientX;
    const startWidth = img.offsetWidth;

    const onMove = (me) => {
      const travel =
        (corner === "nw" || corner === "sw" ? startX - me.clientX : me.clientX - startX) / zoom;
      const px = Math.round(
        Math.max(columnWidth * 0.1, Math.min(columnWidth, startWidth + travel)),
      );
      dragRef.current = px;
      img.style.width = `${px}px`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (dragRef.current != null) {
        onUpdateWidth(dragRef.current);
        dragRef.current = null;
        justDragged.current = true;
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
    zIndex: Z.ELEMENT_OVERLAY,
    ...(pos === "nw" ? { top: -5, left: -5 } : {}),
    ...(pos === "ne" ? { top: -5, right: -5 } : {}),
    ...(pos === "sw" ? { bottom: -5, left: -5 } : {}),
    ...(pos === "se" ? { bottom: -5, right: -5 } : {}),
  });

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        ref={containerRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          position: "relative",
          borderRadius: 6,
          // The frame fits the picture; the column caps both. Loading, the
          // placeholder holds the column until the picture's size is known.
          width: loading ? "100%" : "fit-content",
          maxWidth: "100%",
          border: isSelected
            ? `2px solid ${accentColor}`
            : hovered
              ? `2px solid ${accentColor}55`
              : "2px solid transparent",
          transition: "border-color 0.15s",
          cursor: "pointer",
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
          ref={imgRef}
          src={resolvedSrc}
          alt={alt || ""}
          draggable="false"
          loading={resolvedSrc?.startsWith("data:") ? undefined : "lazy"}
          onLoad={() => setLoading(false)}
          onError={() => {
            setErrored(true);
            setLoading(false);
          }}
          style={{
            display: "block",
            // A width in the file is the picture's, in CSS pixels; none is its
            // own size. Never wider than the column, never enlarged to fill it.
            width: displayWidth ? `${displayWidth}px` : "auto",
            maxWidth: "100%",
            borderRadius: 6,
            ...(loading ? { position: "absolute", opacity: 0, pointerEvents: "none" } : {}),
          }}
        />
        {hovered && !loading && (
          <>
            <div
              onMouseDown={handleCorner("ne")}
              onClick={(e) => e.stopPropagation()}
              style={cornerStyle("ne")}
            />
            <div
              onMouseDown={handleCorner("se")}
              onClick={(e) => e.stopPropagation()}
              style={cornerStyle("se")}
            />
          </>
        )}
      </div>
      {ctxMenu && (
        <div
          className="image-context-menu"
          role="menu"
          aria-label="Image options"
          style={{
            position: "fixed",
            top: ctxMenu.top,
            left: ctxMenu.left,
            background: BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: 8,
            padding: 4,
            minWidth: 180,
            zIndex: Z.CONTEXT_MENU,
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
                e.currentTarget.style.background = BG.surface;
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

export default ImageBlock;
