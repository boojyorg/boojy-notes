import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { extractAllTags, tagKey, tagRows } from "../utils/tags";
import { foldText } from "../utils/search";

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
 *
 * It offers only tags that *start with* what is typed, and never the typed
 * tag itself (2026-09-20: the tag being made is already in the index the
 * moment its first letter commits, so `#ha` offered `#ha`, and a substring
 * match offered `#hashtag` for `#a`). So typing a new name shows nothing once
 * the letters diverge from every existing tag. Rows are the app's menu
 * grammar; the note count is not shown.
 */
export default function TagMenu({ position, filter, noteData, onSelect, onDismiss }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;

  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef(null);

  const allTags = useMemo(() => {
    if (!noteData) return [];
    return tagRows(extractAllTags(noteData));
  }, [noteData]);

  const filtered = useMemo(() => {
    if (!filter) return allTags;
    const typed = foldText(filter).text;
    const own = tagKey(filter);
    return allTags.filter((t) => tagKey(t.tag) !== own && foldText(t.tag).text.startsWith(typed));
  }, [allTags, filter]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  const shown = !!position && filtered.length > 0;

  useEffect(() => {
    if (!shown) return;
    const handler = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const pick = filtered[selectedIndex]?.tag;
        if (!pick) return;
        e.preventDefault();
        onSelect(pick);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [shown, filtered, selectedIndex, onSelect, onDismiss]);

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
        padding: 4,
        boxShadow: theme.modalShadow,
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
            padding: "7px 10px",
            borderRadius: 6,
            fontSize: 12.5,
            cursor: "pointer",
            color: TEXT.primary,
            background: i === selectedIndex ? BG.hover : "transparent",
            transition: "background 0.12s",
          }}
        >
          #{t.tag}
        </div>
      ))}
    </div>
  );
}
