import { useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const mod = isMac ? "\u2318" : "Ctrl";

const SECTIONS = [
  {
    title: "EDITING",
    items: [
      ["/", "Slash commands"],
      ["[[ ]]", "Link to note"],
      ["==text==", "Highlight"],
      ["**text**", "Bold"],
      ["*text*", "Italic"],
      ["`code`", "Inline code"],
      ["> text", "Blockquote"],
      ["---", "Divider"],
    ],
  },
  {
    title: "SHORTCUTS",
    items: [
      [`${mod} B`, "Bold"],
      [`${mod} I`, "Italic"],
      [`${mod} K`, "Link"],
      [`${mod} E`, "Inline code"],
      [`${mod} \u21e7 H`, "Highlight"],
      [`${mod} \u21e7 X`, "Strikethrough"],
      [`${mod} \\`, "Toggle panel"],
      [`${mod} N`, "New note"],
      [`${mod} F`, "Find in note"],
    ],
  },
  {
    title: "FEATURES",
    items: [
      ["> [!tip]", "Callout blocks"],
      ["```", "Code blocks"],
      [`${mod} \``, "Terminal"],
    ],
  },
];

export default function HelpDropdown({ open, onClose, toggleRef }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e) => {
      if (toggleRef?.current && toggleRef.current.contains(e.target)) return;
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: "absolute",
        top: "100%",
        right: 0,
        marginTop: 6,
        width: 260,
        maxHeight: "calc(100vh - 80px)",
        overflowY: "auto",
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 10,
        padding: "12px 0",
        fontSize: 12,
        zIndex: 200,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px 8px",
          borderBottom: `1px solid ${BG.divider}`,
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, color: TEXT.primary }}>
          Quick Reference
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: TEXT.secondary,
            padding: 2,
            display: "flex",
            alignItems: "center",
            borderRadius: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = TEXT.primary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = TEXT.secondary)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Sections */}
      {SECTIONS.map((section, si) => (
        <div key={section.title} style={{ marginBottom: si < SECTIONS.length - 1 ? 10 : 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: TEXT.muted,
              letterSpacing: 0.8,
              padding: "0 14px 4px",
            }}
          >
            {section.title}
          </div>
          {section.items.map(([key, desc]) => (
            <div
              key={key + desc}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "3px 14px",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontFamily: "SF Mono, Menlo, Consolas, monospace",
                  fontSize: 11,
                  color: TEXT.primary,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {key}
              </span>
              <span style={{ color: TEXT.secondary, textAlign: "right" }}>{desc}</span>
            </div>
          ))}
        </div>
      ))}

      {/* Tip */}
      <div
        style={{
          borderTop: `1px solid ${BG.divider}`,
          marginTop: 8,
          padding: "8px 14px 0",
          color: TEXT.muted,
          fontSize: 11,
          fontStyle: "italic",
        }}
      >
        Tip: Type / in the editor for commands
      </div>
    </div>
  );
}
