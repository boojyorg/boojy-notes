import { describe, expect, it } from "vitest";
import { selectedIds, selectionRange, stepHead, subtreeEnd } from "../../src/utils/blockRun";
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
