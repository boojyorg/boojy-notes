import { useTheme } from "../hooks/useTheme";
import { useLayout } from "../context/LayoutContext";
import { useNoteDataActions } from "../context/NoteDataContext";
import { useSettings } from "../context/SettingsContext";
import { Z } from "../constants/zIndex";
import { UndoIcon, RedoIcon, HamburgerIcon, PlusIcon } from "./Icons";
import boojyN from "/assets/boojy-notes-text-N.png";
import boojyTes from "/assets/boojy-notes.text-tes.png";

export default function TopBarMobile({ syncState, noteTitle, createNote }) {
  const { chromeBg, accentColor, topBarEdge, collapsed, setCollapsed } = useLayout();
  const { canUndo, canRedo, undo, redo } = useNoteDataActions();
  const { setSettingsOpen, setSettingsTab } = useSettings();
  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;

  return (
    <div
      style={{
        height: 48,
        background: chromeBg,
        boxShadow: topBarEdge === "A" || topBarEdge === "B" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
        borderBottom:
          topBarEdge === "A" || topBarEdge === "C" ? `1px solid ${BG.divider}25` : "none",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        zIndex: Z.TOPBAR_INNER,
        position: "relative",
        padding: "0 8px",
        gap: 4,
      }}
    >
      {/* Hamburger */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 12,
          borderRadius: 5,
          display: "flex",
          alignItems: "center",
          color: TEXT.secondary,
          transition: "background 0.15s, color 0.15s",
          flexShrink: 0,
        }}
        title={collapsed ? "Show sidebar" : "Hide sidebar"}
      >
        <HamburgerIcon size={19} />
      </button>

      {/* Logo — tap opens settings */}
      <button
        data-testid="settings-button"
        onClick={() => {
          setSettingsOpen(true);
          setSettingsTab("profile");
        }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 2px",
          display: "flex",
          alignItems: "center",
          gap: 3,
          flexShrink: 0,
        }}
        title={`Settings \u00b7 Sync: ${syncState}`}
      >
        <img src={boojyN} alt="" style={{ height: 20 }} draggable="false" />
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            background:
              syncState === "conflict"
                ? "#f59e0b"
                : syncState === "offline"
                  ? "#9ca3af"
                  : syncState === "error"
                    ? "#ef4444"
                    : accentColor,
            flexShrink: 0,
          }}
        />
        <img src={boojyTes} alt="" style={{ height: 18 }} draggable="false" />
      </button>

      {/* Center — note title */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "center",
          fontSize: 13,
          fontWeight: 500,
          color: TEXT.primary,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          padding: "0 4px",
        }}
      >
        {noteTitle || ""}
      </div>

      {/* Right — undo, redo, new note */}
      <button
        onClick={undo}
        style={{
          background: "none",
          border: "none",
          cursor: canUndo ? "pointer" : "default",
          padding: 12,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          color: TEXT.secondary,
          opacity: canUndo ? 1 : 0.3,
          flexShrink: 0,
        }}
      >
        <UndoIcon size={19} />
      </button>
      <button
        onClick={redo}
        style={{
          background: "none",
          border: "none",
          cursor: canRedo ? "pointer" : "default",
          padding: 12,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          color: TEXT.secondary,
          opacity: canRedo ? 1 : 0.3,
          flexShrink: 0,
        }}
      >
        <RedoIcon size={19} />
      </button>
      <button
        onClick={() => createNote && createNote(null)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 12,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
          color: TEXT.secondary,
          flexShrink: 0,
        }}
        title="New note"
      >
        <PlusIcon size={19} />
      </button>
    </div>
  );
}
