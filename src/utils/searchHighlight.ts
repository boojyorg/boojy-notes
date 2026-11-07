// The words a search matched, found in a block as it is drawn, for the tint a
// note wears when it is opened from Search. Ranges only: the tint is painted
// by the CSS Custom Highlight API over the text, never written into it, since
// the editor reads its DOM back (a mark element would reach the file).

import { prefersReducedMotion } from "../tokens/motion";
import { foldText, originAt } from "./search";
import { outsideAtoms } from "./domHelpers";

interface Segment {
  node: Text | null;
  start: number;
  length: number;
}

/**
 * Every occurrence of every term in `root`'s text, folded as Search folds
 * (case, accents, a run of whitespace). A `<br>` reads as a space, so a
 * phrase found across a soft break is found here too.
 */
export function matchRanges(root: Node, terms: string[]): Range[] {
  const doc = root.ownerDocument ?? document;
  const segments: Segment[] = [];
  let text = "";
  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    outsideAtoms,
  );
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n as Text).data;
      segments.push({ node: n as Text, start: text.length, length: t.length });
      text += t;
    } else if (n.nodeName === "BR") {
      segments.push({ node: null, start: text.length, length: 1 });
      text += " ";
    }
  }
  const fold = foldText(text);
  // A term never starts or ends on a space (`queryTerms` trims), so an edge
  // always falls in a text node.
  const at = (offset: number, end: boolean): [Text, number] | null => {
    for (const s of segments) {
      if (!s.node) continue;
      const inside = end
        ? offset > s.start && offset <= s.start + s.length
        : offset >= s.start && offset < s.start + s.length;
      if (inside) return [s.node, offset - s.start];
    }
    return null;
  };
  const ranges: Range[] = [];
  for (const term of terms) {
    if (!term) continue;
    for (let i = fold.text.indexOf(term); i !== -1; i = fold.text.indexOf(term, i + term.length)) {
      const a = at(originAt(fold, i), false);
      const b = at(originAt(fold, i + term.length), true);
      if (!a || !b) continue;
      const r = doc.createRange();
      r.setStart(a[0], a[1]);
      r.setEnd(b[0], b[1]);
      ranges.push(r);
    }
  }
  return ranges;
}

/** The highlight's names, strongest first: the fade steps through them. */
export const SEARCH_HIT_STEPS = ["search-hit", "search-hit-2", "search-hit-3", "search-hit-4"];
/** The tint's alpha at each step, by theme; the first is the ==highlight==' strength. */
export const SEARCH_HIT_ALPHA = { day: [0.35, 0.24, 0.13, 0.05], night: [0.4, 0.27, 0.15, 0.06] };
/** How long the tint holds before it fades, and each fade step. */
export const SEARCH_HIT_HOLD_MS = 1500;
export const SEARCH_HIT_STEP_MS = 90;

let timers: ReturnType<typeof setTimeout>[] = [];
/** Takes away an element's tint (tintElement), if one shows. */
let clearElementTint: (() => void) | null = null;

interface HighlightRegistry {
  set(name: string, h: unknown): void;
  delete(name: string): void;
}

function registry(): {
  highlights: HighlightRegistry;
  Highlight: new (...r: Range[]) => unknown;
} | null {
  const g = globalThis as {
    CSS?: { highlights?: HighlightRegistry };
    Highlight?: new (...r: Range[]) => unknown;
  };
  return g.CSS?.highlights && g.Highlight
    ? { highlights: g.CSS.highlights, Highlight: g.Highlight }
    : null;
}

/**
 * Hold step 0, then fade through the rest (a colour cannot transition).
 * With reduced motion it holds and goes at once. A new tint replaces one
 * still showing.
 */
function fade(show: (step: number) => void): void {
  clearTint();
  show(0);
  const steps = prefersReducedMotion() ? [SEARCH_HIT_STEPS.length] : [1, 2, 3, 4];
  steps.forEach((step, k) => {
    timers.push(setTimeout(() => show(step), SEARCH_HIT_HOLD_MS + k * SEARCH_HIT_STEP_MS));
  });
}

/**
 * Tint `ranges`, stepping through the highlight names. Answers whether the
 * browser could paint it.
 */
export function tintRanges(ranges: Range[]): boolean {
  const reg = registry();
  if (!reg || ranges.length === 0) return false;
  const highlight = new reg.Highlight(...ranges);
  fade((step) => {
    for (const name of SEARCH_HIT_STEPS) reg.highlights.delete(name);
    if (step < SEARCH_HIT_STEPS.length) reg.highlights.set(SEARCH_HIT_STEPS[step], highlight);
  });
  return true;
}

/**
 * Tint an element whose text a highlight cannot reach (a footnote's [1] is
 * drawn by CSS over hidden source): the same steps, as `data-tint`.
 */
export function tintElement(el: Element): void {
  const set = (step: number) => {
    if (step < SEARCH_HIT_STEPS.length) el.setAttribute("data-tint", String(step));
    else el.removeAttribute("data-tint");
  };
  fade(set);
  clearElementTint = () => el.removeAttribute("data-tint");
}

export function clearTint(): void {
  for (const t of timers) clearTimeout(t);
  timers = [];
  clearElementTint?.();
  clearElementTint = null;
  const reg = registry();
  if (reg) for (const name of SEARCH_HIT_STEPS) reg.highlights.delete(name);
}
