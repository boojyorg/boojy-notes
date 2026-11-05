import { describe, expect, it } from "vitest";
import { blockSubpath, findBlockTarget, trailingBlockId } from "../../src/utils/blockTarget";

const p = (text: string) => ({ type: "p", text });

describe("blockSubpath", () => {
  it("reads a block ID, never a heading", () => {
    expect(blockSubpath("^first-block")).toBe("first-block");
    expect(blockSubpath("Tables")).toBeNull();
    expect(blockSubpath("^two words")).toBeNull();
    expect(blockSubpath(null)).toBeNull();
  });
});

describe("trailingBlockId", () => {
  it("is an ID after whitespace, last in the paragraph", () => {
    expect(trailingBlockId("Has an ID. ^first-block")).toBe("first-block");
    expect(trailingBlockId("Soft break\n^on-next-line")).toBe("on-next-line");
    expect(trailingBlockId("Trailing space ^abc  ")).toBe("abc");
  });
  it("is nothing mid-text, glued to a word, escaped or alone", () => {
    expect(trailingBlockId("An ^abc in the middle")).toBeNull();
    expect(trailingBlockId("word^abc")).toBeNull();
    expect(trailingBlockId("\\^abc")).toBeNull();
    expect(trailingBlockId("^abc")).toBeNull();
  });
});

describe("findBlockTarget", () => {
  it("finds a paragraph by the ID at its end, ignoring case", () => {
    const blocks = [{ type: "h2", text: "Links" }, p("One."), p("Two. ^First-Block")];
    expect(findBlockTarget(blocks, "first-block")).toEqual({ start: 2, end: 3 });
  });

  it("finds a heading by its ID", () => {
    expect(findBlockTarget([p("x"), { type: "h2", text: "Tables ^tbl" }], "tbl")).toEqual({
      start: 1,
      end: 2,
    });
  });

  it("gives a list item its nested items, never its parent", () => {
    const blocks = [
      { type: "bullet", text: "Parent", indent: 0 },
      { type: "bullet", text: "Child ^kid", indent: 1 },
      { type: "bullet", text: "Grandchild", indent: 2 },
      { type: "bullet", text: "Sibling", indent: 0 },
    ];
    expect(findBlockTarget(blocks, "kid")).toEqual({ start: 1, end: 3 });
  });

  it("an ID alone after a list names the whole list, past an empty row", () => {
    const blocks = [
      p("Intro"),
      { type: "bullet", text: "One", indent: 0 },
      { type: "bullet", text: "Two", indent: 1 },
      { type: "numbered", text: "Three", indent: 0 },
      p(""),
      p("^whole-list"),
    ];
    expect(findBlockTarget(blocks, "whole-list")).toEqual({ start: 1, end: 4 });
  });

  it("an ID alone after a table or quote names it", () => {
    const table = { type: "table", rows: [["a", "b"]], text: "" };
    expect(findBlockTarget([p("x"), table, p("^t")], "t")).toEqual({ start: 1, end: 2 });
    const quote = { type: "blockquote", text: "q" };
    expect(findBlockTarget([quote, quote, p("^q")], "q")).toEqual({ start: 0, end: 2 });
  });

  it("finds an ID inside a table cell or a callout", () => {
    const table = { type: "table", rows: [["a", "b ^cell"]], text: "" };
    expect(findBlockTarget([table], "cell")).toEqual({ start: 0, end: 1 });
    const callout = { type: "callout", title: "Note", text: "First.\n\nSecond ^inside" };
    expect(findBlockTarget([p("x"), callout], "inside")).toEqual({ start: 1, end: 2 });
  });

  it("never reads code, and the later of two wins", () => {
    expect(findBlockTarget([{ type: "code", text: "x ^c" }], "c")).toBeNull();
    expect(findBlockTarget([p("A ^d"), p("B ^d")], "d")).toEqual({ start: 1, end: 2 });
  });

  it("is null for a missing ID or an ID alone with nothing before it", () => {
    expect(findBlockTarget([p("No ID here.")], "nope")).toBeNull();
    expect(findBlockTarget([p("^lonely")], "lonely")).toBeNull();
  });
});
