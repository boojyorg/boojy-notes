import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

export default function FirstSyncModal({ noteCount, accentColor, isSyncing, onConfirm, onCancel }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: Z.FIRST_SYNC,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.15s ease",
      }}
      onClick={isSyncing ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.modalBg,
          borderRadius: 14,
          padding: "32px 36px",
          boxShadow: theme.modalShadow,
          maxWidth: 380,
          width: "90%",
          textAlign: "center",
        }}
      >
        <h3
          style={{
            margin: "0 0 12px",
            fontSize: 18,
            fontWeight: 600,
            color: theme.TEXT.primary,
          }}
        >
          Sync your notes
        </h3>
        <p
          style={{
            margin: "0 0 24px",
            fontSize: 14,
            color: theme.TEXT.secondary,
            lineHeight: 1.5,
          }}
        >
          {noteCount} note{noteCount !== 1 ? "s" : ""} will be uploaded to your account.
        </p>
        {isSyncing ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 28,
                height: 28,
                border: `3px solid ${theme.BG.divider}`,
                borderTopColor: accentColor,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <div style={{ fontSize: 13, color: theme.TEXT.secondary }}>
              Syncing your notes&hellip;
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={onCancel}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: `1px solid ${theme.BG.divider}`,
                background: "transparent",
                color: theme.TEXT.secondary,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Not Now
            </button>
            <button
              onClick={onConfirm}
              style={{
                padding: "8px 20px",
                borderRadius: 8,
                border: "none",
                background: accentColor,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Sync Now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
