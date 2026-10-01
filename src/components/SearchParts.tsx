import type { ReactNode } from "react";
import type { Range, Snippet } from "../utils/search";

export type { Snippet };

/**
 * The search palette's match highlighters. Highlights use the accent as a
 * marker (text colour), never as a surface.
 */

/** `text` with each range in the accent; ranges are ordered and never overlap. */
export function renderRanges(text: string, ranges: Range[], accentColor: string): ReactNode {
  if (!ranges || ranges.length === 0) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end]) => {
    if (end <= start || start < at || start >= text.length) return;
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <span key={start} style={{ color: accentColor, fontWeight: 600 }}>
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
