import { describe, expect, it } from "vitest";
import {
  cellAt,
  dropIndex,
  moveCell,
  tableColumnCount,
  withAlignment,
  withCell,
  withColumnDuplicated,
  withColumnInserted,
  withColumnMoved,
  withRowDuplicated,
  withRowMoved,
} from "../../src/utils/tableShape";

describe("tableShape — ragged rows stay ragged", () => {
  it("the column count is the widest row, header included or not", () => {
    expect(tableColumnCount([["a", "b"], ["1", "2", "3"], ["x"]])).toBe(3);
    expect(tableColumnCount([["only"], ["1", "2", "3"]])).toBe(3);
    expect(tableColumnCount([])).toBe(0);
  });

  it("a column a row does not reach reads as an empty cell", () => {
    expect(cellAt(["a"], 0)).toBe("a");
    expect(cellAt(["a"], 2)).toBe("");
    expect(cellAt(undefined, 0)).toBe("");
  });

  it("writing a cell pads only that row, only up to the written column", () => {
    const rows = [["h1", "h2"], ["x"], ["1", "2", "3"]];
    const next = withCell(rows, 1, 2, "z");
    expect(next).toEqual([
      ["h1", "h2"],
      ["x", "", "z"],
      ["1", "2", "3"],
    ]);
    expect(next[0]).toBe(rows[0]);
    expect(next[2]).toBe(rows[2]);
    expect(rows[1]).toEqual(["x"]);
  });

  it("moving a column moves what a short row has and never leaves a hole", () => {
    expect(moveCell(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveCell(["a"], 2, 0)).toEqual(["", "a"]);
    expect(moveCell(["a", "b"], 0, 2)).toEqual(["b", "", "a"]);
    expect(moveCell(["a"], 0, 2)).toEqual(["", "", "a"]);
    expect(moveCell(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("an inserted column lands in the asked-for column of every row, padding a short row to reach it, and is empty in the header too", () => {
    const rows = [["h1", "h2"], ["x"], ["1", "2", "3"]];
    // Rightmost add on a three-wide grid: column 4 for every row. The header
    // cell is empty (no `Col 4` label: it reached the file as text nobody typed).
    expect(withColumnInserted(rows, 3)).toEqual([
      ["h1", "h2", "", ""],
      ["x", "", "", ""],
      ["1", "2", "3", ""],
    ]);
    // Insert in the middle: a row that reaches it shifts, one that does not is padded to it.
    expect(withColumnInserted(rows, 1)).toEqual([
      ["h1", "", "h2"],
      ["x", ""],
      ["1", "", "2", "3"],
    ]);
    expect(rows[1]).toEqual(["x"]);
  });
});

describe("tableShape — the grips' operations", () => {
  const rows = [
    ["H1", "H2", "H3"],
    ["a", "b", "c"],
    ["d", "e"],
  ];

  it("moves a row anywhere, the header included", () => {
    expect(withRowMoved(rows, 2, 0)).toEqual([
      ["d", "e"],
      ["H1", "H2", "H3"],
      ["a", "b", "c"],
    ]);
    expect(withRowMoved(rows, 0, 1)[0]).toEqual(["a", "b", "c"]);
  });

  it("moves a column with its alignment, a short row moving only what it has", () => {
    const out = withColumnMoved(rows, ["left", "center", "right"], 2, 0);
    expect(out.rows).toEqual([
      ["H3", "H1", "H2"],
      ["c", "a", "b"],
      ["", "d", "e"],
    ]);
    expect(out.alignments).toEqual(["right", "left", "center"]);
  });

  it("duplicates a row under itself and a column to its right, with its alignment", () => {
    expect(withRowDuplicated(rows, 1)).toEqual([
      rows[0],
      ["a", "b", "c"],
      ["a", "b", "c"],
      rows[2],
    ]);
    const out = withColumnDuplicated(rows, ["left", "center", "left"], 2);
    expect(out.rows).toEqual([
      ["H1", "H2", "H3", "H3"],
      ["a", "b", "c", "c"],
      ["d", "e"],
    ]);
    expect(out.alignments).toEqual(["left", "center", "left", "left"]);
    expect(withColumnDuplicated(rows, [], 1).alignments).toEqual(["left", "left", "left"]);
  });

  it("sets one column's alignment, and hands back the same array when nothing changes", () => {
    const aligns = ["left", "center"];
    expect(withAlignment(aligns, 1, "right")).toEqual(["left", "right"]);
    expect(withAlignment(aligns, 3, "center")).toEqual(["left", "center", "left", "center"]);
    expect(withAlignment(aligns, 1, "center")).toBe(aligns);
    expect(withAlignment(aligns, 5, "left")).toBe(aligns);
  });

  describe("dropIndex: the carried copy's leading edge decides", () => {
    const spans: [number, number][] = [
      [0, 40],
      [40, 80],
      [80, 120],
      [120, 160],
    ];
    it("moves one place down once the bottom edge passes the next row's middle", () => {
      expect(dropIndex(spans, 1, 59, 99)).toBe(1);
      expect(dropIndex(spans, 1, 61, 101)).toBe(2);
      expect(dropIndex(spans, 1, 101, 141)).toBe(3);
      expect(dropIndex(spans, 1, 400, 440)).toBe(3);
    });
    it("moves one place up once the top edge passes the previous row's middle", () => {
      expect(dropIndex(spans, 2, 61, 101)).toBe(2);
      expect(dropIndex(spans, 2, 59, 99)).toBe(1);
      expect(dropIndex(spans, 2, -300, -260)).toBe(0);
    });
  });
});
