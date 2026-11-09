/**
 * The block a link's `#^id` names, found as Obsidian finds it (its Markdown
 * parser's `blockid`, Obsidian 1.15), so a link reaches the same block in
 * both apps. An ID is `^` and letters, digits or dashes, after whitespace, as
 * the last thing in a paragraph (a list item's, a heading's, a cell's, one in
 * a quote or callout). A paragraph that is an ID alone names the block before
 * it: a whole list, quote or table. A list item's ID is its own (its nested
 * items come with it, as the selection's do). Case is ignored, and where two
 * blocks carry one ID the later wins, as in Obsidian's index.
 */
import { LIST_TYPES } from "./blockKinds";
import type { HeadingSection } from "./headingTarget";

interface TargetBlock {
  type?: string;
  text?: string;
  title?: string;
  rows?: string[][];
  indent?: number;
}

const ID = "[a-zA-Z0-9-]+";
/** An ID ending a paragraph: whitespace before it, nothing after. */
const TRAILING_RE = new RegExp(`\\s\\^(${ID})$`);
/** A paragraph that is an ID alone. */
const ALONE_RE = new RegExp(`^\\^(${ID})$`);

/** An ID ending a block's text, as the renderer draws it: after whitespace or alone. */
export const BLOCK_ID_END_RE = new RegExp(`(^|\\s)\\^(${ID})(\\s*)$`);

/** The block ID a subpath names (`^first-block`), or null for none (a heading, empty). */
export function blockSubpath(subpath: string | null): string | null {
  const m = new RegExp(`^\\s*\\^(${ID})\\s*$`).exec(subpath ?? "");
  return m ? m[1] : null;
}

/** The ID ending `text`'s paragraph, or null. */
export function trailingBlockId(text: string): string | null {
  return TRAILING_RE.exec(text.trimEnd())?.[1] ?? null;
}

/** The IDs ending any paragraph in `text` (paragraphs part at a blank line). */
function paragraphIds(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const para of text.split(/\n[ \t]*\n/)) {
    const id = trailingBlockId(para);
    if (id) out.push(id);
  }
  return out;
}

/** The IDs a block carries itself, in its own text, title or cells. */
function ownIds(b: TargetBlock): string[] {
  if (["code", "math", "embed", "frontmatter"].includes(b.type ?? "")) return [];
  if (b.type === "table") return (b.rows ?? []).flat().flatMap((cell) => paragraphIds(cell));
  if (b.type === "callout") return [...paragraphIds(b.title), ...paragraphIds(b.text)];
  if (b.type === "blockquote") return paragraphIds(b.text);
  const id = trailingBlockId(b.text ?? "");
  return id ? [id] : [];
}

/** An ID ending a paragraph, with the whitespace before and after it. */
const TRAILING_ID_RE = new RegExp(`\\s+\\^${ID}\\s*$`);
const withoutParagraphIds = (text: string | undefined) =>
  text
    ?.split(/(\n[ \t]*\n)/)
    .map((part, i) => (i % 2 ? part : part.replace(TRAILING_ID_RE, "")))
    .join("");

/** A paragraph that is an ID alone, naming the block before it. */
export const isIdAlone = (b: TargetBlock | undefined): boolean =>
  b?.type === "p" && ALONE_RE.test((b.text ?? "").trim());

/**
 * `b` without the IDs it carries (`ownIds`, in the same places, and an ID
 * alone): a copy (Duplicate) must not name what its original names.
 */
export function withoutOwnIds<T extends TargetBlock>(b: T): T {
  if (["code", "math", "embed", "frontmatter"].includes(b.type ?? "")) return b;
  if (isIdAlone(b)) return { ...b, text: "" };
  if (b.type === "table") {
    return {
      ...b,
      rows: b.rows?.map((row) => row.map((cell) => withoutParagraphIds(cell) ?? cell)),
    };
  }
  if (b.type === "callout") {
    return { ...b, title: withoutParagraphIds(b.title), text: withoutParagraphIds(b.text) };
  }
  if (b.type === "blockquote") return { ...b, text: withoutParagraphIds(b.text) };
  return b.text === undefined ? b : { ...b, text: b.text.replace(TRAILING_ID_RE, "") };
}

const isEmptyRow = (b: TargetBlock) => b.type === "p" && !(b.text ?? "").trim();

/** The Markdown block ending at `j`: a list's or a quote's run of rows, else the block. */
function runEndingAt(blocks: readonly TargetBlock[], j: number): HeadingSection {
  const t = blocks[j].type ?? "";
  const same = LIST_TYPES.has(t)
    ? (b: TargetBlock) => LIST_TYPES.has(b.type ?? "")
    : t === "blockquote"
      ? (b: TargetBlock) => b.type === "blockquote"
      : null;
  let start = j;
  if (same) while (start > 0 && same(blocks[start - 1])) start--;
  return { start, end: j + 1 };
}

/** The blocks `id` names in `blocks` (start, and the index after the last), or null. */
export function findBlockTarget(blocks: readonly TargetBlock[], id: string): HeadingSection | null {
  const wanted = id.toLowerCase();
  let found: HeadingSection | null = null;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const alone = b.type === "p" ? ALONE_RE.exec((b.text ?? "").trim()) : null;
    if (alone) {
      if (alone[1].toLowerCase() !== wanted) continue;
      let j = i - 1;
      while (j >= 0 && isEmptyRow(blocks[j])) j--;
      if (j >= 0) found = runEndingAt(blocks, j);
      continue;
    }
    if (!ownIds(b).some((own) => own.toLowerCase() === wanted)) continue;
    // A list item brings what is nested under it (blockRun's `subtreeEnd`).
    let end = i + 1;
    if (LIST_TYPES.has(b.type ?? ""))
      while (end < blocks.length && (blocks[end].indent ?? 0) > (b.indent ?? 0)) end++;
    found = { start: i, end };
  }
  return found;
}
