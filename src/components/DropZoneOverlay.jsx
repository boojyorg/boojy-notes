import { useTheme } from "../hooks/useTheme";

export default function DropZoneOverlay({ zone, visible }) {
  const { theme } = useTheme();

  if (!visible || !zone) return null;

  const { side, rect } = zone;
  if (!rect || side === "center") return null;

  const half = { width: rect.width / 2, height: rect.height / 2 };
  let styles;
  switch (side) {
    case "left":
      styles = { top: rect.top, left: rect.left, width: half.width, height: rect.height };
      break;
    case "right":
      styles = {
        top: rect.top,
        left: rect.left + half.width,
        width: half.width,
        height: rect.height,
      };
      break;
    case "top":
      styles = { top: rect.top, left: rect.left, width: rect.width, height: half.height };
      break;
    case "bottom":
      styles = {
        top: rect.top + half.height,
        left: rect.left,
        width: rect.width,
        height: half.height,
      };
      break;
    default:
      return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        ...styles,
        background: theme.splitDropZone || `${theme.ACCENT.primary}15`,
        border: `2px solid ${theme.ACCENT.primary}40`,
        borderRadius: 4,
        zIndex: 998,
        pointerEvents: "none",
        transition: "all 0.15s ease",
      }}
    />
  );
}
