import { useState, useEffect, useContext } from "react";
import { useTheme } from "../../hooks/useTheme";
import { OutsideFolder, recheckAttachments, useAttachment } from "../../hooks/useAttachment";
import { getAPI } from "../../services/apiProvider";
import { isMac } from "../../utils/platform";
import { CopyIcon, FolderIcon, OpenLinkIcon, TrashIcon } from "../Icons";
import Menu, { pointAnchor } from "../Menu";
import MissingAttachment, { findable } from "./MissingAttachment";
import { fromTouch } from "../../utils/touch";

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

function FileBlock({
  src,
  filename,
  size,
  onDelete,
  onOpen,
  onOpenDefault,
  onShowInFolder,
  accentColor,
}) {
  const { theme: fileTheme } = useTheme();
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const [hovered, setHovered] = useState(false);
  const [fileSize, setFileSize] = useState(size);
  const [ctxMenu, setCtxMenu] = useState(null);
  // The file the card names, found from the note's folder; a file the vault
  // does not hold (moved, renamed, never synced) is shown as missing, never
  // as a card that opens nothing. Every action takes the file found, and
  // opening keeps the embed's `#page=`.
  const { rel, missing } = useAttachment(src);
  // Find it… copies into the open location: no use to a note from outside every location.
  const outside = useContext(OutsideFolder);
  const subpath = src?.includes("#") ? src.slice(src.indexOf("#")) : "";
  const file = rel ?? src;

  useEffect(() => {
    if (fileSize == null && rel && getAPI()?.getFileSize) {
      getAPI()
        .getFileSize(rel)
        .then((s) => {
          if (s != null) setFileSize(s);
        });
    }
  }, [rel, fileSize]);

  const handleClick = () => {
    if (onOpen) onOpen(`${file}${subpath}`);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu(pointAnchor(e));
  };
  // Each row closes the menu, then acts.
  const act = (fn) => () => {
    setCtxMenu(null);
    fn?.();
  };

  if (missing)
    return (
      <MissingAttachment
        src={src}
        onFind={
          findable(src) && !outside
            ? async () => {
                if (await window.electronAPI.findAttachment(src)) recheckAttachments();
              }
            : undefined
        }
        onRemove={onDelete}
      />
    );

  const displayName = formatFriendlyFilename(filename || src || "Unknown");
  const typePill = getFileTypePill(filename || src || "");

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={(e) => {
          if (fromTouch(e)) return;
          setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          borderRadius: 8,
          border: `1px solid ${BG.divider}`,
          background: hovered ? BG.surface : BG.elevated,
          cursor: "pointer",
          transition: "background var(--motion-fast)",
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
                color: fileTheme.ACCENT.text,
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
        <Menu
          label="File options"
          idPrefix="file-menu-item"
          className="file-context-menu"
          anchor={ctxMenu}
          minWidth={180}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: "Open file", icon: <OpenLinkIcon />, action: act(handleClick) },
            {
              label: "Open in Default App",
              icon: <OpenLinkIcon />,
              action: act(() => onOpenDefault?.(file)),
            },
            {
              label: isMac ? "Show in Finder" : "Show in folder",
              icon: <FolderIcon />,
              action: act(() => onShowInFolder?.(file)),
            },
            {
              label: "Copy file path",
              icon: <CopyIcon />,
              action: act(() => navigator.clipboard.writeText(src || "")),
            },
            {
              label: "Delete",
              icon: <TrashIcon />,
              action: act(onDelete),
              danger: true,
              rule: true,
            },
          ]}
        />
      )}
    </>
  );
}

export default FileBlock;
