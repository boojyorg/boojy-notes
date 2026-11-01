// Code spans, read as CommonMark reads them: one rule for the renderer, the
// tag finder and the plain-text reader (search, word count).

import { LINK_DEST } from "./linkDestination";

/**
 * A code span, as CommonMark reads one: a run of backticks opens it and only a
 * run of the same length closes it, so ``` `` `x` `` ``` holds a backtick.
 * Its text is literal: no formatting, link, tag or escape inside it is read
 * (`**b**` in backticks drew bold, and `[[Note]]` a live link). A backslash
 * before a backtick in prose escapes it and opens nothing; inside a span a
 * backslash is text. A link's destination and a bare URL are skipped whole,
 * as the maths pass skips them.
 */
const CODE_SCAN_RE = new RegExp(
  String.raw`\\[!-/:-@[-\`{-~]|\]\(${LINK_DEST}\)|https?:\/\/[^\s<]+|(\`+)`,
  "g",
);

/**
 * The text a code span shows, from what lies between its backtick runs: line
 * endings are spaces, and one space comes off each end when both ends have
 * one and the text is not all spaces (CommonMark 6.1).
 */
export function codeSpanText(inner) {
  const text = inner.replace(/\r\n|\r|\n/g, " ");
  return text.length > 2 && text.startsWith(" ") && text.endsWith(" ") && /[^ ]/.test(text)
    ? text.slice(1, -1)
    : text;
}

/**
 * The text `source` shows when it is exactly one code span, backtick runs
 * included, else null: `` `a` **b** `a` `` is two spans and a bold, never
 * one span's spelling.
 */
export function codeSourceText(source) {
  const spans = findCodeSpans(source);
  return spans.length === 1 && spans[0].start === 0 && spans[0].end === source.length
    ? spans[0].text
    : null;
}

/**
 * The Markdown for a code span showing `text`: the fewest backticks no run in
 * it has, and a space inside each end when the text starts or ends with a
 * backtick, or with a space at both ends (else a reader would take it off).
 */
export function codeSpanSource(text) {
  if (!text) return "";
  const runs = new Set((text.match(/`+/g) || []).map((r) => r.length));
  let n = 1;
  while (runs.has(n)) n++;
  const fence = "`".repeat(n);
  const pad =
    text.startsWith("`") || text.endsWith("`") || (/^ .* $/s.test(text) && /[^ ]/.test(text));
  return pad ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

/**
 * Every code span in `md`, in order: where it starts and ends, its source
 * (backtick runs included) and the text it shows. A run with no closing run of
 * its length, or none with text between, is text.
 */
export function findCodeSpans(md) {
  const spans = [];
  if (!md?.includes("`")) return spans;
  CODE_SCAN_RE.lastIndex = 0;
  for (let m = CODE_SCAN_RE.exec(md); m; m = CODE_SCAN_RE.exec(md)) {
    const run = m[1];
    if (!run) continue;
    const from = m.index + run.length;
    const close = new RegExp(`(?<!\`)${run}(?!\`)`, "g");
    close.lastIndex = from;
    const end = close.exec(md);
    if (!end || end.index === from) continue;
    const to = end.index + run.length;
    spans.push({
      start: m.index,
      end: to,
      source: md.slice(m.index, to),
      text: codeSpanText(md.slice(from, end.index)),
    });
    CODE_SCAN_RE.lastIndex = to;
  }
  return spans;
}

/**
 * The Markdown for a code span that showed what `source` shows and now shows
 * `text`: the source with only the changed characters replaced, so an edit
 * changes only what was typed. Its backtick runs, its padding and every line
 * break outside the change are kept (a fence written in a quote or a callout,
 * `` ```js\nlet a = 1\n``` ``, stays three lines: on screen each break is a
 * space, one character for one). When that no longer reads back as `text` (a
 * backtick run typed in that matches the fence), the shortest safe spelling.
 */
export function editedCodeSpanSource(source, text) {
  const was = codeSourceText(source);
  if (was !== null && text && !source.includes("\r")) {
    const run = /^`+/.exec(source)[0];
    let inner = source.slice(run.length, source.length - run.length);
    const pad = codeSpanText(inner).length === inner.length - 2 ? 1 : 0;
    inner = inner.slice(pad, inner.length - pad);
    let head = 0;
    while (head < was.length && head < text.length && was[head] === text[head]) head++;
    let tail = 0;
    while (
      tail < was.length - head &&
      tail < text.length - head &&
      was[was.length - 1 - tail] === text[text.length - 1 - tail]
    )
      tail++;
    const kept = `${run}${source.slice(run.length, run.length + pad)}${inner.slice(0, head)}${text.slice(
      head,
      text.length - tail,
    )}${inner.slice(inner.length - tail)}${source.slice(source.length - run.length - pad, source.length - run.length)}${run}`;
    if (codeSourceText(kept) === text) return kept;
  }
  return codeSpanSource(text);
}
