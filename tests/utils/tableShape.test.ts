import { describe, expect, it } from "vitest";
import { cellAt, moveCell, tableColumnCount, withCell } from "../../src/utils/tableShape";

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
});
