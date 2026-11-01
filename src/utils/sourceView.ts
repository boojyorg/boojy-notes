/**
 * The Markdown view's two pure halves: where a block sits in the
 * note's file text, so the caret can cross the switch in the block it was in,
 * and how that text is painted, with the markers in muted ink and the words in
 * primary.
 *
 * The file text is `blocksToMarkdown(blocks)`: exactly what `write-note`
 * writes (bar the CRLF a CRLF file is given back at the write). The view never
 * reads the disk.
 */
import { highlightCode } from "./codeHighlight";
import { canonicalLang } from "./codeLanguage";
import { trimBareUrl } from "./inlineFormatting";
import { LINK_DEST } from "./linkDestination";
import { TAG_BODY } from "./tags";
import { blocksToMarkdown } from "./markdown";
import type { Block } from "../types/notes";

/**
 * Where block `i`'s lines end in the file text: the length of the text the
 * blocks up to and including it serialise to. The serializer walks the blocks
 * in order and a block's lines depend only on the blocks before it, so each is
 * a prefix of the whole. (A paragraph separator written ahead of empty rows is
 * the one exception, and it moves an end by one blank line at most.)
 */
function endOf(blocks: Block[], i: number): number {
  return blocksToMarkdown(blocks.slice(0, i + 1)).length;
}

/** Where block `i`'s own lines start: past the line break and any blank line before them. */
function startOf(text: string, blocks: Block[], i: number): number {
  const end = Math.min(endOf(blocks, i), text.length);
  let at = i === 0 ? 0 : Math.min(endOf(blocks, i - 1) + 1, end);
  while (at < end && text[at] === "\n") at++;
  return at;
}

/**
 * How far into its first line a block's text starts: the marker before it
 * (`## `, `- [ ] `, `> `), or null when the line does not end with the text as
 * written (text over several lines, a table, a fence).
 */
function markerLength(text: string, start: number, block: Block): number | null {
  const own = block.text ?? "";
  if (!own || own.includes("\n")) return null;
  const lineEnd = text.indexOf("\n", start);
  const line = text.slice(start, lineEnd === -1 ? text.length : lineEnd);
  return line.endsWith(own) ? line.length - own.length : null;
}

/**
 * Whether a character offset means the same character in both views: the
 * formatted view counts what is shown, so text holding inline Markdown
 * (`**a**` is one character there, five here) is entered at its start.
 */
