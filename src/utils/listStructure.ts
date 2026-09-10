import type { Block } from "../types/notes";

// The same list walk supplies the writer's prefixes and the editor's numbers.
type ListSource = Pick<Block, "indent" | "indentStr" | "num" | "numRaw" | "marker" | "text"> & {
  id?: string;
  type: string;
};
const isList = (block: ListSource) => ["numbered", "bullet", "checkbox"].includes(block.type);
const isBlank = (block: ListSource) => block.type === "p" && !(block.text || "").trim();

interface ListPosition {
  prefix: string;
  canonicalPrefix: string;
  width: number;
  number?: number;
  group: number;
  parent?: number;
}

export function listLayout(blocks: ListSource[]): (ListPosition | undefined)[] {
  const positions: (ListPosition | undefined)[] = [];
  let levels: number[] = [];
  blocks.forEach((block, index) => {
    if (!isList(block)) {
      if (!isBlank(block)) levels = [];
      return;
    }
    const depth = block.indent || 0;
    const sibling = levels[depth];
    levels.length = depth + 1;
    let parentDepth = depth - 1;
    while (parentDepth >= 0 && levels[parentDepth] === undefined) parentDepth--;
    const parent = levels[parentDepth];
    const above = positions[parent];
    const canonicalPrefix = above
      ? above.prefix + " ".repeat(above.width + 2 * (depth - parentDepth - 1))
      : "  ".repeat(depth);
    const continues = sibling !== undefined && blocks[sibling].type === block.type;
    const number =
      block.type === "numbered"
        ? continues
          ? (positions[sibling]?.number ?? 0) + 1
          : (block.num ?? 1)
        : undefined;
    positions[index] = {
      prefix: block.indentStr ?? canonicalPrefix,
      canonicalPrefix,
      // A checkbox's list marker is still "- "; [ ] belongs to its text.
      width: block.type === "numbered" ? String(block.numRaw ?? block.num ?? number).length + 2 : 2,
      number,
      group: continues ? positions[sibling]!.group : index,
      parent,
    };
    levels[depth] = index;
  });
  return positions;
}

const columns = (prefix: string) => {
  let width = 0;
  for (const char of prefix) width += char === "\t" ? 4 - (width % 4) : 1;
  return width;
};

/** Recover depth from the actual source prefixes, not a fixed spaces/2 rule. */
export function readListIndents<T extends ListSource>(blocks: T[]): T[] {
  let parents: { contentColumn: number; depth: number }[] = [];
  let baseDepth: number | undefined;
  const parsed = blocks.map((block) => {
    if (!isList(block)) {
      if (!isBlank(block)) {
        parents = [];
        baseDepth = undefined;
      }
      return block;
    }
    const prefix = block.indentStr ?? "  ".repeat(block.indent || 0);
    const column = columns(prefix);
    baseDepth = Math.min(baseDepth ?? 6, block.indent || 0);
    while (parents.length && column < parents[parents.length - 1].contentColumn) parents.pop();
    const depth = parents.length ? Math.min(6, parents[parents.length - 1].depth + 1) : baseDepth;
    const width = block.type === "numbered" ? String(block.numRaw ?? block.num ?? 1).length + 2 : 2;
    parents.push({ contentColumn: column + width, depth });
    const result = { ...block, indentStr: prefix };
    if (depth) result.indent = depth;
    else delete result.indent;
    return result;
  });
  const positions = listLayout(parsed);
  return parsed.map((block, i) => {
    if (!positions[i] || block.indentStr !== positions[i]!.canonicalPrefix) return block;
    const { indentStr: _prefix, ...rest } = block;
    return rest as T;
  });
}

/**
 * Structural edits renumber only the affected ordered sibling sequences.
 * Text edits and disk adoption leave the file's original markers alone.
 * This runs at the user-commit seam, so Enter, drag, Tab and deletion agree;
 * undo restores the original markers from its existing snapshot.
 */
