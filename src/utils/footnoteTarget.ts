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

/** The label a drawn reference names: `[^proof]` → `proof`. */
export function refLabel(text: string): string {
  return text.replace(/^\[\^/, "").replace(/\]$/, "");
}

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
  blocks.splice(at, 0, { id, type: "footnote", label, text: "" } as Block);
  return at;
}

/** The drawn reference holding the selection inside `root`, if any. */
export function caretFootnoteRef(root: Element | null | undefined): Element | null {
  const sel = window.getSelection();
  const node = sel?.rangeCount ? sel.anchorNode : null;
  const el = node && (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement);
  const ref = el?.closest(`.${FOOTNOTE_REF_CLASS}`) ?? null;
  return ref && root?.contains(ref) ? ref : null;
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
