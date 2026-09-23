/**
 * What a right-click in the editor acts on, and where its menu hangs
 * (2026-09-23, EditorContextMenu). A right-click on a word that is not
 * selected selects that word, as a native Mac text field does; one inside
 * the selection keeps it. The menu then opens under the line of the selection
 * the pointer is on, left-aligned with it.
 */

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
 * past a line's end, not text).
 */
export function wordRangeAt(root: Element, x: number, y: number): Range | null {
  const caret = document.caretRangeFromPoint?.(x, y);
  const node = caret?.startContainer;
  if (!caret || !node || node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return null;
  const bounds = wordBoundsAt((node as Text).data, caret.startOffset);
  if (!bounds) return null;
  const range = document.createRange();
  range.setStart(node, bounds[0]);
  range.setEnd(node, bounds[1]);
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
      return {
        top: Math.min(...same.map((r) => r.top)),
        bottom: Math.max(...same.map((r) => r.bottom)),
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
