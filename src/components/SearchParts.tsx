import type { CSSProperties, ReactNode } from "react";

/**
 * Pieces shared by the desktop search palette and the mobile sidebar search:
 * the tag chip row and the two match highlighters. Highlights use the accent
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

/** Tag chips for a `#` search, under a heading; `children` lands inside the same padded block. */
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
              color: ACCENT.primary,
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

/** A title with its matched span in the accent. */
export function renderHighlightedTitle(
  title: string,
  matchStart: number,
  matchEnd: number,
  accentColor: string,
): ReactNode {
  if (matchStart < 0 || matchEnd <= matchStart) return title;
  return (
    <>
      {title.slice(0, matchStart)}
      <span style={{ color: accentColor, fontWeight: 600 }}>
        {title.slice(matchStart, matchEnd)}
      </span>
      {title.slice(matchEnd)}
    </>
  );
}

export interface Snippet {
  text: string;
  highlightStart: number;
  highlightEnd: number;
}

/** A body snippet with its matched span in the accent. */
export function renderSnippet(snippet: Snippet | null, accentColor: string): ReactNode {
  if (!snippet) return null;
  const { text, highlightStart, highlightEnd } = snippet;
  if (highlightStart < 0 || highlightEnd <= highlightStart || highlightStart >= text.length)
    return text;
  return (
    <>
      {text.slice(0, highlightStart)}
      <span style={{ color: accentColor, fontWeight: 600 }}>
        {text.slice(highlightStart, highlightEnd)}
      </span>
      {text.slice(highlightEnd)}
    </>
  );
}
