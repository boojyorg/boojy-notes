import { describe, expect, it } from "vitest";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown";
import { blockOffsetFor, paintMarkdown, sourceOffsetFor } from "../../src/utils/sourceView";

const NOTE = [
  "---",
  "tags: [uni]",
  "---",
  "",
  "# Term prep",
  "",
  "Things to get through before term starts:",
  "",
  "- The Design of Everyday Things",
  "- Shape Up — see [[Todd's Note]]",
  "  - chapters 1–4",
  "- [ ] Book the library room #admin",
  "- [x] Renew **library card**",
  "",
  "> Read slowly. Take notes by hand.",
  "",
  "```js",
  'const due = "2026-10-01";',
  "```",
].join("\n");

const read = (md: string) => markdownToBlocks(md) as { id: string; type: string; text?: string }[];
/** The block whose text is `text`, by index. */
const indexOf = (blocks: { text?: string }[], text: string) =>
  blocks.findIndex((b) => b.text === text);

describe("the note's file text", () => {
  it("is what the writer writes, so the Markdown view shows the file", () => {
    // The fixture is written the way the app writes it, so reading and
    // writing it gives it back: the view opens on the bytes on disk.
    expect(blocksToMarkdown(read(NOTE))).toBe(NOTE);
  });
});

describe("sourceOffsetFor", () => {
  const blocks = read(NOTE);

  it("puts the caret on the same character when the block's text is written as shown", () => {
    const i = indexOf(blocks, "Term prep");
    const at = sourceOffsetFor(NOTE, blocks, i, 4);
    expect(NOTE.slice(at, at + 5)).toBe(" prep");
    const item = indexOf(blocks, "chapters 1–4");
    const inItem = sourceOffsetFor(NOTE, blocks, item, 0);
    expect(NOTE.slice(inItem - 4, inItem)).toBe("  - ");
  });

  it("enters text holding inline Markdown at its start, since the views count differently", () => {
    // Nine characters into "Renew library card" as shown is not nine into
    // "Renew **library card**" as written.
    const i = indexOf(blocks, "Renew **library card**");
    const at = sourceOffsetFor(NOTE, blocks, i, 9);
    expect(NOTE.slice(at - 6, at + 5)).toBe("- [x] Renew");
    const code = blocks.findIndex((b) => b.type === "code");
    const fence = sourceOffsetFor(NOTE, blocks, code, 3);
    expect(NOTE.slice(fence, fence + 5)).toBe("```js");
  });

  it("clamps an offset past the block's end", () => {
    const i = indexOf(blocks, "Term prep");
    const at = sourceOffsetFor(NOTE, blocks, i, 999);
    expect(NOTE.slice(at - 4, at + 1)).toBe("prep\n");
  });
});

describe("blockOffsetFor", () => {
  const blocks = read(NOTE);

  it("finds the block an offset is in, and the character within it", () => {
    const at = NOTE.indexOf("Everyday");
    const found = blockOffsetFor(NOTE, blocks, at);
    expect(blocks[found!.index].text).toBe("The Design of Everyday Things");
    expect(found!.offset).toBe("The Design of ".length);
  });

  it("is the inverse of sourceOffsetFor for every text block", () => {
    const plain = ["p", "h1", "bullet", "checkbox", "blockquote"];
    blocks.forEach((b, i) => {
      if (!plain.includes(b.type) || !b.text || /[*[\]]/.test(b.text)) return;
      const at = sourceOffsetFor(NOTE, blocks, i, 2);
      expect(blockOffsetFor(NOTE, blocks, at)).toEqual({ index: i, offset: 2 });
    });
  });

  it("answers the first block at the top and the last at the end", () => {
    expect(blockOffsetFor(NOTE, blocks, 0)?.index).toBe(0);
    expect(blockOffsetFor(NOTE, blocks, NOTE.length)?.index).toBe(blocks.length - 1);
    expect(blockOffsetFor("", [], 0)).toBeNull();
  });
});

describe("paintMarkdown", () => {
  const text = (html: string) =>
    html
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/​$/, "");
  const marks = (html: string) =>
    [...html.matchAll(/<span class="md-mark">([^<]*)<\/span>/g)].map((m) => m[1]);

  it("draws every character as written, nothing hidden or added", () => {
    expect(text(paintMarkdown(NOTE))).toBe(NOTE);
    const odd = "a < b & c > d\n\n**unclosed\n`code **not bold**`\n";
    expect(text(paintMarkdown(odd))).toBe(odd);
  });

  it("mutes the markers and leaves the words in the text's ink", () => {
    const html = paintMarkdown(NOTE);
    expect(marks(html)).toEqual(
      expect.arrayContaining([
        "---",
        "# ",
        "- ",
        "  - ",
        "- [ ] ",
        "- [x] ",
        "**",
        "[[",
        "]]",
        "&gt; ",
        "```js",
        "```",
      ]),
    );
    expect(html).toContain('<span class="md-meta">tags: [uni]</span>');
    expect(html).toContain('<span class="md-strong">Term prep</span>');
    expect(html).toContain('<span class="md-strong">library card</span>');
  });

  it("leaves code alone, in a fence and between backticks", () => {
    const html = paintMarkdown("```\n# not a heading\n**x**\n```\nsee `**raw**` here");
    expect(html).toContain("\n# not a heading\n**x**\n");
    expect(marks(html)).toEqual(["```", "```", "`", "`"]);
  });

  it("keeps a word's underscore and a link's address muted", () => {
    const html = paintMarkdown("snake_case and _em_ and [text](https://a.b/c_(d))");
    expect(text(html)).toBe("snake_case and _em_ and [text](https://a.b/c_(d))");
    expect(marks(html)).toEqual(["_", "_", "[", "](https://a.b/c_(d))"]);
  });

  it("gives a final empty line its height", () => {
    expect(paintMarkdown("a\n").endsWith("\n​")).toBe(true);
    expect(paintMarkdown("a")).toBe("a");
  });
});
