import { describe, expect, it } from "vitest";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown.js";

/** The blocks as `type label? "text"`, without ids or the final newline's row. */
const outline = (md) =>
  markdownToBlocks(md)
    .filter((b, i, all) => !(i === all.length - 1 && b.type === "p" && b.text === ""))
    .map((b) => `${b.type}${b.label ? ` ${b.label}` : ""} ${JSON.stringify(b.text)}`);

const roundTrip = (md) => expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);

describe("a footnote definition is its own block", () => {
  it("reads the label and the text", () => {
    const md = "Created in 2004.[^1]\n\n[^1]: By John Gruber.\n";
    expect(outline(md)).toEqual(['p "Created in 2004.[^1]"', 'footnote 1 "By John Gruber."']);
    roundTrip(md);
  });

  it("two definitions on adjacent lines are two blocks", () => {
    const md = "Alpha.[^a] Beta.[^b]\n\n[^a]: Definition A.\n[^b]: Definition B.\n";
    expect(outline(md)).toEqual([
      'p "Alpha.[^a] Beta.[^b]"',
      'footnote a "Definition A."',
      'footnote b "Definition B."',
    ]);
    roundTrip(md);
  });

  it("a reference-link line beside one stays text, the footnote its own block", () => {
    const md = "A [link][x] and a note.[^r]\n\n[x]: https://example.com\n[^r]: The footnote.\n";
    expect(outline(md)).toEqual([
      'p "A [link][x] and a note.[^r]"',
      'p "[x]: https://example.com"',
      'footnote r "The footnote."',
    ]);
    roundTrip(md);
  });

  it("a line under it with no blank between is its text (lazy or indented)", () => {
    const md = "[^lazy]: First line.\nSecond line, no indent.\n  Third, two spaces.\n";
    expect(outline(md)).toEqual([
      'footnote lazy "First line.\\nSecond line, no indent.\\n  Third, two spaces."',
    ]);
    roundTrip(md);
  });

  it("an empty definition absorbs nothing", () => {
    const md = "[^e]:\nNext line.\n";
    expect(outline(md)).toEqual(['footnote e ""', 'p "Next line."']);
    roundTrip(md);
  });

  it("keeps its spelling: indent, the gap after the colon, trailing space", () => {
    for (const md of [
      "   [^x]: three spaces in\n",
      "[^x]:\ttab\n",
      "[^x]:  two\n",
      "[^x]:no space\n",
      "[^x]: trail  \n",
    ]) {
      expect(markdownToBlocks(md)[0].type).toBe("footnote");
      roundTrip(md);
    }
  });

  it("four spaces in is no definition", () => {
    expect(markdownToBlocks("    [^x]: code\n")[0].type).toBe("p");
  });

  it("a label with a space is no definition", () => {
    expect(outline("[^my note]: Label has a space.\n")).toEqual([
      'p "[^my note]: Label has a space."',
    ]);
  });

  it("a continuation paragraph after a blank line stays its own block, bytes kept", () => {
    const md =
      "[^long]: First.\n\n    Second, four spaces.\n\n  Third, two spaces.\n\nBack in the note.\n";
    expect(outline(md)).toEqual([
      'footnote long "First."',
      'p "    Second, four spaces."',
      'p "  Third, two spaces."',
      'p "Back in the note."',
    ]);
    roundTrip(md);
  });
});

describe("what the app writes reads back as what it wrote", () => {
  const block = (fields) => ({ id: "f", type: "footnote", label: "1", text: "", ...fields });

  it("a new definition", () => {
    const md = blocksToMarkdown([block({ text: "A note." })]);
    expect(md).toBe("[^1]: A note.");
    expect(markdownToBlocks(md)[0]).toMatchObject({
      type: "footnote",
      label: "1",
      text: "A note.",
    });
  });

  it("two new definitions are written with a blank line between", () => {
    expect(
      blocksToMarkdown([block({ text: "One." }), block({ id: "g", label: "2", text: "Two." })]),
    ).toBe("[^1]: One.\n\n[^2]: Two.");
  });

  it("a paragraph under a definition is kept apart by a blank line", () => {
    const md = blocksToMarkdown([block({ text: "Note." }), { id: "p", type: "p", text: "After." }]);
    expect(md).toBe("[^1]: Note.\n\nAfter.");
  });

  it("a soft-broken line that would open a definition is written escaped", () => {
    const md = blocksToMarkdown([{ id: "p", type: "p", text: "First.\n[^2]: not a footnote" }]);
    expect(md).toBe("First.\n\\[^2]: not a footnote");
    expect(markdownToBlocks(md).map((b) => b.type)).toEqual(["p"]);
  });

  it("a soft-broken line in a definition that would open another is written escaped", () => {
    const md = blocksToMarkdown([block({ text: "One.\n[^2]: inside" })]);
    expect(md).toBe("[^1]: One.\n\\[^2]: inside");
    expect(markdownToBlocks(md).map((b) => b.type)).toEqual(["footnote"]);
  });
});
