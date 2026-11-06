import { findCodeSpans } from "./codeSpans";

/** The class of a drawn `%%…%%` comment: muted, literal. */
export const COMMENT_CLASS = "md-comment";

/** ASCII punctuation: what a backslash escapes (the renderer's escape rule). */
const ESCAPABLE = /[!-/:-@[-`{-~]/;

/**
 * Every `%%…%%` comment in a block's text, as `{ start, end }` (end past the
 * closing marker). A comment is Obsidian's: visible here, muted and literal
 * (inlineFormatting draws it as written). Markers pair left to right within
 * the block; an odd one is text. A code span wins: a marker inside one is
 * code, and a comment never closes inside one. A backslash escapes the next
 * punctuation mark, so `\%%` is no marker and `\\%%` (an escaped backslash) is.
 */
export function findComments(md: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  if (!md?.includes("%%")) return found;
  const codes = findCodeSpans(md) as { start: number; end: number }[];
  let code = 0;
  let open = -1;
  for (let i = 0; i < md.length; ) {
    while (code < codes.length && codes[code].end <= i) code++;
    if (code < codes.length && codes[code].start === i) {
      i = codes[code].end;
      continue;
    }
    if (md[i] === "\\" && i + 1 < md.length && ESCAPABLE.test(md[i + 1])) {
      i += 2;
      continue;
    }
    if (md[i] === "%" && md[i + 1] === "%") {
      if (open < 0) open = i;
      else {
        found.push({ start: open, end: i + 2 });
        open = -1;
      }
      i += 2;
      continue;
    }
    i++;
  }
  return found;
}
