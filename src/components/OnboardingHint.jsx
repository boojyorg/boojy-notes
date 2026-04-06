import { useTheme } from "../hooks/useTheme";

export default function OnboardingHint({ hint, onDismiss, accentColor }) {
  const { theme } = useTheme();

  if (!hint) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: accentColor || theme.ACCENT.primary,
        color: "#fff",
        padding: "8px 12px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        animation: "fadeIn 0.25s ease",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        maxWidth: 280,
        margin: "8px auto 4px",
      }}
    >
      <span style={{ flex: 1 }}>{hint.text}</span>
      <button
        onClick={() => onDismiss(hint.id)}
        style={{
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.7)",
          cursor: "pointer",
          fontSize: 16,
          padding: "0 2px",
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Dismiss hint"
      >
        &times;
      </button>
    </div>
  );
}