const shownAsWritten = (block: Block) => !/[*_`~=[\]\\<&]/.test(block.text ?? "");

/**
 * The offset in the file text for a caret `offset` characters into block
 * `index`: the same character where the block's text is shown as written,
 * the start of its text otherwise, or of its line when it has no one line of
 * text (a table, a fence, a paragraph over several lines).
 */
export function sourceOffsetFor(
  text: string,
  blocks: Block[],
  index: number,
  offset: number,
): number {
  if (index < 0 || index >= blocks.length) return 0;
  const block = blocks[index];
  const start = startOf(text, blocks, index);
  const marker = markerLength(text, start, block);
  if (marker == null) return start;
  const within = shownAsWritten(block) ? offset : 0;
  return start + marker + Math.max(0, Math.min(within, (block.text ?? "").length));
}

/**
 * The block a file-text offset is in, and how far into that block's text the
 * caret goes: the same character where the text is shown as written, its
 * start otherwise. Found by bisection, since every block's end is a
 * serialisation of its own.
 */
export function blockOffsetFor(
  text: string,
  blocks: Block[],
  sourceOffset: number,
): { index: number; offset: number } | null {
  if (blocks.length === 0) return null;
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (endOf(blocks, mid) >= sourceOffset) hi = mid;
    else lo = mid + 1;
  }
  const block = blocks[lo];
  const start = startOf(text, blocks, lo);
  const marker = markerLength(text, start, block);
  if (marker == null || !shownAsWritten(block)) return { index: lo, offset: 0 };
  const own = block.text ?? "";
  return { index: lo, offset: Math.max(0, Math.min(sourceOffset - start - marker, own.length)) };
}

// ─── Painting ───
// The view is plain source: every character is drawn as written, in one size,
// and nothing is hidden. Colour says what each part is, and only colour and
// weight may differ (a monospace face keeps its advance across weights, so the
// painted layer stays over the field's own text): markers muted, a heading's
// `#` in the accent and its words semibold, list and task markers in their
// own ink, links, wikilinks and tags in the accent as the formatted view
// draws them, a quote in the secondary ink, inline code on its tint, and a
// fence's code in its language's colours, as a code block colours it.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** `html` in a span of class `cls`; nothing for nothing. */
const span = (cls: string, html: string) => (html ? `<span class="${cls}">${html}</span>` : "");
const muted = (s: string) => span("md-mark", esc(s));
const strong = (s: string) => `<span class="md-strong">${s}</span>`;
/** A tag where the renderer reads one: `#` and the tag grammar's body (`TAG_RE`). */
const TAG = new RegExp(`^#${TAG_BODY}`, "u");
/** A bare address, as the renderer autolinks one before trimming its trailing punctuation. */
const BARE_URL = /^https?:\/\/[^\s<]+/;
/** Prose up to the next character that could open a marker, a tag or an address. */
const PLAIN = /^(?:(?!https?:\/\/)[^\\`[!*_~=#])+/;

/** A line's leading block marker: indentation, then quote, list, task or heading markers. */
const LINE_MARKER =
  /^([ \t]*(?:>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}(?:[ \t]+|$))?)/;
const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const RULE = /^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/** A link or image: its text in the words' ink, the brackets and address muted. */
const LINK = new RegExp(String.raw`^(!?\[)([^\]\n]*)(\]\()(${LINK_DEST})(\))`);

/** Inline markers: code spans (kept whole), wikilink and link brackets, emphasis runs. */
function paintInline(line: string): string {
  let out = "";
  let i = 0;
  let bold = false;
  const word = (s: string) => (bold ? strong(esc(s)) : esc(s));
  while (i < line.length) {
    const rest = line.slice(i);
    // An escape is written as it is and read as its character.
    if (rest[0] === "\\" && rest.length > 1) {
      out += muted("\\") + word(rest[1]);
      i += 2;
      continue;
    }
    const code = rest.match(/^(`+)([\s\S]*?[^`])\1(?!`)/);
    if (code) {
      out += muted(code[1]) + span("md-code", esc(code[2])) + muted(code[1]);
      i += code[0].length;
      continue;
    }
    const wiki = rest.match(/^(!?\[\[)([^\]\n]*?)(\]\])/);
    if (wiki) {
      // The target and any alias in the accent, the pipe between them muted.
      const bar = wiki[2].indexOf("|");
      const inner =
        bar < 0
          ? span("md-wiki", word(wiki[2]))
          : span("md-wiki", word(wiki[2].slice(0, bar))) +
            muted("|") +
            span("md-wiki", word(wiki[2].slice(bar + 1)));
      out += muted(wiki[1]) + inner + muted(wiki[3]);
      i += wiki[0].length;
      continue;
    }
    const link = rest.match(LINK);
    if (link) {
      out += muted(link[1]) + span("md-link", word(link[2])) + muted(link[3] + link[4] + link[5]);
      i += link[0].length;
      continue;
    }
    const url = rest.match(BARE_URL);
    if (url) {
      const address = trimBareUrl(url[0]);
      out += span("md-link", word(address));
      i += address.length;
      continue;
    }
    // A tag opens at the line's start, after a space or after a `(`.
    if (rest[0] === "#" && (i === 0 || /[\s(]/.test(line[i - 1]))) {
      const tag = rest.match(TAG);
      if (tag) {
        out += span("md-tag", word(tag[0]));
        i += tag[0].length;
        continue;
      }
    }
    const run = rest.match(/^(\*\*|__|~~|==)/);
    if (run) {
      if (run[1] === "**" || run[1] === "__") bold = !bold;
      out += muted(run[1]);
      i += 2;
      continue;
    }
    // A single star is emphasis's; an underscore only at a word's edge, as
    // CommonMark reads it (`snake_case` is a word).
    const edge = !/\w/.test(line[i - 1] ?? "") || !/\w/.test(line[i + 1] ?? "");
    if (rest[0] === "*" || (rest[0] === "_" && edge)) {
      out += muted(rest[0]);
      i += 1;
      continue;
    }
    // Plain text up to the next character that could open a marker.
    const plain = rest.match(PLAIN)?.[0] ?? rest[0];
    out += word(plain);
    i += plain.length;
  }
  return out;
}

/**
 * A line's leading marker, each part in its own ink: indentation and quote
 * markers muted, a list or task marker in the list's ink, a heading's `#` in
 * the accent. `LINE_MARKER` matches a list marker or a heading marker, never
 * both.
 */
