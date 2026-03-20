import { memo, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

function ToolbarBtn({ label, active, onClick, style = {}, ariaLabel }) {
  const { theme } = useTheme();
  const { ACCENT, TEXT } = theme;
  const [hovered, setHovered] = useState(false);
  return (
    <button
      aria-pressed={active}
      aria-label={ariaLabel}
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
        background: active ? `${ACCENT.primary}30` : hovered ? theme.overlay(0.08) : "transparent",
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
      role="toolbar"
      aria-label="Text formatting"
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
        zIndex: Z.TOOLBAR,
        animation: "fadeInToolbar 0.12s ease-out",
      }}
    >
      <ToolbarBtn
        label="B"
        ariaLabel="Bold"
        active={activeFormats.bold}
        onClick={() => onFormat("bold")}
        style={{ fontWeight: 700 }}
      />
      <ToolbarBtn
        label="I"
        ariaLabel="Italic"
        active={activeFormats.italic}
        onClick={() => onFormat("italic")}
        style={{ fontStyle: "italic" }}
      />
      <ToolbarBtn
        label={<span style={{ textDecoration: "line-through" }}>S</span>}
        ariaLabel="Strikethrough"
        active={activeFormats.strikethrough}
        onClick={() => onFormat("strikethrough")}
        style={{ fontWeight: 600 }}
      />
      <ToolbarBtn
        label="H"
        ariaLabel="Highlight"
        active={activeFormats.highlight}
        onClick={() => onFormat("highlight")}
        style={{
          fontWeight: 600,
          background: activeFormats.highlight ? theme.mark.bg : undefined,
        }}
      />
      <ToolbarBtn
        label="</>"
        ariaLabel="Inline code"
        active={activeFormats.code}
        onClick={() => onFormat("code")}
        style={{ fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 10 }}
      />
      <ToolbarBtn
        label="Link"
        ariaLabel="Link"
        active={activeFormats.link}
        onClick={() => onFormat("link")}
        style={{ fontSize: 11 }}
      />
    </div>
  );
});

export default FloatingToolbar;
