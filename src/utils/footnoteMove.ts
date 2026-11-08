/**
 * Move footnotes to bottom: every footnote, with its later paragraphs, under
 * the note's last line, in the order its number reads. A pure edit of the
 * blocks; the command around it (a safety save first, one commit) is
 * `useMoveFootnotes`.
 */
import type { Block } from "../types/notes";
import { LIST_TYPES } from "./blockKinds";
import { subtreeEnd } from "./blockRun";
import { refLabels } from "./footnoteTarget";

/** A blank row: an empty paragraph, or one holding only spaces. */
const blank = (b: Block | undefined) => b?.type === "p" && (b.text || "").trim() === "";

const labelOf = (b: Block) => (b as { label?: string }).label ?? "";

const isList = (b: Block | undefined) => !!b && LIST_TYPES.has(b.type);

/**
 * `b` written with a blank line above it: no `tightAbove`, and `looseAbove`
 * under a list item when `b` is one too, where the writer would otherwise
 * put none (a bullet list and a numbered one keep the blank line between).
 */
function spaced(b: Block, above?: Block): Block {
  const loose = isList(above) && isList(b);
  if (!b.tightAbove && !!b.looseAbove === loose) return b;
  const { tightAbove: _t, looseAbove: _l, ...rest } = b;
  return (loose ? { ...rest, looseAbove: true } : rest) as Block;
}

/** `b` on the line under the block above: `tightAbove`, never also `looseAbove`. */
function tight(b: Block): Block {
  const { looseAbove: _l, ...rest } = b;
  return { ...rest, tightAbove: true } as Block;
}

interface Group {
  start: number;
  end: number;
  label: string;
}

/**
 * The note's footnote groups before `limit` (`subtreeEnd`: a footnote, its
 * later paragraphs and the blank rows between them), less those that must
 * stay: a footnote that is all that parts two lists of one family keeps them
 * two (with it gone, the blank line left would make them one list, numbered
 * on), so the last of a run of footnotes between them stays where it is.
 */
function movableGroups(blocks: readonly Block[], limit: number): Group[] {
  const all: Group[] = [];
  for (let i = 0; i < limit; i++) {
    if (blocks[i].type !== "footnote") continue;
    const end = Math.min(subtreeEnd(blocks, i), limit - 1);
    all.push({ start: i, end, label: labelOf(blocks[i]) });
    i = end;
  }
  // Lists join only within a family: numbered with numbered, bullets with to-dos.
  const family = (b: Block | undefined) =>
    !b || !LIST_TYPES.has(b.type) ? null : b.type === "numbered" ? "ol" : "ul";
  const stays = new Set<Group>();
  for (let g = 0; g < all.length; g++) {
    // The run of footnotes (blank rows between) that this one ends.
    let next = all[g].end + 1;
    while (next < limit && blank(blocks[next])) next++;
    if (all[g + 1]?.start === next) continue;
    let first = g;
    for (let prev = all[first].start - 1; ; ) {
      while (prev >= 0 && blank(blocks[prev])) prev--;
      if (first > 0 && all[first - 1].end === prev) {
        first--;
        prev = all[first].start - 1;
        continue;
      }
      const above = family(blocks[prev]);
      if (above && next < limit && family(blocks[next]) === above) stays.add(all[g]);
      break;
    }
  }
  return all.filter((g) => !stays.has(g));
}

/**
 * The order the groups go in, so that each shows its number in turn once
 * moved: a number is a label's first reference in reading order, and the
 * moved footnotes are read after the note, so their own references count
 * where they land. The note's references come first; then each footnote in
 * that order, whose references add the labels they first name; a footnote
 * nothing references goes after the numbered ones, as written, its own
 * references then counting after it. Duplicates of a label go together, as
 * written. Reading the result again gives the same order, references
 * inside definitions and cycles between them included.
 */