function paintMarker(marker: string): { html: string; heading: boolean; quote: boolean } {
  const lead = marker.match(/^[ \t]*(?:>[ \t]?)*[ \t]*/)?.[0] ?? "";
  const rest = marker.slice(lead.length);
  const heading = rest.startsWith("#");
  const html = muted(lead) + span(heading ? "md-hmark" : "md-list", esc(rest));
  return { html, heading, quote: lead.includes(">") };
}

/**
 * A fence's code, all of it at once so a construct over several lines (a
 * long string, a block comment) is coloured whole: a `markdown` fence by this
 * view's own painter, so a list inside it reads as a list; any other language
 * by the code block's highlighter (`highlightCode`), and a language it does
 * not know as written. Its lines stay its lines: the HTML keeps every newline.
 */
function paintFenceBody(lines: string[], info: string, depth: number): string {
  const lang = canonicalLang(info);
  if (lang === "markdown") {
    // Each level repaints its body, so the nesting is bounded: a pile of
    // unclosed openers overflowed the stack, and the view paints before an
    // edit is committed, so the edit never reached the file. Past the
    // bound the body is shown as written.
    return depth < MAX_FENCE_DEPTH ? paintLines(lines, false, depth + 1) : esc(lines.join("\n"));
  }
  return highlightCode(lines.join("\n"), lang);
}

/** How deep Markdown fences inside Markdown fences are painted as Markdown. */
const MAX_FENCE_DEPTH = 8;

/**
 * The lines painted, joined by their newlines; frontmatter read only when
 * `atStart`; `depth` is how many Markdown fences they sit inside.
 */
function paintLines(lines: string[], atStart: boolean, depth = 0): string {
  const out: string[] = [];
  let fence: { mark: string; info: string; body: string[] } | null = null;
  // Frontmatter as the parser reads it: `---` on line 1 with a later `---`
  // line to close it; an opener with none is a divider.
  let frontmatter =
    atStart && lines[0] === "---" && lines.some((l, n) => n > 0 && l.trim() === "---");
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (frontmatter) {
      // The file's properties, between its two `---` lines: the fences
      // muted, the properties in the secondary ink, never parsed.
      if (n > 0 && line.trim() === "---") frontmatter = false;
      out.push(line === "---" ? muted(line) : `<span class="md-meta">${esc(line)}</span>`);
      continue;
    }
    const fenceOpen = line.match(FENCE);
    if (fence) {
      const mark = fence.mark;
      const closes = fenceOpen && fenceOpen[1][0] === mark[0] && fenceOpen[1].length >= mark.length;
      if (closes && line.trim() === fenceOpen[1].padEnd(line.trim().length, mark[0])) {
        if (fence.body.length) out.push(paintFenceBody(fence.body, fence.info, depth));
        fence = null;
        out.push(muted(line));
      } else fence.body.push(line);
      continue;
    }
    if (fenceOpen) {
      // The fence muted, its language in the secondary ink.
      const at = line.indexOf(fenceOpen[1]) + fenceOpen[1].length;
      const info = line.slice(at);
      fence = { mark: fenceOpen[1], info, body: [] };
      out.push(muted(line.slice(0, at)) + span("md-info", esc(info)));
      continue;
    }
    if (RULE.test(line)) {
      out.push(muted(line));
      continue;
    }
    const marker = paintMarker(line.match(LINE_MARKER)?.[1] ?? "");
    let body = paintInline(line.slice((line.match(LINE_MARKER)?.[1] ?? "").length));
    if (marker.heading) body = strong(body);
    if (marker.quote) body = span("md-quote", body);
    out.push(marker.html + body);
  }
  // A fence the file never closes runs to its end, as the parser reads it.
  if (fence?.body.length) out.push(paintFenceBody(fence.body, fence.info, depth));
  return out.join("\n");
}

/**
 * The painted HTML for a note's file text, one line per line of the text, for
 * the layer under the Markdown view's field. Pure: the same text paints the
 * same HTML.
 */
export function paintMarkdown(text: string): string {
  const lines = text.split("\n");
  const html = paintLines(lines, true);
  // A final empty line still needs its height, or the layer is a line short
  // of the field and a caret on the last line sits below the painted text.
  return lines[lines.length - 1] === "" ? `${html}\u200b` : html;
}
