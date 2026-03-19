interface ToastProps {
  message: string;
  type?: "error" | "warning" | "info";
  onDismiss: () => void;
}

const TYPE_COLORS: Record<string, { bg: string; border: string }> = {
  error: { bg: "rgba(220, 60, 60, 0.92)", border: "#dc3c3c" },
  warning: { bg: "rgba(200, 150, 30, 0.92)", border: "#c89620" },
  info: { bg: "rgba(74, 108, 247, 0.92)", border: "#4a6cf7" },
};

export default function Toast({ message, type = "error", onDismiss }: ToastProps) {
  const colors = TYPE_COLORS[type] || TYPE_COLORS.error;
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
