import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown.js";
import {
  bullet,
  checkbox,
  codeBlock,
  heading,
  numbered,
  paragraph,
  spacer,
} from "../mocks/blocks.js";

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN INTEROPERABILITY
//
// The third contract, beside the other two:
//   - tests/utils/markdown.test.js      block → markdown → block (what Boojy
//                                        Notes creates survives its own reader)
//   - tests/utils/preservation.test.js  markdown → blocks → markdown, byte for
//                                        byte (did we alter the source?)
//   - THIS FILE                          what does the Markdown MEAN outside
//                                        Boojy Notes?
//
// The oracle is markdown-it, an independent parser that passes the CommonMark
// spec suite and reads GFM tables. src/utils/markdown.js is never the oracle;
// that would test the app against itself. Meaning is compared as a compact
// outline of the parser's block structure and text (see `meaningOf`), so
// whitespace that carries no meaning cannot cause a false alarm, and a change
// of meaning cannot hide.
//
// Three questions, per fixture and per authored case:
//   1. What does a conventional parser make of the source? Recorded in the
//      sibling `<name>.meaning.txt` (a file snapshot, reviewed like code).
//   2. After Boojy Notes loads and saves it, does the file still mean that?
//   3. Does Markdown Boojy Notes AUTHORS from its own blocks mean what the
//      blocks meant on screen?
//
// KNOWN MISMATCHES are marked with it.fails, narrowly, so the oracle is not
// weakened and the suite stays green while the gap is on record; the moment
// the behaviour changes the marked test turns red and the mark comes off.
// This layer is evidence for the paragraph decision, not the decision.
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "interop",
);

const md = new MarkdownIt("commonmark").enable("table");

/** Inline children as the reader sees them: text, `\n` for a soft break, `⏎` for a hard one. */
function inlineText(children) {
  let out = "";
  for (const t of children ?? []) {
    if (t.type === "text" || t.type === "code_inline") out += t.content;
    else if (t.type === "softbreak") out += "\n";
    else if (t.type === "hardbreak") out += "⏎";
    else if (t.children) out += inlineText(t.children);
  }
  return out;
}

/**
 * A compact outline of what the oracle parsed: one line per block, nested by
 * two spaces, text quoted. This is the unit of comparison for every test here.
 */