function readingOrder(blocks: readonly Block[], kept: Block[], groups: Group[]): Group[] {
  const defined = new Set(blocks.filter((b) => b.type === "footnote").map(labelOf));
  const byLabel = new Map<string, Group[]>();
  for (const g of groups) byLabel.set(g.label, [...(byLabel.get(g.label) ?? []), g]);
  const order: string[] = [];
  const named = new Set<string>();
  const read = (bs: readonly Block[]) => {
    for (const label of refLabels(bs)) {
      if (defined.has(label) && !named.has(label)) {
        named.add(label);
        order.push(label);
      }
    }
  };
  const out: Group[] = [];
  const placed = new Set<Group>();
  const place = (g: Group) => {
    if (placed.has(g)) return;
    out.push(g);
    placed.add(g);
    read(blocks.slice(g.start, g.end + 1));
  };
  let k = 0;
  const drain = () => {
    for (; k < order.length; k++) for (const g of byLabel.get(order[k]) ?? []) place(g);
  };
  read(kept);
  drain();
  // What is left is referenced from nowhere the note reads, or only from
  // another footnote left: those referenced wait for their reference.
  const referenced = new Set(refLabels(blocks));
  for (const pass of [(g: Group) => !referenced.has(g.label), () => true]) {
    for (const g of groups) {
      if (placed.has(g) || !pass(g)) continue;
      place(g);
      drain();
    }
  }
  return out;
}

const outOfPlace = new WeakMap<readonly Block[], boolean>();

/**
 * Whether Move footnotes to bottom has something to do: asked by the menu
 * bar on every selection change, so answered once per version of the blocks
 * (every edit makes a new array).
 */
export function footnotesOutOfPlace(blocks: readonly Block[]): boolean {
  let answer = outOfPlace.get(blocks);
  if (answer === undefined) {
    answer = footnotesAtBottom(blocks) !== null;
    outOfPlace.set(blocks, answer);
  }
  return answer;
}

/**
 * The note with its footnotes at the bottom, or null when they are there
 * already, in order (however they are spaced). The groups go in reading
 * order (`readingOrder`), on consecutive lines, one blank line under the
 * note; blank rows the note ends with stay its last lines. A block that
 * stood right under a moved footnote takes a blank line above it, as it
 * would otherwise run into the block before.
 */
export function footnotesAtBottom(blocks: readonly Block[]): Block[] | null {
  // Asked on every selection change (the menu bar's state): most notes have none.
  if (!blocks.some((b) => b.type === "footnote")) return null;
  let trailing = blocks.length;
  while (trailing > 0 && blank(blocks[trailing - 1])) trailing--;

  const groups = movableGroups(blocks, trailing);
  if (!groups.length) return null;
  const moving = new Map(groups.map((g) => [g.start, g]));
  const kept: Block[] = [];
  let afterGroup = false;
  for (let i = 0; i < trailing; i++) {
    const g = moving.get(i);
    if (g) {
      i = g.end;
      afterGroup = true;
      continue;
    }
    kept.push(afterGroup ? spaced(blocks[i], kept[kept.length - 1]) : blocks[i]);
    afterGroup = false;
  }

  // Blank rows between the note and its footnotes go: one blank line is the gap.
  while (kept.length && blank(kept[kept.length - 1])) kept.pop();
  const run = readingOrder(blocks, kept, groups).flatMap((g, k) => {
    const [head, ...rest] = blocks.slice(g.start, g.end + 1);
    return [k === 0 ? spaced(head) : tight(head), ...rest];
  });
  const next = [...kept, ...run, ...blocks.slice(trailing)];

  // In place is judged by order alone: footnotes already at the bottom, in
  // order, keep the spacing they were written with.
  const order = (bs: readonly Block[]) => bs.filter((b) => !blank(b)).map((b) => b.id);
  const before = order(blocks);
  const after = order(next);
  return after.every((id, i) => id === before[i]) ? null : next;
}
