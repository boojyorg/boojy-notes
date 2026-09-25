import { describe, expect, it } from "vitest";
import {
  alignedRow,
  alignedSeparator,
  columnWidths,
  displayWidth,
  isAligned,
  neededWidths,
  pipeColumns,
  separatorStyle,
} from "../../src/utils/tableAlign";

describe("tableAlign — tables with their pipes lined up", () => {
  it("measures text in monospace columns: wide scripts and emoji take two", () => {
    expect(displayWidth("tea")).toBe(3);
    expect(displayWidth("日本語")).toBe(6);
    expect(displayWidth("한글")).toBe(4);
    expect(displayWidth("🍵")).toBe(2);
    expect(displayWidth("👩‍💻")).toBe(2);
    expect(displayWidth("café")).toBe(4);
    expect(displayWidth("é")).toBe(1);
  });

  it("finds a row's cell pipes, an escaped pipe being text", () => {
    expect(pipeColumns("| a | b |")).toEqual([0, 4, 8]);
    expect(pipeColumns("| a \\| b | c |")).toEqual([0, 9, 13]);
    expect(pipeColumns("  | a | b |")).toBeNull();
    expect(pipeColumns("| a | b")).toBeNull();
  });

  it("calls a table aligned only when every line's pipes stand at the same columns", () => {
    expect(isAligned(["| a   | b   |", "| --- | --- |", "| 1   | 2   |"])).toBe(true);
    expect(isAligned(["| 日本 | b   |", "| ---- | --- |", "| ab   | 2   |"])).toBe(true);
    expect(isAligned(["| a | b |", "| --- | --- |", "| 1 | 2 |"])).toBe(false);
    expect(isAligned(["| a |", "| --- |"])).toBe(false);
  });

  it("reads a table's widths and separator style as written", () => {
    expect(columnWidths("| Name    | Amount |")).toEqual([7, 6]);
    expect(separatorStyle("|:--------|-------:|", [":--------", "-------:"])).toEqual({
      spaced: false,
      explicitLeft: [true, false],
    });
    expect(separatorStyle("| --- | --- |", ["---", "---"]).spaced).toBe(true);
  });

  it("pads cells as their column is aligned, and a short row stays short", () => {
    const widths = neededWidths([["a", "bb", "c"], ["dddd"]], [], ["left", "right", "center"]);
    expect(widths).toEqual([4, 4, 5]);
    expect(alignedRow(["a", "bb", "c"], widths, ["left", "right", "center"])).toBe(
      "| a    |   bb |   c   |",
    );
    expect(alignedRow(["dddd"], widths, [])).toBe("| dddd |");
    expect(alignedSeparator(widths, ["left", "right", "center"])).toBe("| ---- | ---: | :---: |");
    expect(alignedSeparator([4], ["left"], { spaced: false, explicitLeft: [true] })).toBe(
      "|:-----|",
    );
  });

  it("never narrows a column below the width it is written at", () => {
    expect(neededWidths([["a"]], [9])).toEqual([9]);
  });
});
