import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { blocksToMarkdown } from "../../utils/markdown";
import { isWeb } from "../../utils/platform";
import BottomSheet from "./BottomSheet";

function MenuItem({ icon, label, onClick, danger }) {
  const { theme } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 20px",
        height: 48,
        width: "100%",
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 14,
        color: danger ? theme.SEMANTIC.error : theme.TEXT.primary,
        textAlign: "left",
      }}
    >
      <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{icon}</span>
      {label}
    </button>
  );
}

function InfoRow({ label }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        padding: "0 20px",
        height: 40,
        display: "flex",
        alignItems: "center",
        fontSize: 13,
        color: theme.TEXT.muted,
      }}
    >
      {label}
    </div>
  );
}

function Separator() {
  const { theme } = useTheme();
  return <div style={{ height: 1, background: theme.BG.divider, margin: "4px 16px" }} />;
}

function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target);
}

export default function EditorMoreMenu({
  open,
  onClose,
  activeNote,
  noteTitle,
  noteData,
  wordCount,
  charCount,
  onDuplicate,
  onDelete,
  onMoveToFolder,
  folderList,
  showToast,
}) {
  const { theme } = useTheme();
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const getBlocks = () => noteData?.[activeNote]?.content?.blocks || [];

  const handleShareAs = async (format) => {
    const blocks = getBlocks();
    const title = noteTitle || "Untitled";

    if (format === "clipboard") {
      try {
        await navigator.clipboard.writeText(blocksToMarkdown(blocks));
        showToast?.("Copied to clipboard", "info");
      } catch (e) {
        console.error("[share] Clipboard failed:", e);
        showToast?.("Failed to copy", "error");
      }
      setShowSharePicker(false);
      onClose();
      return;
    }

    const text =
      format === "plain"
        ? blocks.map((b) => stripMarkdown(b.text || "")).join("\n")
        : blocksToMarkdown(blocks);

    const shareData = { title, text };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (e) {
        if (e?.name === "AbortError") {
          setShowSharePicker(false);
          onClose();
          return;
        }
        console.error("[share] Web share failed:", e);
        showToast?.("Share failed", "error");
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast?.("Copied to clipboard", "info");
      } catch (e) {
        console.error("[share] Clipboard fallback failed:", e);
      }
    }

    setShowSharePicker(false);
    onClose();
  };

  const handleDuplicate = () => {
    onDuplicate?.(activeNote);
    onClose();
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    onDelete?.(activeNote);
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleMoveToFolder = (folder) => {
    onMoveToFolder?.(activeNote, folder);
    setShowFolderPicker(false);
    onClose();
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setShowFolderPicker(false);
        setShowSharePicker(false);
        setShowDeleteConfirm(false);
        onClose();
      }}
    >
      {showDeleteConfirm ? (
        <div style={{ padding: "8px 20px 16px" }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: theme.TEXT.primary,
              marginBottom: 8,
            }}
          >
            Delete &ldquo;{noteTitle || "Untitled"}&rdquo;?
          </div>
          <div style={{ fontSize: 13, color: theme.TEXT.muted, marginBottom: 16 }}>
            {isWeb
              ? "This will be permanently deleted. This can't be undone."
              : "This note will be moved to Trash."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 8,
                border: `1px solid ${theme.BG.divider}`,
                background: "none",
                color: theme.TEXT.primary,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 8,
                border: "none",
                background: theme.SEMANTIC.error,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : showSharePicker ? (
        <div style={{ padding: "4px 0 12px" }}>
          <div
            style={{
              padding: "0 20px 8px",
              fontSize: 13,
              fontWeight: 600,
              color: theme.TEXT.muted,
            }}
          >
            SHARE AS
          </div>
          <MenuItem icon="📝" label="Plain Text" onClick={() => handleShareAs("plain")} />
          <MenuItem icon="📋" label="Markdown" onClick={() => handleShareAs("markdown")} />
          <MenuItem
            icon="📎"
            label="Copy to Clipboard"
            onClick={() => handleShareAs("clipboard")}
          />
        </div>
      ) : showFolderPicker ? (
        <div style={{ padding: "4px 0 12px", maxHeight: 300, overflowY: "auto" }}>
          <div
            style={{
              padding: "0 20px 8px",
              fontSize: 13,
              fontWeight: 600,
              color: theme.TEXT.muted,
            }}
          >
            MOVE TO FOLDER
          </div>
          <MenuItem icon="📄" label="Root (no folder)" onClick={() => handleMoveToFolder(null)} />
          {(folderList || []).map((f) => (
            <MenuItem key={f} icon="📁" label={f} onClick={() => handleMoveToFolder(f)} />
          ))}
        </div>
      ) : (
        <div style={{ padding: "4px 0 12px" }}>
          <MenuItem icon="📁" label="Move to Folder" onClick={() => setShowFolderPicker(true)} />
          <MenuItem icon="📤" label="Share" onClick={() => setShowSharePicker(true)} />
          <MenuItem icon="📋" label="Duplicate" onClick={handleDuplicate} />
          <Separator />
          <InfoRow label={`${wordCount} words · ${charCount} characters`} />
          <Separator />
          <MenuItem icon="🗑" label="Delete Note" onClick={handleDelete} danger />
        </div>
      )}
    </BottomSheet>
  );
}
