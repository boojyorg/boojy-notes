/**
 * The heading a link's `#subpath` names, found as Obsidian finds it
 * (`resolveSubpath` in Obsidian 1.15), so a link reaches the same heading in
 * both apps. A heading's Markdown and each segment of the subpath are compared
 * with Obsidian's punctuation turned into spaces, whitespace folded, case
 * ignored: `## **Tables**` and `## Tables?` answer `#tables`, `## _Tables_`
 * does not (Obsidian leaves `_` and `-`). `#A#B` walks the headings in order,
 * each segment deeper than the last; otherwise the first match wins.
 */

/** Obsidian's set: a link's own syntax and Markdown punctuation, never `_` or `-`. */
const PUNCTUATION_RE = /[!"#$%&()*+,.:;<=>?@^`{|}~/[\]\\\r\n]/g;

export function normaliseHeading(text: string): string {
  return text.replace(PUNCTUATION_RE, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** A block's heading level, 1–6, or 0 for any other block. */
export function headingLevel(block: { type?: string } | undefined): number {
  const m = /^h([1-6])$/.exec(block?.type ?? "");
  return m ? Number(m[1]) : 0;
}

/** The heading segments a subpath names, or null for none (empty, or a `^block`). */
export function headingSegments(subpath: string | null): string[] | null {
  if (!subpath) return null;
  const segments = subpath.split("#").filter((s) => s.trim());
  if (segments.length === 0 || segments[0].trim().startsWith("^")) return null;
  return segments;
}

export interface HeadingSection {
  /** The heading block's index. */
  start: number;
  /** The index after the section's last block: the next heading of its level or higher, or the end. */
  end: number;
}

/** The section `segments` name in `blocks`, or null when no heading answers. */
export function findHeadingSection(
  blocks: ReadonlyArray<{ type?: string; text?: string }>,
  segments: string[],
): HeadingSection | null {
  const wanted = segments.map(normaliseHeading);
  let matched = 0;
  let level = 0;
  let start = -1;
  for (let i = 0; i < blocks.length; i++) {
    const l = headingLevel(blocks[i]);
    if (!l) continue;
    if (start >= 0) {
      if (l <= level) return { start, end: i };
      continue;
    }
    if (l > level && normaliseHeading(blocks[i].text ?? "") === wanted[matched]) {
      matched++;
      level = l;
      if (matched === wanted.length) start = i;
    }
  }
  return start >= 0 ? { start, end: blocks.length } : null;
}
