import { describe, expect, it } from "vitest";
import { reorderFloor, keepGapsInPlace } from "../../src/utils/blockOrder";
import type { Block } from "../../src/types/notes";

const p = (id: string): Block => ({ id, type: "p", text: id });
const fm: Block = { id: "fm", type: "frontmatter", text: "title: x" } as Block;

describe("reorderFloor", () => {
  it("is 1 when the note opens with frontmatter: nothing goes above it and it never moves", () => {
    expect(reorderFloor([fm, p("a"), p("b")])).toBe(1);
  });

  it("is 0 for a note without frontmatter, and for an empty one", () => {
    expect(reorderFloor([p("a"), p("b")])).toBe(0);
    expect(reorderFloor([])).toBe(0);
  });

  it("only the head counts: the parser never makes frontmatter anywhere else", () => {
    expect(reorderFloor([p("a"), fm])).toBe(0);
  });
});

describe("keepGapsInPlace", () => {
  const b = (id: string, extra: Partial<Block> = {}): Block => ({
    id,
    type: "p",
    text: id,
    ...extra,
  });

  it("leaves each position's written spelling where it was when blocks are reordered", () => {
    const before = [b("fm", { type: "frontmatter" }), b("a", { tightAbove: true }), b("c")];
    const after = keepGapsInPlace(before, [before[0], before[2], before[1]]);
    expect(after.map((x) => [x.id, !!x.tightAbove])).toEqual([
      ["fm", false],
      ["c", true],
      ["a", false],
    ]);
  });

  it("returns anything that is not a pure reorder as it is", () => {
    const before = [b("a"), b("c", { tightAbove: true })];
    const inserted = [b("a"), b("x"), before[1]];
    expect(keepGapsInPlace(before, inserted)).toBe(inserted);
    const same = [...before];
    expect(keepGapsInPlace(before, same)).toBe(same);
  });
});
