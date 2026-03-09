import { useState, useRef, useEffect } from "react";
import { useTheme } from "../hooks/useTheme";

export default function LinkEditPopover({ position, initialUrl, onApply, onRemove, onDismiss }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  const [url, setUrl] = useState(initialUrl || "");
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus input after mount
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    const handleClick = (e) => {
      if (!e.target.closest(".link-edit-popover")) onDismiss();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onDismiss]);

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (trimmed) onApply(trimmed);
    else if (initialUrl) onRemove();
    else onDismiss();
  };

  if (!position) return null;

  return (
    <div
      className="link-edit-popover"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        zIndex: 200,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 8,
        padding: 10,
        display: "flex",
        gap: 6,
        alignItems: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        minWidth: 280,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
          e.stopPropagation();
        }}
        placeholder="https://..."
        style={{
          flex: 1,
          background: BG.darkest,
          border: `1px solid ${BG.divider}`,
          borderRadius: 4,
          padding: "5px 8px",
          fontSize: 12,
          color: TEXT.primary,
          outline: "none",
          fontFamily: "'SF Mono', 'Fira Code', monospace",
        }}
      />
      <button
        onClick={handleSubmit}
        style={{
          background: ACCENT.primary,
          color: BG.darkest,
          border: "none",
          borderRadius: 4,
          padding: "5px 10px",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Apply
      </button>
      {initialUrl && (
        <button
          onClick={onRemove}
          style={{
            background: "transparent",
            color: TEXT.muted,
            border: `1px solid ${BG.divider}`,
            borderRadius: 4,
            padding: "5px 8px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}
