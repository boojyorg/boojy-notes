/**
 * What a right-click in the editor acts on, and where its menu hangs
 * (2026-09-23, EditorContextMenu). A right-click on a word that is not
 * selected selects that word, as a native Mac text field does; one inside
 * the selection keeps it. The menu then opens under the line of the selection
 * the pointer is on, left-aligned with it.
 */

import { cssZoom } from "./domHelpers";

/** The word around `offset` in `text`, as [start, end), or null when the offset is not on one. */
export function wordBoundsAt(text: string, offset: number): [number, number] | null {
  const words = [...new Intl.Segmenter(undefined, { granularity: "word" }).segment(text)]
    .filter((seg) => seg.isWordLike)
    .map((seg): [number, number] => [seg.index, seg.index + seg.segment.length]);
  // On the word, or just past its end: a pointer on a word's last half
  // answers the offset after its last letter.
  return (
    words.find(([start, end]) => offset >= start && offset < end) ??
    words.find(([, end]) => offset === end) ??
    null
  );
}

/**
 * Half the difference between the line's height and the glyph box's: how far
 * the painted selection reaches above and below the rect a range reports.
 * Measured in the same (zoomed) pixels as the rect.
 */
function paintedLead(range: Range, glyphHeight: number): number {
  const node = range.startContainer;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (!el) return 0;
  const style = getComputedStyle(el);
  const lineHeight = Number.parseFloat(style.lineHeight);
  if (!Number.isFinite(lineHeight)) return 0;
  // Computed lengths are unzoomed CSS pixels; the rect is in zoomed ones.
  return Math.max(0, (lineHeight * cssZoom(el) - glyphHeight) / 2);
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const contains = (r: Box, x: number, y: number) =>
  x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** Whether the point lies on the drawn part of `range`. */
export function pointInRange(range: Range, x: number, y: number): boolean {
  if (range.collapsed) return false;
  return [...range.getClientRects()].some((r) => contains(r, x, y));
}

/**
 * The word under the point, as a range inside `root`, or null (whitespace,
 * past a line's end, not text). The word is read across the text nodes of the
 * block it sits in, not one node: a paste lands as a node of its own, so
 * "test" pasted twice is two nodes and one word, and a word half in bold is
 * one word too. A soft break (`<br>`) ends a word.
 */
export function wordRangeAt(root: Element, x: number, y: number): Range | null {
  const caret = document.caretRangeFromPoint?.(x, y);
  const node = caret?.startContainer;
  if (!caret || !node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;
  const block = node.parentElement?.closest("[data-block-id]") ?? node.parentElement;
  if (!block) return null;

  // The block's text as one string, with where each node starts in it.
  const pieces: { node: Text; start: number }[] = [];
  let text = "";
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      pieces.push({ node: n as Text, start: text.length });
      text += (n as Text).data;
    } else if ((n as Element).tagName === "BR") {
      text += "\n";
    }
  }
  const at = pieces.find((p) => p.node === node);
  if (!at) return null;
  const bounds = wordBoundsAt(text, at.start + caret.startOffset);
  if (!bounds) return null;

  const locate = (offset: number, preferEnd: boolean) => {
    for (const p of preferEnd ? [...pieces].reverse() : pieces) {
      const end = p.start + p.node.data.length;
      if (preferEnd ? offset > p.start && offset <= end : offset >= p.start && offset < end)
        return { node: p.node, offset: offset - p.start };
    }
    return null;
  };
  const start = locate(bounds[0], false);
  const end = locate(bounds[1], true);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  // caretRangeFromPoint answers the nearest offset even well past a line's
  // end: only a word the pointer is actually on counts.
  return pointInRange(range, x, y) ? range : null;
}

/**
 * The rect the menu hangs under: the selection's line box on the pointer's
 * line (its left edge is where the menu aligns), or a zero-width box at the
 * pointer when nothing is selected there.
 */
export function menuAnchorFor(range: Range | null, x: number, y: number): Box {
  if (range && !range.collapsed) {
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    const line = rects.find((r) => y >= r.top && y <= r.bottom) ?? rects[rects.length - 1];
    if (line) {
      // Several rects on one line (formatting splits a word): span them all.
      const same = rects.filter((r) => Math.abs(r.top - line.top) < 2);
      const top = Math.min(...same.map((r) => r.top));
      const bottom = Math.max(...same.map((r) => r.bottom));
      // The selection is painted the whole line's height, taller than the
      // glyphs these rects measure: hang from the painted box, or the gap
      // under the words disappears beneath the highlight.
      const lead = paintedLead(range, bottom - top);
      return {
        top: top - lead,
        bottom: bottom + lead,
        left: Math.min(...same.map((r) => r.left)),
        right: Math.max(...same.map((r) => r.right)),
      };
    }
  }
  // A caret: under the line the pointer is on, at the pointer.
  const lineBox = range?.getBoundingClientRect();
  if (lineBox && lineBox.height > 0 && y >= lineBox.top - 4 && y <= lineBox.bottom + 4) {
    return { top: lineBox.top, bottom: lineBox.bottom, left: x, right: x };
  }
  return { top: y, bottom: y, left: x, right: x };
}