function meaningOf(source) {
  const lines = [];
  let depth = 0;
  const tokens = md.parse(source, {});
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const pad = "  ".repeat(depth);
    if (t.nesting === -1) {
      depth--;
      continue;
    }
    switch (t.type) {
      case "paragraph_open":
        lines.push(`${pad}paragraph ${JSON.stringify(inlineText(tokens[i + 1].children))}`);
        i += 2; // inline + paragraph_close
        break;
      case "heading_open":
        lines.push(`${pad}${t.tag} ${JSON.stringify(inlineText(tokens[i + 1].children))}`);
        i += 2;
        break;
      case "bullet_list_open":
        lines.push(`${pad}bullet list`);
        depth++;
        break;
      case "ordered_list_open":
        lines.push(`${pad}ordered list${t.attrGet("start") ? ` start=${t.attrGet("start")}` : ""}`);
        depth++;
        break;
      case "list_item_open":
        lines.push(`${pad}item`);
        depth++;
        break;
      case "blockquote_open":
        lines.push(`${pad}blockquote`);
        depth++;
        break;
      case "fence":
        lines.push(
          `${pad}code${t.info ? ` lang=${t.info.trim()}` : ""} ${JSON.stringify(t.content)}`,
        );
        break;
      case "code_block":
        lines.push(`${pad}indented code ${JSON.stringify(t.content)}`);
        break;
      case "hr":
        lines.push(`${pad}thematic break`);
        break;
      case "table_open":
        lines.push(`${pad}table`);
        depth++;
        break;
      case "thead_open":
      case "tbody_open":
        depth++;
        break;
      case "tr_open":
        lines.push(`${pad}row`);
        depth++;
        break;
      case "th_open":
      case "td_open":
        lines.push(
          `${pad}${t.type === "th_open" ? "header" : "cell"} ${JSON.stringify(inlineText(tokens[i + 1].children))}`,
        );
        i += 2;
        break;
      case "html_block":
        lines.push(`${pad}html ${JSON.stringify(t.content)}`);
        break;
      default:
        if (t.nesting === 1) depth++;
        else lines.push(`${pad}${t.type}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** The exact desktop save path: what reaches disk after a load → save cycle. */
const saveCycle = (source) => blocksToMarkdown(markdownToBlocks(source));

const fixtures = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

describe("interop — the conventional meaning of Markdown written elsewhere", () => {
  for (const name of fixtures) {
    const source = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf-8");
    const meaningFile = path.join(FIXTURES_DIR, name.replace(/\.md$/, ".meaning.txt"));

    it(`${name}: the recorded meaning is what a conventional parser reads`, async () => {
      await expect(meaningOf(source)).toMatchFileSnapshot(meaningFile);
    });

    it(`${name}: after a Boojy Notes load → save cycle it still means the same`, () => {
      expect(meaningOf(saveCycle(source))).toBe(meaningOf(source));
    });
  }

  // ── On record ─────────────────────────────────────────────────────────────
  // A `---` directly under a paragraph line is a setext heading underline to a
  // conventional reader. Boojy Notes reads a divider, as it always has, and its
  // first save now writes the blank line that makes the file mean a divider
  // everywhere. Reading the tight form as a heading instead is a spec decision
  // on the backlog; until then the change of meaning is narrow and explicit.
  it.fails("`---` tight under a paragraph means a heading outside and a divider inside (KNOWN MISMATCH)", () => {
    const tight = "hello\n---\nworld\n";
    expect(meaningOf(saveCycle(tight))).toBe(meaningOf(tight));
  });
});

describe("interop — Markdown Boojy Notes authors from its own blocks", () => {
  const authored = (blocks) => meaningOf(blocksToMarkdown(blocks));

  // ── The paragraph model ───────────────────────────────────────────────────
  // Blocks are Markdown structure: two paragraph blocks are written with a
  // blank line between them, a two-line paragraph is one block, and a
  // paragraph after a list item is separated from it.
  it("two paragraph blocks mean two paragraphs outside Boojy Notes", () => {
    expect(authored([paragraph("First paragraph."), paragraph("Second paragraph.")])).toBe(
      'paragraph "First paragraph."\nparagraph "Second paragraph."\n',
    );
  });

  it("one paragraph written over two lines is one block on screen", () => {
    const blocks = markdownToBlocks("Line one\nline two continues the same paragraph.\n");
    const paragraphBlocks = blocks.filter((b) => b.type === "p" && b.text !== "");
    expect(paragraphBlocks).toHaveLength(1);
  });

  it("a paragraph block after a list is a paragraph, not part of the item", () => {
    expect(authored([bullet("an item"), paragraph("A paragraph after the list.")])).toBe(
      'bullet list\n  item\n    paragraph "an item"\nparagraph "A paragraph after the list."\n',
    );
  });

  // A divider block is written with a blank line before it after a paragraph
  // or a list item; without one, `---` under a paragraph line is a setext
  // heading underline, and the paragraph becomes a heading with no rule at all.
  it("a divider block after a paragraph is a thematic break, not a heading underline", () => {
    expect(authored([paragraph("Before."), spacer(), paragraph("After.")])).toBe(
      'paragraph "Before."\nthematic break\nparagraph "After."\n',
    );
  });

  it("a divider block after a list item ends the list and is a thematic break", () => {
    expect(authored([bullet("item"), spacer(), paragraph("After.")])).toBe(
      'bullet list\n  item\n    paragraph "item"\nthematic break\nparagraph "After."\n',
    );
  });

  // ── On record: the one place meaning and bytes still disagree ─────────────
  // A paragraph block straight after a quote block is written on the next
  // line, which a conventional reader folds into the quote. Writing a blank
  // line there would be right for authored notes, but a lazy line read from a
  // file is stored as its own paragraph (a quote's lines are written with a
  // `> ` prefix, so it cannot join the block without changing the bytes on
  // save), and that paragraph must be written back without a blank line.
  // Resolving this needs a decision on how a quote remembers a lazy line;
  // until then the gap is narrow and explicit.
  it.fails("a paragraph block after a quote is a paragraph, not part of the quote (KNOWN MISMATCH)", () => {
    expect(
      authored([{ id: "q", type: "blockquote", text: "quoted" }, paragraph("After the quote.")]),
    ).toBe('blockquote\n  paragraph "quoted"\nparagraph "After the quote."\n');
  });

  // ── What already means the right thing ────────────────────────────────────
  it("an empty paragraph block between two paragraphs separates them", () => {
    expect(authored([paragraph("First."), paragraph(""), paragraph("Second.")])).toBe(
      'paragraph "First."\nparagraph "Second."\n',
    );
  });

  it("headings, then a paragraph, then lists, each keep their meaning", () => {
    expect(
      authored([
        heading(1, "Title"),
        paragraph("Intro under the heading."),
        heading(2, "Section"),
        bullet("one"),
        bullet("two"),
        heading(3, "Steps"),
        numbered("first"),
        numbered("second"),
      ]),
    ).toBe(
      [
        'h1 "Title"',
        'paragraph "Intro under the heading."',
        'h2 "Section"',
        "bullet list",
        "  item",
        '    paragraph "one"',
        "  item",
        '    paragraph "two"',
        'h3 "Steps"',
        "ordered list",
        "  item",
        '    paragraph "first"',
        "  item",
        '    paragraph "second"',
      ].join("\n") + "\n",
    );
  });

  it("a checklist is a bullet list whose items carry the box as text", () => {
    expect(authored([checkbox("todo", false), checkbox("done", true)])).toBe(
      'bullet list\n  item\n    paragraph "[ ] todo"\n  item\n    paragraph "[x] done"\n',
    );
  });

  it("an indented bullet nests under the one above", () => {
    expect(authored([bullet("parent"), { ...bullet("child"), indent: 1 }, bullet("sibling")])).toBe(
      [
        "bullet list",
        "  item",
        '    paragraph "parent"',
        "    bullet list",
        "      item",
        '        paragraph "child"',
        "  item",
        '    paragraph "sibling"',
      ].join("\n") + "\n",
    );
  });

  it("a code block keeps its language and its blank lines, and a paragraph follows it", () => {
    expect(
      authored([
        paragraph("Before."),
        codeBlock("const a = 1;\n\nconsole.log(a);", "js"),
        paragraph("After."),
      ]),
    ).toBe(
      'paragraph "Before."\ncode lang=js "const a = 1;\\n\\nconsole.log(a);\\n"\nparagraph "After."\n',
    );
  });

  it("a quote block is a blockquote holding one paragraph", () => {
    expect(authored([{ id: "q", type: "blockquote", text: "quoted\nand continued" }])).toBe(
      'blockquote\n  paragraph "quoted\\nand continued"\n',
    );
  });
});
