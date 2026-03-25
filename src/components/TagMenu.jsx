import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Z } from "../constants/zIndex";
import { extractAllTags } from "../utils/tags";

export default function TagMenu({ position, filter, noteData, onSelect, onDismiss }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef(null);
  useFocusTrap(menuRef, !!position);

  const allTags = useMemo(() => {
    if (!noteData) return [];
    const tagMap = extractAllTags(noteData);
    return [...tagMap.entries()]
      .map(([tag, noteIds]) => ({ tag, count: noteIds.size }))
      .sort((a, b) => b.count - a.count);
  }, [noteData]);

  const filtered = useMemo(() => {
    if (!filter) return allTags;
    const lc = filter.toLowerCase();
    return allTags.filter((t) => t.tag.toLowerCase().includes(lc));
  }, [allTags, filter]);

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
          onSelect(filtered[selectedIndex]?.tag || filter);
        } else {
          onSelect(filter);
        }
      } else if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filtered, selectedIndex, filter, onSelect, onDismiss]);

  if (!position || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Tag suggestions"
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
        minWidth: 180,
        animation: "fadeIn 0.1s ease",
      }}
    >
      {filtered.slice(0, 10).map((t, i) => (
        <div
          key={t.tag}
          role="option"
          aria-selected={i === selectedIndex}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(t.tag);
          }}
          onMouseEnter={() => setSelectedIndex(i)}
          style={{
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
            color: i === selectedIndex ? TEXT.primary : TEXT.secondary,
            background: i === selectedIndex ? `${ACCENT.primary}15` : "transparent",
            transition: "background 0.08s",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>#{t.tag}</span>
          <span style={{ fontSize: 11, color: TEXT.muted }}>{t.count}</span>
        </div>
      ))}
    </div>
  );
}
