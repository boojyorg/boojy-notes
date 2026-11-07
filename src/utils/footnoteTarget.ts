/**
 * What a footnote reference points at, and the number a new one takes. A
 * reference's definition is the last `[^label]:` block with its label, as
 * Obsidian and markdown-it-footnote agree; its later paragraphs are the
 * blocks `subtreeEnd` groups under it. Nothing here is numbered for show:
 * a label is the file's, and only a new footnote is given a number.
 */
import type { LinkDescription } from "../components/LinkTooltip";
import type { Block } from "../types/notes";
import { subtreeEnd } from "./blockRun";
import { FOOTNOTE_REF_CLASS, findFootnotes } from "./footnotes";
import { findComments } from "./comments";
import { stripMarkdownFormatting } from "./inlineFormatting";
import { refLabel } from "./footnoteLabel";

export { refLabel } from "./footnoteLabel";

/** The index of the definition `label` names (the last one wins), or -1. */
export function findFootnoteDefinition(blocks: readonly Block[], label: string): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === "footnote" && (b as { label?: string }).label === label) return i;
  }
  return -1;
}

/** The chip a reference's hover shows: its definition read-only, or that it has none. */
export function describeFootnote(blocks: readonly Block[], label: string): LinkDescription {
  const at = findFootnoteDefinition(blocks, label);
  if (at < 0) return { label: `[^${label}]`, sub: "no footnote by this label", missing: true };
  const paragraphs: string[] = [];
  for (let k = at; k <= subtreeEnd(blocks, at); k++) {
    const text = (blocks[k].text || "")
      .split("\n")
      .map((line) => line.trim())
      .join(" ")
      .trim();
    if (text) paragraphs.push(stripMarkdownFormatting(text));
  }
  if (!paragraphs.length) return { label: `[^${label}]`, sub: "empty footnote" };
  return { label: paragraphs.join("\n"), wrap: true };
}

/** Every piece of inline text a block holds: its text, a callout's title, a table's cells. */
function inlineTexts(b: Block): string[] {
  if (b.type === "code" || b.type === "math" || b.type === "frontmatter") return [];
  const k = b as Block & { title?: string; rows?: string[][] };
  return [b.text || "", k.title || "", ...(k.rows?.flat() ?? [])];
}

/**
 * The label a new footnote takes: one above every number already a label,
 * a definition's or a reference's (one typed with no definition yet still
 * claims its number), so a new footnote never joins an old one.
 */
export function nextFootnoteNumber(blocks: readonly Block[]): number {
  let max = 0;
  const take = (label: string) => {
    if (/^\d+$/.test(label)) max = Math.max(max, Number(label));
  };
  for (const b of blocks) {
    if (b.type === "footnote") take((b as { label?: string }).label || "");
    for (const text of inlineTexts(b)) {
      for (const f of findFootnotes(text, findComments(text))) {
        if (f.kind === "ref") take(refLabel(text.slice(f.start, f.end)));
      }
    }
  }
  return max + 1;
}

/** A blank row: an empty paragraph, or one holding only spaces. */
const blank = (b: Block | undefined) => b?.type === "p" && (b.text || "").trim() === "";

/**
 * Insert footnote's one edit: block `index` takes `text` (its reference put
 * in), and an empty definition `[^label]:` goes at the end of the note,
 * above any blank rows the note ends with (they stay the note's last lines),
 * never above the block being edited. Returns the definition's index.
 */
export function addFootnote(
  blocks: Block[],
  index: number,
  text: string,
  label: string,
  id: string,
): number {
  blocks[index] = { ...blocks[index], text } as Block;
  let at = blocks.length;
  while (at - 1 > index && blank(blocks[at - 1])) at--;
  // Under another footnote it goes on the next line, as a list's next item.
  const tight = blocks[at - 1]?.type === "footnote" ? { tightAbove: true } : null;
  blocks.splice(at, 0, { id, type: "footnote", label, text: "", ...tight } as Block);
  return at;
}

/**
 * The open note's own reference at `target`, if any: one drawn in an embed is
 * the embedded note's, whose footnotes this note does not hold, so it is text.
 */
