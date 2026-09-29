import { describe, expect, it } from "vitest";
import {
  indentRun,
  selectedIds,
  selectionRange,
  stepHead,
  subtreeEnd,
} from "../../src/utils/blockRun";
import type { Block } from "../../src/types/notes";

const p = (id: string): Block => ({ id, type: "p", text: id });
const li = (id: string, indent = 0): Block => ({ id, type: "bullet", text: id, indent });
const fm: Block = { id: "fm", type: "frontmatter", text: "title: x" } as Block;

// a, then a list: b with c and d nested (d deeper), then e, then f.
const note = [p("a"), li("b"), li("c", 1), li("d", 2), li("e"), p("f")];

describe("subtreeEnd", () => {
  it("takes a list item's nested items, however deep, and stops at its own depth", () => {
    expect(subtreeEnd(note, 1)).toBe(3);
    expect(subtreeEnd(note, 2)).toBe(3);
    expect(subtreeEnd(note, 4)).toBe(4);
  });

  it("gives a block that is not a list item no children", () => {
    expect(subtreeEnd([p("a"), li("b", 1)], 0)).toBe(0);
  });
});

describe("selectionRange / selectedIds", () => {
  it("a single list item brings its children", () => {
    expect(selectedIds(note, { anchor: "b", head: "b" })).toEqual(["b", "c", "d"]);
  });

  it("covers the run between anchor and head in either direction", () => {
    expect(selectedIds(note, { anchor: "f", head: "e" })).toEqual(["e", "f"]);
    expect(selectedIds(note, { anchor: "a", head: "b" })).toEqual(["a", "b", "c", "d"]);
  });

  it("is empty once an end has left the note", () => {
    expect(selectionRange(note, { anchor: "gone", head: "a" })).toBeNull();
    expect(selectedIds(note, null)).toEqual([]);
  });

  it("never covers the frontmatter", () => {
    expect(selectedIds([fm, p("a")], { anchor: "a", head: "fm" })).toEqual(["a"]);
  });
});

describe("stepHead", () => {
  it("Shift+Down from a parent steps over its children to the next block", () => {
    const next = stepHead(note, { anchor: "b", head: "b" }, 1);
    expect(selectedIds(note, next)).toEqual(["b", "c", "d", "e"]);
  });

  it("Shift+Up then Shift+Down grows and shrinks back", () => {
    const up = stepHead(note, { anchor: "e", head: "e" }, -1);
    expect(selectedIds(note, up)).toEqual(["d", "e"]);
    expect(selectedIds(note, stepHead(note, up, 1))).toEqual(["e"]);
  });

  it("shrinking past a child run keeps going until the selection changes", () => {
    const sel = { anchor: "b", head: "e" };
    expect(selectedIds(note, stepHead(note, sel, -1))).toEqual(["b", "c", "d"]);
    expect(selectedIds(note, stepHead(note, { anchor: "b", head: "b" }, -1))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("stays put at the note's edges and under the frontmatter", () => {
    const last = { anchor: "f", head: "f" };
    expect(stepHead(note, last, 1)).toBe(last);
    const top = { anchor: "a", head: "a" };
    expect(stepHead([fm, p("a")], top, -1)).toBe(top);
  });
});

describe("indentRun", () => {
  const depths = (blocks: Block[] | null) =>
    blocks?.map((b) => `${b.id}${b.indent || 0}`).join(" ");

  it("moves every list item in the run in by one, children along, as one shape", () => {
    const list = [li("a"), li("b"), li("c", 1), li("d")];
    expect(depths(indentRun(list, 1, 3, 1))).toBe("a0 b1 c2 d1");
  });

  it("moves nothing when the first item has no item above to nest under", () => {
    const list = [p("x"), li("a"), li("b")];
    expect(indentRun(list, 1, 2, 1)).toBeNull();
    expect(indentRun([li("a"), li("b")], 0, 1, 1)).toBeNull();
  });

  it("moves nothing when a later run in the selection cannot nest", () => {
    const list = [li("a"), li("b"), p("x"), li("c")];
    expect(indentRun(list, 1, 3, 1)).toBeNull();
  });

  it("leaves a paragraph in the run alone, and reads across an empty row", () => {
    const blank: Block = { id: "x", type: "p", text: "" };
    const list = [li("a"), li("b"), blank, li("c")];
    expect(depths(indentRun(list, 1, 3, 1))).toBe("a0 b1 x0 c1");
  });

  it("outdents every item that can; one at the edge stays, and its children stay under it", () => {
    const list = [li("a"), li("b", 1), li("c", 2), li("d")];
    expect(depths(indentRun(list, 0, 0, -1))).toBeUndefined();
    expect(depths(indentRun(list, 0, 1, -1))).toBe("a0 b0 c1 d0");
  });

  it("drops a stale source prefix on the items it moves", () => {
    const list = [li("a"), { ...li("b", 1), indentStr: "\t" } as Block];
    expect(indentRun(list, 1, 1, -1)?.[1]).not.toHaveProperty("indentStr", "\t");
  });

  it("returns null when nothing in the run is a list item", () => {
    expect(indentRun([p("a"), p("b")], 0, 1, 1)).toBeNull();
  });
});
