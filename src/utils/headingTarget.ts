/**
 * The heading a link's `#subpath` names, found as Obsidian finds it
 * (`resolveSubpath` in Obsidian 1.15), so a link reaches the same heading in
 * both apps. A heading's Markdown and each segment of the subpath are compared
 * with Obsidian's punctuation turned into spaces, whitespace folded, case
 * ignored: `## **Tables**` and `## Tables?` answer `#tables`, `## _Tables_`
 * does not (Obsidian leaves `_` and `-`). The first match wins. `#A#B` names a
 * B inside A's section: where Obsidian keeps walking past the end of A (and
 * lands on a B under another heading), a heading that closes a matched
 * section here takes the match back, so a broken path is said, never guessed.
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
  // The levels of the segments matched so far: each one's section still open.
  const open: number[] = [];
  let start = -1;
  for (let i = 0; i < blocks.length; i++) {
    const l = headingLevel(blocks[i]);
    if (!l) continue;
    if (start >= 0) {
      if (l <= open[open.length - 1]) return { start, end: i };
      continue;
    }
    // A heading at a matched one's level or above ends that one's section.
    while (open.length && open[open.length - 1] >= l) open.pop();
    if (normaliseHeading(blocks[i].text ?? "") === wanted[open.length]) {
      open.push(l);
      if (open.length === wanted.length) start = i;
    }
  }
  return start >= 0 ? { start, end: blocks.length } : null;
}
