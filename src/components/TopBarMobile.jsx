import { useTheme } from "../hooks/useTheme";
import { useLayout } from "../context/LayoutContext";
import { useSettings } from "../context/SettingsContext";
import { Z } from "../constants/zIndex";
import { ChevronLeftIcon, MoreHorizontalIcon } from "./Icons";
import { platform } from "../utils/platform";
import boojyN from "/assets/boojy-notes-text-N.png";
import boojyTes from "/assets/boojy-notes.text-tes.png";

export default function TopBarMobile({
  syncState,
  noteTitle,
  activeNote,
  setActiveNote,
  createNote,
  onMorePress,
  onTitlePress,
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
        boxShadow:
          isEditing && (topBarEdge === "A" || topBarEdge === "B")
            ? "0 2px 8px rgba(0,0,0,0.3)"
            : "none",
        borderBottom:
          isEditing && (topBarEdge === "A" || topBarEdge === "C")
            ? `1px solid ${BG.divider}25`
            : "none",
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

          <button
            type="button"
            onClick={onTitlePress}
            aria-label="Edit note title"
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
              padding: "6px 4px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {noteTitle || "Untitled"}
          </button>

          <button onClick={onMorePress} style={btnStyle} aria-label="More options">
            <MoreHorizontalIcon size={20} />
          </button>
        </>
      ) : (
        /* ── Notes list mode: N●tes logo + ⚙ gear ── */
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
              padding: "4px 16px",
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
            title={`Settings · Sync: ${syncState}`}
          >
            <img src={boojyN} alt="" style={{ height: 30 }} draggable="false" />
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background:
                  syncState === "conflict"
                    ? theme.SEMANTIC.warning
                    : syncState === "offline"
                      ? TEXT.muted
                      : syncState === "error"
                        ? theme.SEMANTIC.error
                        : accentColor,
                flexShrink: 0,
              }}
            />
            <img src={boojyTes} alt="" style={{ height: 30 }} draggable="false" />
            {(syncState === "syncing" || syncState === "retrying") && (
              <span
                style={{
                  fontSize: 10,
                  color: theme.BRAND.orange,
                  marginLeft: 2,
                  opacity: 0.8,
                  whiteSpace: "nowrap",
                }}
              >
                Syncing&hellip;
              </span>
            )}
          </button>

          <div style={{ flex: 1 }} />

          <button
            onClick={() => {
              setSettingsOpen(true);
              setSettingsTab("profile");
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 16px",
              display: "flex",
              alignItems: "center",
              color: TEXT.muted,
              flexShrink: 0,
            }}
            aria-label="Settings"
          >
            <span style={{ fontSize: 22, fontWeight: 700 }}>
              {platform === "android" ? "\u22EE" : "\u22EF"}
            </span>
          </button>
        </>
      )}
    </div>
  );
}