export function ownFootnoteRef(target: EventTarget | null): Element | null {
  const el = target instanceof Element ? target : null;
  const ref = el?.closest(`.${FOOTNOTE_REF_CLASS}`) ?? null;
  return ref && !ref.closest("[data-embed-source]") ? ref : null;
}

/** A definition's label element, as the editor draws it (EditableBlock). */
const DEF_LABEL = "[data-footnote-label][data-fn]";

const setNumber = (el: Element, n: number | undefined) => {
  const v = n === undefined ? null : String(n);
  if (el.getAttribute("data-n") === v) return;
  if (v === null) el.removeAttribute("data-n");
  else el.setAttribute("data-n", v);
};

/**
 * The note's footnotes numbered as Reading view numbers them: by each
 * label's first reference, counting only references whose label has a
 * definition. Each reference and definition shows its number (`data-n`,
 * drawn over the source by CSS); a reference with no definition, and a
 * definition no reference names, show their text. Embeds are their own
 * notes' and are left alone. Writes only attributes: the text, and so the
 * Markdown, never changes.
 */
export function numberFootnotes(root: Element): void {
  const own = (el: Element) => !el.closest("[data-embed-source]");
  const defs = [...root.querySelectorAll(DEF_LABEL)].filter(own);
  const defined = new Set(defs.map((d) => d.getAttribute("data-fn")));
  const order = new Map<string, number>();
  for (const ref of root.querySelectorAll(`.${FOOTNOTE_REF_CLASS}[data-fn]`)) {
    if (!own(ref)) continue;
    const label = ref.getAttribute("data-fn") ?? "";
    if (defined.has(label) && !order.has(label)) order.set(label, order.size + 1);
    setNumber(ref, order.get(label));
  }
  // Two definitions of one label: the last is the footnote (as Obsidian and
  // markdown-it read it); the earlier is drawn as unused, never removed.
  const lastOf = new Map(defs.map((d) => [d.getAttribute("data-fn"), d]));
  for (const def of defs) {
    const label = def.getAttribute("data-fn") ?? "";
    setNumber(def, lastOf.get(label) === def ? order.get(label) : undefined);
  }
  markFootnoteGroup(root);
}

const setFlag = (el: Element, name: string, on: boolean) => {
  if (el.hasAttribute(name) !== on) el.toggleAttribute(name, on);
};

/**
 * Where the divider goes: `data-fn-group` on the first footnote of the note's
 * closing run of footnotes (footnotes, their paragraphs, blank rows to the
 * end). Footnotes written elsewhere are drawn where they are, undivided.
 */
function markFootnoteGroup(root: Element): void {
  const rows = [...root.querySelectorAll(":scope > [data-block-id]")];
  const isFootnote = (el: Element) => el.getAttribute("data-block-type") === "footnote";
  const belongs = (el: Element) =>
    isFootnote(el) ||
    el.hasAttribute("data-footnote-continuation") ||
    (el.getAttribute("data-block-type") === "p" &&
      !(el.textContent ?? "").replace(/\u200B/g, "").trim());
  let start = rows.length;
  while (start > 0 && belongs(rows[start - 1])) start--;
  while (start < rows.length && !isFootnote(rows[start])) start++;
  rows.forEach((el, i) => setFlag(el, "data-fn-group", i === start && start < rows.length));
}

/** The footnote holding the caret wears `data-fn-caret`: its ↩, or an unused one's label, shows. */
export function markCaretFootnote(root: Element): void {
  const sel = window.getSelection();
  const node = sel?.rangeCount ? sel.anchorNode : null;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const here = el?.closest('[data-block-type="footnote"]') ?? null;
  for (const row of root.querySelectorAll('[data-block-type="footnote"]'))
    setFlag(row, "data-fn-caret", row === here);
}

/**
 * The label whose ↩ a click landed on: the arrow is drawn after a
 * numbered footnote's text (CSS `::after`, never in the file), so a click
 * just past the text's last line is on it.
 */
