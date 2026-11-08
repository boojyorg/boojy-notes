/**
 * A footnote being made in its panel, not yet written. Nothing it holds is
 * in the note until Done (`commitFootnoteDraft`), which writes the reference
 * (unless it was typed) and the definition in one commit.
 */
import type { Block } from "../types/notes";
import { findComments } from "./comments";
import { FOOTNOTE_REF_CLASS, LITERAL_SELECTOR, findFootnotes } from "./footnotes";
import { footnoteNumbers, nextFootnoteNumber } from "./footnoteTarget";
import { settleTypedSpaces } from "./inlineFormatting";

export interface DraftRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FootnoteDraft {
  /** typed: `[^label]` in the line, no definition yet; menu: Insert footnote, nothing written. */
  kind: "typed" | "menu";
  noteId: string;
  blockId: string;
  label: string;
  /** menu: the line's Markdown either side of the caret. */
  before?: string;
  after?: string;
  /** typed: which reference in its block. */
  refIndex?: number;
  rect: DraftRect;
}

/** Fired on the document by Insert footnote, whose hook holds no state, to open the panel. */
export const FOOTNOTE_DRAFT_EVENT = "boojy:footnote-draft";
/** Fired on window before a flush (blur, close, leaving the screen): an open draft is written. */
export const SETTLE_DRAFTS_EVENT = "boojy:settle-drafts";

export const rectOf = (r: DOMRect | DraftRect): DraftRect => ({
  top: r.top,
  bottom: r.bottom,
  left: r.left,
  right: r.right,
});

/** Whether Markdown ending at the caret ends in a `[^` that opens a reference (not `\[^`). */
export function endsInFootnoteOpen(before: string): boolean {
  if (!before.endsWith("[^")) return false;
  let slashes = 0;
  for (let i = before.length - 3; i >= 0 && before[i] === "\\"; i--) slashes++;
  return slashes % 2 === 0;
}

/**
 * Where the caret is, for a footnote: `text` (a text block's prose: offered),
 * `field` (a table cell, a callout: said to be unavailable), or `literal`
 * (code, a comment, a link, a formula: what is typed there is text, so
 * nothing is said).
 */
export function footnoteContext(node: Node | null): "text" | "field" | "literal" | null {
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  if (!el?.closest("[data-editor]")) return null;
  if (el.closest(`${LITERAL_SELECTOR}, code, pre, a, .wikilink, [data-math], textarea, input`))
    return "literal";
  if (el.closest('[data-inline-field], [contenteditable="true"]:not([data-editor])'))
    return "field";
  if (el.closest('[data-block-type="footnote"]')) return "literal";
  return el.closest("[data-block-id]") ? "text" : null;
}

/** How many references `md` holds (a draft's reference is the next one). */
const countRefs = (md: string) =>
  findFootnotes(md, findComments(md)).filter((f) => f.kind === "ref").length;

export interface DraftEdit {
  blockIndex: number;
  /** The line's text with its reference in. */
  text: string;
  label: string;
  /** How many references stand before this one in its block. */
  refsBefore: number;
}

/**
 * What Done would write, against the note as it is now: the line's text
 * with its reference in, and the label. A typed reference is the user's, as
 * typed; Insert footnote's number is chosen again, in case a footnote took
 * it meanwhile, and refused (null) when the line no longer reads as it did
 * either side of the caret: the draft is never written elsewhere.
 */
export function draftEdit(blocks: readonly Block[], draft: FootnoteDraft): DraftEdit | null {
  const blockIndex = blocks.findIndex((b) => b.id === draft.blockId);
  if (blockIndex < 0) return null;
  const was = blocks[blockIndex].text || "";
  const label = draft.kind === "typed" ? draft.label : String(nextFootnoteNumber(blocks));
  if (draft.kind === "typed") {
    return { blockIndex, text: was, label, refsBefore: draft.refIndex ?? 0 };
  }
  const before = draft.before ?? "";
  const after = draft.after ?? "";
  if (was !== before + after) return null;
  return {
    blockIndex,
    text: settleTypedSpaces(`${before}[^${label}]${after}`, was),
    label,
    refsBefore: countRefs(before),
  };
}

/** The number the draft's reference will show once written, if it can be. */
export function draftNumber(blocks: readonly Block[], draft: FootnoteDraft): number | undefined {
  const edit = draftEdit(blocks, draft);
  if (!edit) return undefined;
  const after = blocks.map((b, i) => (i === edit.blockIndex ? { ...b, text: edit.text } : b));
  after.push({ id: "draft", type: "footnote", label: edit.label, text: "" } as Block);
  return footnoteNumbers(after).get(edit.label);
}

/**
 * The draft a reference nothing defines opens (a click on it, Write
 * footnote): its footnote to write, the reference already in its line, so
 * Done writes only the definition. Null where the panel cannot write one: a
 * reference in a field (a table cell, a callout), or outside the note's text.
 */
export function draftForRef(
  ref: Element,
  noteId: string,
  blockRoots: Record<string, HTMLElement | null>,
): FootnoteDraft | null {
  const blockId = ref.closest("[data-block-id]")?.getAttribute("data-block-id");
  const root = blockId ? blockRoots[blockId] : null;
  if (!blockId || !root?.contains(ref) || ref.closest("[data-inline-field]")) return null;
  return {
    kind: "typed",
    noteId,
    blockId,
    label: ref.getAttribute("data-fn") ?? "",
    refIndex: [...root.querySelectorAll(`.${FOOTNOTE_REF_CLASS}`)].indexOf(ref),
    rect: rectOf(ref.getBoundingClientRect()),
  };
}
