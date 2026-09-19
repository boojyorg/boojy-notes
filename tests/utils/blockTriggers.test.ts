import { describe, expect, it } from "vitest";
import {
  MAX_TYPED_COLUMNS,
  bareFenceLang,
  bareTableColumns,
  isBareDivider,
  typedFenceLang,
  typedTableColumns,
} from "../../src/utils/blockTriggers";

describe("typedFenceLang", () => {
  // The space is the trigger, as it is for `# `, `- ` and `> `.
  it("takes a fence closed by a space, with or without a language", () => {
    expect(typedFenceLang("``` ")).toBe("");
    expect(typedFenceLang("```js ")).toBe("js");
    expect(typedFenceLang("```rust ")).toBe("rust");
    // Chromium holds a typed trailing space as a non-breaking one.
    expect(typedFenceLang("```js ")).toBe("js");
  });

  it("takes nothing until the space arrives, and nothing from prose", () => {
    expect(typedFenceLang("```")).toBeNull();
    expect(typedFenceLang("```js")).toBeNull();
    expect(typedFenceLang("``")).toBeNull();
    expect(typedFenceLang("use ``` for code ")).toBeNull();
    // A newline or a tab is not the space the rule names.
    expect(typedFenceLang("```js\n")).toBeNull();
    expect(typedFenceLang("```js\t")).toBeNull();
    // The info string is one word: a second one is prose, not a language.
    expect(typedFenceLang("```js title=x ")).toBeNull();
  });
});

describe("bareFenceLang", () => {
  it("takes the fence Enter opens, and only a whole one", () => {
    expect(bareFenceLang("```")).toBe("");
    expect(bareFenceLang("```py")).toBe("py");
    expect(bareFenceLang("```js ")).toBeNull();
    expect(bareFenceLang("x```")).toBeNull();
    expect(bareFenceLang("``")).toBeNull();
  });
});

describe("isBareDivider", () => {
  // CommonMark's thematic break is three dashes or more, so a longer run is
  // the same divider rather than something else.
  it("is any run of three dashes or more, alone", () => {
    expect(isBareDivider("---")).toBe(true);
    expect(isBareDivider("----------")).toBe(true);
    expect(isBareDivider("--")).toBe(false);
    expect(isBareDivider("--- ")).toBe(false);
    expect(isBareDivider("--- x")).toBe(false);
    expect(isBareDivider("- - -")).toBe(false);
  });
});

describe("typedTableColumns", () => {
  // A row of N cells is written with N+1 pipes, which is why ||| has always
  // meant two columns: the pipes are the row being drawn.
  it("reads the pipes as the row they draw", () => {
    expect(typedTableColumns("||| ")).toBe(2);
    expect(typedTableColumns("|||| ")).toBe(3);
    expect(typedTableColumns("||||| ")).toBe(4);
    expect(typedTableColumns("||| ")).toBe(2);
  });

  it("clamps a long run to what the column can show", () => {
    expect(typedTableColumns(`${"|".repeat(30)} `)).toBe(MAX_TYPED_COLUMNS);
  });

  it("takes nothing from two pipes, prose, or a run with no space", () => {
    expect(typedTableColumns("|| ")).toBeNull();
    expect(typedTableColumns("|||")).toBeNull();
    expect(typedTableColumns("a ||| ")).toBeNull();
    expect(typedTableColumns("| a | b | ")).toBeNull();
  });
});

describe("bareTableColumns", () => {
  it("is the Enter form, and takes only a whole run", () => {
    expect(bareTableColumns("|||")).toBe(2);
    expect(bareTableColumns("|||||")).toBe(4);
    expect(bareTableColumns("||| ")).toBeNull();
    expect(bareTableColumns("||")).toBeNull();
  });
});
