import type { Block } from "../types/notes";

/** Above this many cells the middle is left unmatched rather than compared. */
const MATCH_LIMIT = 250_000;

/** Everything a block holds but its id, its fields in a fixed order. */
function contentKey(block: Block): string {
  const { id: _, ...rest } = block as Block & Record<string, unknown>;
  const fields = rest as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(fields)
      .sort()
      .map((k) => [k, fields[k]]),
  );
}

/**
 * A note read again from disk, its blocks keeping the ids they had here. The
 * parser mints a fresh id for every block on every read, and a block whose id
 * changes is a new element to React: an outside edit to one line remounted
 * every block, lost the caret and sent the next keystroke to the note's end.
 * A block holding the same content keeps its id: the common head and tail,
 * then the longest common run of what is between. In each gap left between
 * matched blocks, a block of the same kind at the same place keeps its id too
 * when the gap holds as many blocks on both sides: that is the line an editor
 * changed, and the caret in it is painted back, clamped to its new text.
 * Identical blocks are matched in order, so which of several identical lines
 * the caret stays in is a guess; no id is ever given to two blocks. Returns
 * `next` itself when no id changes.
 */
export function keepBlockIds(previous: readonly Block[] | undefined, next: Block[]): Block[] {
  if (!previous?.length || !next?.length) return next;
  const pk = previous.map(contentKey);
  const nk = next.map(contentKey);
  const kept: (string | null)[] = new Array(next.length).fill(null);
  // Matched pairs [previous index, next index], in order.
  const pairs: [number, number][] = [];

  let start = 0;
  while (start < pk.length && start < nk.length && pk[start] === nk[start]) {
    pairs.push([start, start]);
    start++;
  }
  let pEnd = pk.length;
  let nEnd = nk.length;
  const tail: [number, number][] = [];
  while (pEnd > start && nEnd > start && pk[pEnd - 1] === nk[nEnd - 1]) {
    pEnd--;
    nEnd--;
    tail.unshift([pEnd, nEnd]);
  }

  // The longest common subsequence of the middle.
  const rows = pEnd - start;
  const cols = nEnd - start;
  if (rows > 0 && cols > 0 && rows * cols <= MATCH_LIMIT) {
    const w = cols + 1;
    const len = new Uint32Array((rows + 1) * w);
    for (let i = rows - 1; i >= 0; i--)
      for (let j = cols - 1; j >= 0; j--)
        len[i * w + j] =
          pk[start + i] === nk[start + j]
            ? len[(i + 1) * w + j + 1] + 1
            : Math.max(len[(i + 1) * w + j], len[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < rows && j < cols) {
      if (pk[start + i] === nk[start + j]) {
        pairs.push([start + i, start + j]);
        i++;
        j++;
      } else if (len[(i + 1) * w + j] >= len[i * w + j + 1]) i++;
      else j++;
    }
  }
  pairs.push(...tail);

  // The gaps between matched blocks: a changed block keeps its place's id.
  let prevP = -1;
  let prevN = -1;
  for (const [p, n] of [...pairs, [previous.length, next.length] as [number, number]]) {
    if (p - prevP === n - prevN)
      for (let k = 1; k < p - prevP; k++)
        if (previous[prevP + k].type === next[prevN + k].type)
          kept[prevN + k] = previous[prevP + k].id;
    if (n < next.length) kept[n] = previous[p].id;
    prevP = p;
    prevN = n;
  }

  // A fresh id stays where none was kept; no id is ever used twice.
  let changed = false;
  const out = next.map((block, i) => {
    const id = kept[i];
    if (id === null || id === block.id) return block;
    changed = true;
    return { ...block, id };
  });
  if (!changed) return next;
  const seen = new Set<string>();
  for (const b of out) {
    if (seen.has(b.id)) return next;
    seen.add(b.id);
  }
  return out;
}

/** `note` with its blocks keeping the ids `previous` gave them, or `note` itself. */
export function withKeptBlockIds<
  N extends { content?: { blocks?: Block[] } | null } | null | undefined,
>(previous: N | undefined, note: N): N {
  const blocks = note?.content?.blocks;
  const before = previous?.content?.blocks;
  if (!note || !blocks || !before) return note;
  const kept = keepBlockIds(before, blocks);
  return kept === blocks ? note : ({ ...note, content: { ...note.content, blocks: kept } } as N);
}
