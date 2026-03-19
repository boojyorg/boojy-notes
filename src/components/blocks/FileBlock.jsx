import { useState, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import { getAPI } from "../../services/apiProvider";

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
    if (fileSize == null && src && getAPI()?.getFileSize) {
      getAPI()
        .getFileSize(src)
        .then((s) => {
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

export default FileBlock;