export function reconcileListEdit<T extends ListSource>(before: T[], after: T[]): T[] {
  if (before === after) return after;
  const oldIndices = new Map(before.map((block, i) => [block.id, i]));
  const predecessors = new Map<string | undefined, string | undefined>();
  let previous: T | undefined;
  for (const block of before) {
    if (isList(block)) {
      predecessors.set(block.id, previous?.id);
      previous = block;
    } else if (!isBlank(block)) previous = undefined;
  }
  previous = undefined;
  // A structural edit cannot create a child without a parent or skip levels.
  // Existing unusual indentation remains untouched on a text-only edit.
  let parentChangedDepth = false;
  const indented = after.map((block) => {
    if (!isList(block)) {
      if (!isBlank(block)) {
        previous = undefined;
        parentChangedDepth = false;
      }
      return block;
    }
    const old = oldIndices.get(block.id);
    const changed =
      old === undefined ||
      (before[old].indent || 0) !== (block.indent || 0) ||
      predecessors.get(block.id) !== previous?.id ||
      parentChangedDepth;
    const maxDepth = previous ? (previous.indent || 0) + 1 : 0;
    parentChangedDepth = changed && (block.indent || 0) > maxDepth;
    previous = parentChangedDepth ? { ...block, indent: maxDepth, indentStr: undefined } : block;
    return previous;
  });
  if (indented.some((block, i) => block !== after[i])) after = indented;
  const oldPositions = listLayout(before);
  const positions = listLayout(after);
  const groups = (blocks: T[], layout: (ListPosition | undefined)[]) => {
    const result = new Map<number, number[]>();
    blocks.forEach((block, i) => {
      if (block.type !== "numbered") return;
      const group = layout[i]!.group;
      const members = result.get(group) ?? [];
      members.push(i);
      result.set(group, members);
    });
    return result;
  };
  const oldGroups = groups(before, oldPositions);
  let result = after;
  const patch = (i: number, updates: Partial<T>) => {
    if (result === after) result = [...after];
    result[i] = { ...result[i], ...updates };
  };
  const parentId = (blocks: T[], layout: (ListPosition | undefined)[], i: number) => {
    const parent = layout[i]?.parent;
    return parent === undefined ? undefined : blocks[parent].id;
  };
  for (const [start, members] of groups(after, positions)) {
    const oldMember = members
      .map((i) => oldIndices.get(after[i].id))
      .find((i) => i !== undefined && before[i].type === "numbered");
    const oldGroup = oldMember === undefined ? undefined : oldPositions[oldMember]?.group;
    // A newly pasted list has no prior sequence to repair. Keep its authored
    // markers; brand-new items without markers are numbered by listLayout.
    if (oldGroup === undefined) continue;
    const oldMembers = oldGroups.get(oldGroup)!;
    const unchanged =
      members.length === oldMembers.length &&
      members.every((i, offset) => {
        const old = oldMembers[offset];
        return (
          after[i].id === before[old].id &&
          after[i].indent === before[old].indent &&
          parentId(after, positions, i) === parentId(before, oldPositions, old)
        );
      });
    if (unchanged) continue;
    const sameParent =
      parentId(before, oldPositions, oldGroup) === parentId(after, positions, start) &&
      (before[oldGroup].indent || 0) === (after[start].indent || 0);
    const first = sameParent ? oldPositions[oldGroup]!.number! : 1;
    members.forEach((i, offset) =>
      patch(i, { num: first + offset, numRaw: undefined } as Partial<T>),
    );
  }
  // A moved item cannot retain its old prefix. Descendants follow a changed
  // parent's prefix/marker width too, while unrelated imported indentation stays.
  const newPositions = listLayout(result);
  for (let i = 0; i < result.length; i++) {
    if (!newPositions[i]) continue;
    const old = oldIndices.get(result[i].id);
    if (old === undefined || !oldPositions[old] || result[i].indentStr === undefined) continue;
    if (
      (before[old].indent || 0) !== (result[i].indent || 0) ||
      parentId(before, oldPositions, old) !== parentId(result, newPositions, i) ||
      oldPositions[old]!.canonicalPrefix !== newPositions[i]!.canonicalPrefix
    ) {
      patch(i, { indentStr: undefined } as Partial<T>);
      // Recompute after dropping a raw prefix so a deeper child follows it.
      const updated = listLayout(result);
      newPositions.splice(0, newPositions.length, ...updated);
    }
  }
  return result;
}
