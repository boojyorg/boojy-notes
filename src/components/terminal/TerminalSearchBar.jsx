import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";

export default function TerminalSearchBar({ searchAddon, onClose }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const findNext = () => {
    if (searchAddon && query) searchAddon.findNext(query);
  };

  const findPrev = () => {
    if (searchAddon && query) searchAddon.findPrevious(query);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) findPrev();
      else findNext();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 4,
        right: 8,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 6,
        padding: "4px 6px",
        display: "flex",
        alignItems: "center",
        gap: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        zIndex: 10,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Find..."
        style={{
          background: BG.surface,
          border: "none",
          color: TEXT.primary,
          fontSize: 12,
          fontFamily: "inherit",
          padding: "4px 8px",
          borderRadius: 4,
          outline: "none",
          width: 160,
        }}
      />
      <button
        onClick={findPrev}
        title="Previous (Shift+Enter)"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: TEXT.secondary,
          padding: 4,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 7L5 3L8 7"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        onClick={findNext}
        title="Next (Enter)"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: TEXT.secondary,
          padding: 4,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 3L5 7L8 3"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        onClick={onClose}
        title="Close (Esc)"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: TEXT.secondary,
          padding: 4,
          borderRadius: 4,
          display: "flex",
          alignItems: "center",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
