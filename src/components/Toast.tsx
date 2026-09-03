interface ToastTheme {
  SEMANTIC: { error: string; warning: string };
  ACCENT: { primary: string };
}

interface ToastProps {
  message: string;
  type?: "error" | "warning" | "info";
  onDismiss: () => void;
  theme: ToastTheme;
}

function toRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getColors(type: string, theme: ToastTheme): { bg: string; border: string } {
  if (type === "error")
    return { bg: toRgba(theme.SEMANTIC.error, 0.92), border: theme.SEMANTIC.error };
  if (type === "warning")
    return { bg: toRgba(theme.SEMANTIC.warning, 0.92), border: theme.SEMANTIC.warning };
  return { bg: toRgba(theme.ACCENT.primary, 0.92), border: theme.ACCENT.primary };
}

export default function Toast({ message, type = "error", onDismiss, theme }: ToastProps) {
  const colors = getColors(type, theme);
  return (
    <div
      role="alert"
      aria-live="assertive"
      onClick={onDismiss}
      style={{
        background: colors.bg,
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
        border: `1px solid ${colors.border}`,
        maxWidth: 360,
        lineHeight: 1.4,
        animation: "fadeIn 0.2s ease",
      }}
    >
      {message}
    </div>
  );
}
