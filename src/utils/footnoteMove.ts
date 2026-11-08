/**
 * Move footnotes to bottom: every footnote, with its later paragraphs, under
 * the note's last line, in the order its number reads. A pure edit of the
 * blocks; the command around it (a safety save first, one commit) is
 * `useFootnoteCommands`.
 */
import type { Block } from "../types/notes";
import { subtreeEnd } from "./blockRun";
import { footnoteNumbers } from "./footnoteTarget";

/** A blank row: an empty paragraph, or one holding only spaces. */
const blank = (b: Block | undefined) => b?.type === "p" && (b.text || "").trim() === "";

const labelOf = (b: Block) => (b as { label?: string }).label ?? "";

/** `b` without `tightAbove`: written with a blank line above it. */
function spaced(b: Block): Block {
  if (!b.tightAbove) return b;
  const { tightAbove: _t, ...rest } = b;
  return rest as Block;
}

/**
 * The note with its footnotes at the bottom, or null when they are there
 * already, in order (however they are spaced). A footnote goes with its group (`subtreeEnd`: its later
 * paragraphs and the blank rows between them). The groups are sorted by the
 * number their label shows (`footnoteNumbers`); one a duplicate label leaves
 * unused goes beside the one used, and a footnote nothing references last,
 * each in the order written. They stand on consecutive lines, one blank line
 * under the note; blank rows the note ends with stay its last lines. A block
 * that stood right under a moved footnote takes a blank line above it, as it
 * would otherwise run into the block before.
 */
export function footnotesAtBottom(blocks: readonly Block[]): Block[] | null {
  // Asked on every selection change (the menu bar's state): most notes have none.
  if (!blocks.some((b) => b.type === "footnote")) return null;
  const numbers = footnoteNumbers(blocks);
  let trailing = blocks.length;
  while (trailing > 0 && blank(blocks[trailing - 1])) trailing--;

  const groups: { key: number; at: number; blocks: Block[] }[] = [];
  const kept: Block[] = [];
  let afterGroup = false;
  for (let i = 0; i < trailing; i++) {
    const b = blocks[i];
    if (b.type !== "footnote") {
      kept.push(afterGroup ? spaced(b) : b);
      afterGroup = false;
      continue;
    }
    const end = Math.min(subtreeEnd(blocks, i), trailing - 1);
    const key = numbers.get(labelOf(b)) ?? Number.POSITIVE_INFINITY;
    groups.push({ key, at: i, blocks: blocks.slice(i, end + 1) });
    i = end;
    afterGroup = true;
  }
  if (!groups.length) return null;

  // Blank rows between the note and its footnotes go: one blank line is the gap.
  while (kept.length && blank(kept[kept.length - 1])) kept.pop();
  groups.sort((a, b) => a.key - b.key || a.at - b.at);
  const run = groups.flatMap((g, k) => {
    const [head, ...rest] = g.blocks;
    return [k === 0 ? spaced(head) : ({ ...head, tightAbove: true } as Block), ...rest];
  });
  const next = [...kept, ...run, ...blocks.slice(trailing)];

  // In place is judged by order alone: footnotes already at the bottom, in
  // order, keep the spacing they were written with.
  const order = (bs: readonly Block[]) => bs.filter((b) => !blank(b)).map((b) => b.id);
  const before = order(blocks);
  const after = order(next);
  return after.every((id, i) => id === before[i]) ? null : next;
}
