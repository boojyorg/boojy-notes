import { findCodeSpans } from "./codeSpans";
import { COMMENT_CLASS, findComments } from "./comments";

/**
 * Footnotes as Obsidian's editing view shows them: a reference (`[^label]`)
 * and an inline footnote (`^[text]`) stay as written, styled and literal, as a
 * `%%comment%%` is; a definition (`[^label]: text`) is its own block
 * (`markdown.js`). Nothing is numbered: numbers belong to a reading view.
 * One grammar, shared by the renderer, the Markdown view and the parser, so
 * none of them can disagree about what a footnote is.
 */

/** The class of a drawn reference: small, raised, muted, literal. */
export const FOOTNOTE_REF_CLASS = "md-fn-ref";
/** A sealed reference's source text, hidden once it shows its number (`data-n`). */
export const FOOTNOTE_SRC_CLASS = "md-fn-src";
/** The class of a drawn inline footnote: muted, literal. */
export const FOOTNOTE_INLINE_CLASS = "md-fn-inline";
/** Every literal run's element: a comment, a reference, an inline footnote. */
export const LITERAL_SELECTOR = `.${COMMENT_CLASS}, .${FOOTNOTE_REF_CLASS}, .${FOOTNOTE_INLINE_CLASS}`;

/**
 * A definition line: up to three spaces, then `[^label]:`. A label holds no
 * whitespace and is never empty (markdown-it-footnote and Obsidian agree).
 */
export const FOOTNOTE_DEF_RE = /^( {0,3})\[\^([^\]\s]+)\]:/;

/** ASCII punctuation: what a backslash escapes (the renderer's escape rule). */
const ESCAPABLE = /[!-/:-@[-`{-~]/;

type Span = { start: number; end: number };
export type FootnoteSpan = Span & { kind: "ref" | "inline" };

/** The end (past `]`) of a reference opening at `i` (`[^`), or -1. */
function refEnd(md: string, i: number): number {
  let j = i + 2;
  while (j < md.length && md[j] !== "]") {
    if (/\s/.test(md[j])) return -1;
    j++;
  }
  return j < md.length && j > i + 2 ? j + 1 : -1;
}

/**
 * The end (past its `]`) of an inline footnote opening at `i` (`^[`), or -1:
 * brackets inside balance, an escaped one is text, a code span is skipped
 * whole. One that would run into a `skip` range (a comment) is text.
 */
function inlineEnd(md: string, i: number, codes: Span[], skip: Span[]): number {
  let depth = 0;
  for (let j = i + 1; j < md.length; ) {
    if (skip.some((s) => s.start === j)) return -1;
    const code = codes.find((c) => c.start === j);
    if (code) {
      j = code.end;
      continue;
    }
    if (md[j] === "\\" && j + 1 < md.length && ESCAPABLE.test(md[j + 1])) {
      j += 2;
      continue;
    }
    if (md[j] === "[") depth++;
    else if (md[j] === "]" && --depth === 0) return j + 1;
    j++;
  }
  return -1;
}

/**
 * Every reference and inline footnote in a block's text, in order. A code
 * span wins, as do the `skip` ranges (comments): nothing in one is a
 * footnote, and one that would run into a comment is text, so no two drawn
 * runs ever overlap (the renderer would draw the shared text twice). A
 * backslash escapes the next punctuation mark.
 */
export function findFootnotes(md: string, skip: Span[] = []): FootnoteSpan[] {
  const found: FootnoteSpan[] = [];
  if (!md || (!md.includes("[^") && !md.includes("^["))) return found;
  const codes = findCodeSpans(md) as Span[];
  const clear = (start: number, end: number) => !skip.some((s) => s.start < end && s.end > start);
  for (let i = 0; i < md.length; ) {
    const over = codes.find((c) => c.start === i) ?? skip.find((s) => s.start === i);
    if (over) {
      i = over.end;
      continue;
    }
    if (md[i] === "\\" && i + 1 < md.length && ESCAPABLE.test(md[i + 1])) {
      i += 2;
      continue;
    }
    if (md[i] === "[" && md[i + 1] === "^") {
      const end = refEnd(md, i);
      if (end > 0 && clear(i, end)) {
        found.push({ start: i, end, kind: "ref" });
        i = end;
        continue;
      }
    }
    if (md[i] === "^" && md[i + 1] === "[") {
      const end = inlineEnd(md, i, codes, skip);
      if (end > 0 && clear(i, end)) {
        found.push({ start: i, end, kind: "inline" });
        i = end;
        continue;
      }
    }
    i++;
  }
  return found;
}

/**
 * Everything in a block's text drawn as written: comments, then the
 * footnotes outside them, in order, each with its element's class.
 */
export function literalRuns(md: string): (Span & { cls: string })[] {
  const comments = findComments(md);
  const runs = [
    ...comments.map((c) => ({ ...c, cls: COMMENT_CLASS })),
    ...findFootnotes(md, comments).map(({ start, end, kind }) => ({
      start,
      end,
      cls: kind === "ref" ? FOOTNOTE_REF_CLASS : FOOTNOTE_INLINE_CLASS,
    })),
  ];
  return runs.sort((a, b) => a.start - b.start);
}
