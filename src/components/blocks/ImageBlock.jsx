import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import { resolveAttachmentUrl, resolveAttachmentUrlSync } from "../../utils/attachmentUrl";

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

  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (!src) return "";
    const sync = resolveAttachmentUrlSync(src);
    return sync || "";
  });
  useEffect(() => {
    if (!src || src.startsWith("data:")) return;
    resolveAttachmentUrl(src).then(setResolvedSrc);
  }, [src]);

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

export default ImageBlock;
