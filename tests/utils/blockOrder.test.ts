import { describe, expect, it } from "vitest";
import { reorderFloor } from "../../src/utils/blockOrder";
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
