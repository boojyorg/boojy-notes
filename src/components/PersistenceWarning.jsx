import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

export default function PersistenceWarning({ noteCount, accentColor, onSignIn, onDismiss }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        background: theme.BG.elevated,
        color: theme.TEXT.primary,
        padding: "14px 20px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        zIndex: Z.TOAST,
        boxShadow: theme.modalShadow,
        maxWidth: 380,
        animation: "fadeIn 0.25s ease",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        border: `1px solid ${theme.BG.divider}`,
      }}
    >
      <div style={{ flex: 1 }}>
        You have {noteCount} notes stored only in this browser. Sign in to back them up.
        <br />
        <button
          onClick={onSignIn}
          style={{
            background: "none",
            border: "none",
            color: accentColor,
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
            fontSize: 13,
            fontWeight: 600,
            marginTop: 6,
          }}
        >
          Sign in
        </button>
      </div>
      <button
        onClick={onDismiss}
        style={{
          background: "none",
          border: "none",
          color: theme.TEXT.muted,
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        {"\u2715"}
      </button>
    </div>
  );
}
