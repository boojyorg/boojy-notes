import { useTheme } from "../hooks/useTheme";

export default function ConflictToast({ noteTitle, onClick }) {
  const { theme } = useTheme();
  return (
    <div
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: theme.SEMANTIC?.warning || "#f59e0b",
        color: "#000",
        padding: "12px 20px",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        zIndex: 9999,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        maxWidth: 360,
        animation: "fadeIn 0.2s ease",
      }}
    >
      Conflict detected on &ldquo;{noteTitle}&rdquo; — click to view copy
    </div>
  );
}
