import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { extractAllTags } from "../utils/tags";

/**
 * Tag autocomplete under the `#…` being typed.
 *
 * The menu pops up under a word, unasked, so it owns a key only while it is
 * offering something (review 2026-09-07, §1.2). It never takes focus; the
 * block keeps it. It listens only while it has rows, so an empty match (a new
 * tag) leaves every key to the editor. Enter accepts the highlighted tag only
 * when that is a completion: the user has moved the highlight, or the
 * highlighted tag differs from what is typed. A tag typed in full is
 * complete already, and Enter after it is the editor's Enter. Space is never
 * touched: it ends the tag in the text, and the input handler closes the menu
 * because the caret is no longer inside a `#…` token. Before this the menu
 * prevented the space (`#alpha` + ` beta` became `#alphabeta`) and took Enter
 * even with nothing on screen.
 */
export default function TagMenu({ position, filter, noteData, onSelect, onDismiss }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  const [selectedIndex, setSelectedIndex] = useState(0);
  // Whether the user has moved the highlight with the arrows since typing.
  const [chosen, setChosen] = useState(false);
  const menuRef = useRef(null);

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
    setChosen(false);
  }, [filter]);

  const shown = !!position && filtered.length > 0;

  useEffect(() => {
    if (!shown) return;
    const handler = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setChosen(true);
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setChosen(true);
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const pick = filtered[selectedIndex]?.tag;
        if (!pick || (!chosen && pick.toLowerCase() === filter.toLowerCase())) return;
        e.preventDefault();
        onSelect(pick);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [shown, filtered, selectedIndex, chosen, filter, onSelect, onDismiss]);

  if (!shown) return null;

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
