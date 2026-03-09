import { memo, useState } from "react";
import { useTheme } from "../hooks/useTheme";

function ToolbarBtn({ label, active, onClick, style = {} }) {
  const { theme } = useTheme();
  const { ACCENT, TEXT } = theme;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 28,
        height: 28,
        borderRadius: 5,
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        background: active
          ? `${ACCENT.primary}30`
          : hovered
            ? theme.overlay(0.08)
            : "transparent",
        color: active ? ACCENT.primary : TEXT.primary,
        transition: "background 0.1s, color 0.1s",
        ...style,
      }}
    >
      {label}
    </button>
  );
}

const FloatingToolbar = memo(function FloatingToolbar({ position, activeFormats, onFormat }) {
  const { theme } = useTheme();
  const { BG } = theme;

  if (!position) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
        display: "flex",
        gap: 2,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 8,
        padding: "4px 4px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        zIndex: 100,
        animation: "fadeInToolbar 0.12s ease-out",
      }}
    >
      <ToolbarBtn
        label="B"
        active={activeFormats.bold}
        onClick={() => onFormat("bold")}
        style={{ fontWeight: 700 }}
      />
      <ToolbarBtn
        label="I"
        active={activeFormats.italic}
        onClick={() => onFormat("italic")}
        style={{ fontStyle: "italic" }}
      />
      <ToolbarBtn
        label={<span style={{ textDecoration: "line-through" }}>S</span>}
        active={activeFormats.strikethrough}
        onClick={() => onFormat("strikethrough")}
        style={{ fontWeight: 600 }}
      />
      <ToolbarBtn
        label="H"
        active={activeFormats.highlight}
        onClick={() => onFormat("highlight")}
        style={{
          fontWeight: 600,
          background: activeFormats.highlight ? "rgba(255,230,0,0.15)" : undefined,
        }}
      />
      <ToolbarBtn
        label="</>"
        active={activeFormats.code}
        onClick={() => onFormat("code")}
        style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 10 }}
      />
      <ToolbarBtn
        label="Link"
        active={activeFormats.link}
        onClick={() => onFormat("link")}
        style={{ fontSize: 11 }}
      />
    </div>
  );
});

export default FloatingToolbar;
