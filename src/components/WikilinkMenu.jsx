import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Z } from "../constants/zIndex";

export default function WikilinkMenu({ position, filter, noteData, onSelect, onDismiss }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef(null);
  useFocusTrap(menuRef, !!position);

  const noteTitles = useMemo(() => {
    if (!noteData) return [];
    return Object.entries(noteData)
      .map(([id, n]) => ({ id, title: n.title || "Untitled" }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [noteData]);

  const filtered = useMemo(() => {
    if (!filter) return noteTitles;
    const lc = filter.toLowerCase();
    return noteTitles.filter((n) => n.title.toLowerCase().includes(lc));
  }, [noteTitles, filter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered.length > 0) {
          onSelect(filtered[selectedIndex]?.title || filter);
        } else {
          onSelect(filter); // create new
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filtered, selectedIndex, filter, onSelect, onDismiss]);

  if (!position) return null;

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Link suggestions"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 8,
        padding: "4px 0",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        zIndex: Z.WIKILINK_MENU,
        maxHeight: 200,
        overflowY: "auto",
        minWidth: 200,
        animation: "fadeIn 0.1s ease",
      }}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: "8px 12px", fontSize: 12, color: TEXT.muted }}>
          Create note: <strong style={{ color: ACCENT.primary }}>{filter}</strong>
        </div>
      ) : (
        filtered.slice(0, 10).map((n, i) => (
          <div
            key={n.id}
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(n.title);
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
              color: i === selectedIndex ? TEXT.primary : TEXT.secondary,
              background: i === selectedIndex ? `${ACCENT.primary}15` : "transparent",
              transition: "background 0.08s",
            }}
          >
            {n.title}
          </div>
        ))
      )}
    </div>
  );
}
