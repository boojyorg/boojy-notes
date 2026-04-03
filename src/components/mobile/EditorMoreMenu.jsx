import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { isCapacitor } from "../../utils/platform";
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
        color: danger ? "#FF5722" : theme.TEXT.primary,
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
}) {
  const { theme } = useTheme();
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleShare = async () => {
    const note = noteData?.[activeNote];
    if (!note) return;

    const text = (note.content?.blocks || []).map((b) => b.text || "").join("\n");
    const shareData = { title: noteTitle || "Untitled", text };

    if (isCapacitor) {
      try {
        const { Share } = await import("@capacitor/share");
        await Share.share(shareData);
      } catch {
        // User cancelled or share failed
      }
    } else if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(text);
    }
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
            Delete "{noteTitle || "Untitled"}"?
          </div>
          <div style={{ fontSize: 13, color: theme.TEXT.muted, marginBottom: 16 }}>
            This note will be moved to Trash.
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
                background: "#FF5722",
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
          <MenuItem icon="📤" label="Share" onClick={handleShare} />
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
