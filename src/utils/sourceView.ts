/**
 * The Markdown view's two pure halves (2026-09-24): where a block sits in the
 * note's file text, so the caret can cross the switch in the block it was in,
 * and how that text is painted, with the markers in muted ink and the words in
 * primary.
 *
 * The file text is `blocksToMarkdown(blocks)`: exactly what `write-note`
 * writes (bar the CRLF a CRLF file is given back at the write). The view never
 * reads the disk.
 */
import { LINK_DEST } from "./linkDestination";
import { blocksToMarkdown } from "./markdown";

type Block = { id: string; type: string; text?: string };

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
// and nothing is hidden. Two inks only: the Markdown's markers muted, the words
// in primary; a heading's words and bold are semibold (a monospace face keeps
// its advance across weights, so the painted layer stays over the field's own
// text). Code is left alone inside a fence and between backticks.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const muted = (s: string) => (s ? `<span class="md-mark">${esc(s)}</span>` : "");
const strong = (s: string) => `<span class="md-strong">${s}</span>`;

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
      out += muted(code[1]) + esc(code[2]) + muted(code[1]);
      i += code[0].length;
      continue;
    }
    const wiki = rest.match(/^(!?\[\[)([^\]\n]*?)(\]\])/);
    if (wiki) {
      out += muted(wiki[1]) + word(wiki[2]) + muted(wiki[3]);
      i += wiki[0].length;
      continue;
    }
    const link = rest.match(LINK);
    if (link) {
      out += muted(link[1]) + word(link[2]) + muted(link[3] + link[4] + link[5]);
      i += link[0].length;
      continue;
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
    const plain = rest.match(/^[^\\`[!*_~=]+/)?.[0] ?? rest[0];
    out += word(plain);
    i += plain.length;
  }
  return out;
}

/**
 * The painted HTML for a note's file text, one line per line of the text, for
 * the layer under the Markdown view's field. Pure: the same text paints the
 * same HTML.
 */
export function paintMarkdown(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let frontmatter = lines[0] === "---";
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    if (frontmatter) {
      // The file's properties, between its two `---` lines: the fences
      // muted, the properties in the secondary ink, never parsed.
      if (n > 0 && line === "---") frontmatter = false;
      out.push(line === "---" ? muted(line) : `<span class="md-meta">${esc(line)}</span>`);
      continue;
    }
    const fenceOpen = line.match(FENCE);
    if (fence) {
      const closes =
        fenceOpen && fenceOpen[1][0] === fence[0] && fenceOpen[1].length >= fence.length;
      if (closes && line.trim() === fenceOpen[1].padEnd(line.trim().length, fence[0])) {
        fence = null;
        out.push(muted(line));
      } else out.push(esc(line));
      continue;
    }
    if (fenceOpen) {
      fence = fenceOpen[1];
      out.push(muted(line));
      continue;
    }
    if (RULE.test(line)) {
      out.push(muted(line));
      continue;
    }
    const marker = line.match(LINE_MARKER)?.[1] ?? "";
    const body = paintInline(line.slice(marker.length));
    out.push(muted(marker) + (/^[ \t]*(?:>[ \t]?)*[ \t]*#/.test(marker) ? strong(body) : body));
  }
  // A final empty line still needs its height, or the layer is a line short
  // of the field and a caret on the last line sits below the painted text.
  const html = out.join("\n");
  return lines[lines.length - 1] === "" ? `${html}\u200b` : html;
}
