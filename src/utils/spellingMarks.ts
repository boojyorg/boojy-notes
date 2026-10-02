// The editor's spelling underline, as ranges: the text read paragraph by
// paragraph, and each misspelled word found in it. Painted by the CSS Custom
// Highlight API over the text, never written into it, since the editor reads
// its DOM back (a mark element would reach the file).

/** Text whose spelling is a name or code, not language: never checked or underlined. */
const UNCHECKED =
  "code, pre, .inline-tag, a, .wikilink, [contenteditable='false'], [data-block-type='code'], [data-block-type='frontmatter']";
/** What counts as one paragraph: a block, or a field of its own (a table cell, a callout's body). */
const PARAGRAPH = "[data-inline-field], [data-block-id]";
/** A word the checker reads: letters, with an apostrophe inside (don't). */
export const WORD_RE = /^[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*$/u;

export interface SpellParagraph {
  el: Element;
  /** Its text, a soft break as `\n` and anything unchecked as one space. */
  text: string;
  pieces: { node: Text; start: number }[];
}

/** The editor's text, paragraph by paragraph. */
export function spellParagraphs(editor: Element): SpellParagraph[] {
  const found = new Map<Element, SpellParagraph>();
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement;
    const host = el?.closest(PARAGRAPH);
    if (!el || !host || !editor.contains(host)) continue;
    let p = found.get(host);
    if (!p) {
      p = { el: host, text: "", pieces: [] };
      found.set(host, p);
    }
    if (n.nodeType === Node.ELEMENT_NODE) {
      if (n.nodeName === "BR") p.text += "\n";
      continue;
    }
    if (el.closest(UNCHECKED)) {
      p.text += " ";
      continue;
    }
    p.pieces.push({ node: n as Text, start: p.text.length });
    p.text += (n as Text).data;
  }
  return [...found.values()].filter((p) => p.text);
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

/** Where an offset in the paragraph's text falls: a text node and an offset in it. */
function pointAt(p: SpellParagraph, offset: number, end: boolean): [Text, number] | null {
  for (const { node, start } of p.pieces) {
    const len = node.data.length;
    if (end ? offset > start && offset <= start + len : offset >= start && offset < start + len) {
      return [node, offset - start];
    }
  }
  return null;
}

/** The caret's offset in the paragraph's text, or -1 when it is elsewhere. */
export function caretOffsetIn(p: SpellParagraph, node: Node | null, offset: number): number {
  const piece = p.pieces.find((q) => q.node === node);
  return piece ? piece.start + offset : -1;
}

/**
 * A range for every occurrence of a misspelled word in the paragraph, except
 * the word ending at `skipEnd` (the word being typed, underlined only once
 * the caret leaves it, as a browser does).
 */
export function wordRanges(p: SpellParagraph, wrong: Set<string>, skipEnd = -1): Range[] {
  if (!wrong.size) return [];
  const ranges: Range[] = [];
  for (const seg of segmenter.segment(p.text)) {
    if (!seg.isWordLike || !wrong.has(seg.segment) || !WORD_RE.test(seg.segment)) continue;
    const end = seg.index + seg.segment.length;
    if (end === skipEnd) continue;
    const a = pointAt(p, seg.index, false);
    const b = pointAt(p, end, true);
    if (!a || !b) continue;
    const r = document.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1]);
    ranges.push(r);
  }
  return ranges;
}

/** Whether two ranges share any text. */
export function overlaps(a: Range, b: Range): boolean {
  try {
    return (
      a.compareBoundaryPoints(Range.START_TO_END, b) > 0 &&
      a.compareBoundaryPoints(Range.END_TO_START, b) < 0
    );
  } catch {
    return false; // in different documents, or one detached
  }
}
