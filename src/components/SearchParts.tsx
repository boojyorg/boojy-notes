import type { CSSProperties, ReactNode } from "react";
import type { Range, Snippet } from "../utils/search";

export type { Snippet };

/**
 * Pieces shared by the desktop search palette and the mobile sidebar search:
 * the tag chip row and the match highlighters. Highlights use the accent
 * as a marker (text colour), never as a surface.
 */

export const SEARCH_HEADING: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

interface TagChipsProps {
  title: string;
  tags: Array<{ tag: string; count: number }>;
  limit: number;
  onPick: (tag: string) => void;
  TEXT: Record<string, string>;
  ACCENT: Record<string, string>;
  children?: ReactNode;
}

/** Tag chips for a `#` search (mobile), under a heading; `children` lands inside the same padded block. */
export function TagChips({ title, tags, limit, onPick, TEXT, ACCENT, children }: TagChipsProps) {
  return (
    <div style={{ padding: "4px 14px 8px" }}>
      <div style={{ ...SEARCH_HEADING, color: TEXT.muted, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {tags.slice(0, limit).map((t) => (
          <button
            type="button"
            key={t.tag}
            onClick={() => onPick(t.tag)}
            style={{
              background: `${ACCENT.primary}15`,
              color: ACCENT.text,
              border: "none",
              borderRadius: 10,
              padding: "2px 8px",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${ACCENT.primary}30`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `${ACCENT.primary}15`;
            }}
          >
            <span>#{t.tag}</span>
            <span style={{ color: TEXT.muted, fontSize: 10 }}>{t.count}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/** `text` with each range in the accent; ranges are ordered and never overlap. */
export function renderRanges(text: string, ranges: Range[], accentColor: string): ReactNode {
  if (!ranges || ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (end <= start || start < at || start >= text.length) return;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <span key={i} style={{ color: accentColor, fontWeight: 600 }}>
        {text.slice(start, end)}
      </span>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** A title with its matched words in the accent. */
export function renderHighlightedTitle(
  title: string,
  ranges: Range[],
  accentColor: string,
): ReactNode {
  return renderRanges(title, ranges, accentColor);
}

/** A body snippet with its matched words in the accent. */
export function renderSnippet(snippet: Snippet | null, accentColor: string): ReactNode {
  if (!snippet) return null;
  return renderRanges(snippet.text, snippet.ranges, accentColor);
}