export function footnoteBackAt(target: EventTarget | null, x: number, y: number): string | null {
  const text =
    target instanceof Element
      ? target.closest('[data-block-type="footnote"] [role="textbox"]')
      : null;
  const label = text?.parentElement?.querySelector("[data-footnote-label][data-n]");
  if (!text || !label) return null;
  const range = document.createRange();
  range.selectNodeContents(text);
  const rects = range.getClientRects();
  const last = rects.length ? rects[rects.length - 1] : text.getBoundingClientRect();
  const em = Number.parseFloat(getComputedStyle(text).fontSize) || 15;
  const after = rects.length ? last.right : last.left;
  return x > after && x < after + em * 1.8 && y > last.top - 4 && y < last.bottom + 4
    ? label.getAttribute("data-fn")
    : null;
}

/** Number the footnotes under `root` now and whenever its text changes; returns the stop. */
export function watchFootnoteNumbers(root: Element): () => void {
  let queued = false;
  const run = () => {
    queued = false;
    numberFootnotes(root);
  };
  run();
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(run);
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-fn"],
  });
  return () => observer.disconnect();
}

const isRef = (n: Node | null | undefined): n is Element =>
  n instanceof Element && n.classList.contains(FOOTNOTE_REF_CLASS);
/** The caret anchor the renderer puts after a reference, if `n` is one. */
const refAnchor = (n: Node | null | undefined): Element | null =>
  n instanceof Element && n.classList.contains("caret-anchor") && isRef(n.previousSibling)
    ? n
    : null;

/** The reference just before the collapsed caret (its anchor between them or not), if any. */
function refBeforeCaret(node: Node, offset: number): Element | null {
  if (node.nodeType === Node.TEXT_NODE) {
    // In the anchor, only while nothing typed stands before the caret: text
    // typed there is prose, and Backspace takes it first.
    const anchor = refAnchor(node.parentElement);
    if (anchor)
      return (node as Text).data.slice(0, offset).replace(/\u200B/g, "") === ""
        ? (anchor.previousSibling as Element)
        : null;
    if (offset === 0) {
      const prev = node.previousSibling;
      return isRef(prev) ? prev : ((refAnchor(prev)?.previousSibling as Element | null) ?? null);
    }
    return null;
  }
  const prev = node.childNodes[offset - 1];
  return isRef(prev) ? prev : ((refAnchor(prev)?.previousSibling as Element | null) ?? null);
}

/** The reference just after the collapsed caret, if any. */
function refAfterCaret(node: Node, offset: number): Element | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return offset === (node as Text).data.length && isRef(node.nextSibling)
      ? (node.nextSibling as Element)
      : null;
  }
  const next = node.childNodes[offset];
  return isRef(next) ? next : null;
}

/**
 * The keys at a sealed reference: ← and → cross the number and
 * the caret anchor after it in one press (the anchor is a place for the
 * caret at a line's end, never a stop of its own); Backspace just after it
 * takes the number, never only the anchor's invisible character. Returns
 * whether the key was answered here (the caller prevents its default).
 */
export function footnoteRefKey(key: string, root: Element): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed || !sel.anchorNode) return false;
  if (!root.contains(sel.anchorNode)) return false;
  const { anchorNode: node, anchorOffset: offset } = sel;
  const place = (set: (r: Range) => void) => {
    const r = document.createRange();
    set(r);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  if (key === "ArrowLeft") {
    const ref = refBeforeCaret(node, offset);
    if (!ref) return false;
    place((r) => r.setStartBefore(ref));
    return true;
  }
  if (key === "ArrowRight") {
    const ref = refAfterCaret(node, offset);
    const anchor = ref
      ? refAnchor(ref.nextSibling)
      : node.nodeType === Node.TEXT_NODE && offset === 0
        ? refAnchor(node.parentElement)
        : null;
    if (!ref && !anchor) return false;
    const space = anchor?.firstChild;
    if (space) place((r) => r.setStart(space, (space as Text).data.length));
    else if (ref) place((r) => r.setStartAfter(ref));
    return true;
  }
  if (key === "Backspace") {
    const ref = refBeforeCaret(node, offset);
    // Just after the number: the browser's own Backspace then takes it whole.
    if (ref) place((r) => r.setStartAfter(ref));
    return false;
  }
  return false;
}
