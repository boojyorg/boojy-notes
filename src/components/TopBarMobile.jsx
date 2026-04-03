import { useTheme } from "../hooks/useTheme";
import { useLayout } from "../context/LayoutContext";
import { useSettings } from "../context/SettingsContext";
import { Z } from "../constants/zIndex";
import { ChevronLeftIcon, MoreHorizontalIcon } from "./Icons";
import boojyN from "/assets/boojy-notes-text-N.png";
import boojyTes from "/assets/boojy-notes.text-tes.png";

export default function TopBarMobile({
  syncState,
  noteTitle,
  activeNote,
  setActiveNote,
  createNote,
  onMorePress,
}) {
  const { chromeBg, accentColor, topBarEdge } = useLayout();
  const { setSettingsOpen, setSettingsTab } = useSettings();
  const { theme } = useTheme();
  const { BG, TEXT } = theme;

  const isEditing = !!activeNote;

  const btnStyle = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 12,
    borderRadius: 5,
    display: "flex",
    alignItems: "center",
    color: TEXT.secondary,
    flexShrink: 0,
  };

  return (
    <div
      style={{
        minHeight: 48,
        background: chromeBg,
        boxShadow: topBarEdge === "A" || topBarEdge === "B" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
        borderBottom:
          topBarEdge === "A" || topBarEdge === "C" ? `1px solid ${BG.divider}25` : "none",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        zIndex: Z.TOPBAR_INNER,
        position: "relative",
        padding: "env(safe-area-inset-top, 0px) 4px 0 4px",
        gap: 0,
      }}
    >
      {isEditing ? (
        /* ── Editor mode: ← back | title | (⋯) ── */
        <>
          <button onClick={() => setActiveNote(null)} style={btnStyle} aria-label="Back to notes">
            <ChevronLeftIcon size={20} />
          </button>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              fontSize: 15,
              fontWeight: 600,
              color: TEXT.primary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "0 4px",
            }}
          >
            {noteTitle || "Untitled"}
          </div>

          <button onClick={onMorePress} style={btnStyle} aria-label="More options">
            <MoreHorizontalIcon size={20} />
          </button>
        </>
      ) : (
        /* ── Notes list mode: N●tes logo (tap → settings) ── */
        <>
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
              padding: "4px 12px",
              display: "flex",
              alignItems: "center",
              gap: 3,
              flexShrink: 0,
            }}
            title={`Settings · Sync: ${syncState}`}
          >
            <img src={boojyN} alt="" style={{ height: 22 }} draggable="false" />
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
            <img src={boojyTes} alt="" style={{ height: 20 }} draggable="false" />
          </button>

          {/* Spacer to push logo left */}
          <div style={{ flex: 1 }} />
        </>
      )}
    </div>
  );
}
