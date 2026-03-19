import { describe, it, expect } from "vitest";
import {
  blocksToMarkdown,
  markdownToBlocks,
  parseTableRow,
  parseFrontmatterYaml,
  parseFrontmatter,
} from "../../src/utils/markdown.js";

// --- blocksToMarkdown ---

describe("blocksToMarkdown", () => {
  it("converts paragraph blocks", () => {
    expect(blocksToMarkdown([{ type: "p", text: "Hello world" }])).toBe("Hello world");
  });

  it("converts h1", () => {
    expect(blocksToMarkdown([{ type: "h1", text: "Title" }])).toBe("# Title");
  });

  it("converts h2", () => {
    expect(blocksToMarkdown([{ type: "h2", text: "Section" }])).toBe("## Section");
  });

  it("converts h3", () => {
    expect(blocksToMarkdown([{ type: "h3", text: "Subsection" }])).toBe("### Subsection");
  });

  it("converts bullet", () => {
    expect(blocksToMarkdown([{ type: "bullet", text: "item" }])).toBe("- item");
  });

  it("converts numbered", () => {
    expect(blocksToMarkdown([{ type: "numbered", text: "step" }])).toBe("1. step");
  });

  it("converts unchecked checkbox", () => {
    expect(blocksToMarkdown([{ type: "checkbox", text: "todo", checked: false }])).toBe(
      "- [ ] todo",
    );
  });

  it("converts checked checkbox", () => {
    expect(blocksToMarkdown([{ type: "checkbox", text: "done", checked: true }])).toBe(
      "- [x] done",
    );
  });

  it("converts spacer", () => {
    expect(blocksToMarkdown([{ type: "spacer", text: "" }])).toBe("---");
  });

  it("converts image with full width", () => {
    expect(blocksToMarkdown([{ type: "image", src: "photo.png", width: 100 }])).toBe(
      "![[photo.png]]",
    );
  });

  it("converts image with custom width", () => {
    expect(blocksToMarkdown([{ type: "image", src: "photo.png", width: 50 }])).toBe(
      "![[photo.png|350]]",
    );
  });

  it("converts file embed", () => {
    expect(blocksToMarkdown([{ type: "file", src: "doc.pdf" }])).toBe("![[doc.pdf]]");
  });

  it("converts frontmatter", () => {
    const result = blocksToMarkdown([{ type: "frontmatter", text: "title: Test" }]);
    expect(result).toBe("---\ntitle: Test\n---");
  });

  it("converts code block", () => {
    const result = blocksToMarkdown([{ type: "code", lang: "js", text: 'console.log("hi")' }]);
    expect(result).toBe('```js\nconsole.log("hi")\n```');
  });

  it("converts code block without language", () => {
    const result = blocksToMarkdown([{ type: "code", lang: "", text: "hello" }]);
    expect(result).toBe("```\nhello\n```");
  });

  it("converts callout", () => {
    const result = blocksToMarkdown([
      {
        type: "callout",
        calloutTypeRaw: "warning",
        calloutFold: "",
        title: "Careful",
        text: "be safe",
      },
    ]);
    expect(result).toBe("> [!warning] Careful\n> be safe");
  });

  it("converts callout with fold", () => {
    const result = blocksToMarkdown([
      { type: "callout", calloutTypeRaw: "note", calloutFold: "+", title: "Click me", text: "" },
    ]);
    expect(result).toBe("> [!note]+ Click me");
  });

  it("converts table", () => {
    const result = blocksToMarkdown([
      {
        type: "table",
        rows: [
          ["A", "B"],
          ["1", "2"],
        ],
      },
    ]);
    expect(result).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  it("handles empty text gracefully", () => {
    expect(blocksToMarkdown([{ type: "p" }])).toBe("");
    expect(blocksToMarkdown([{ type: "h1" }])).toBe("# ");
  });

  it("joins multiple blocks with newlines", () => {
    const result = blocksToMarkdown([
      { type: "h1", text: "Title" },
      { type: "p", text: "Body" },
    ]);
    expect(result).toBe("# Title\nBody");
  });
});

// --- markdownToBlocks ---

describe("markdownToBlocks", () => {
  it("parses paragraph", () => {
    const blocks = markdownToBlocks("Hello world");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("p");
    expect(blocks[0].text).toBe("Hello world");
  });

  it("parses headings", () => {
    const blocks = markdownToBlocks("# H1\n## H2\n### H3");
    expect(blocks[0]).toMatchObject({ type: "h1", text: "H1" });
    expect(blocks[1]).toMatchObject({ type: "h2", text: "H2" });
    expect(blocks[2]).toMatchObject({ type: "h3", text: "H3" });
  });

  it("parses bullet list", () => {
    const blocks = markdownToBlocks("- item 1\n- item 2");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "bullet", text: "item 1" });
    expect(blocks[1]).toMatchObject({ type: "bullet", text: "item 2" });
  });

  it("parses numbered list", () => {
    const blocks = markdownToBlocks("1. first\n2. second");
    expect(blocks[0]).toMatchObject({ type: "numbered", text: "first" });
    expect(blocks[1]).toMatchObject({ type: "numbered", text: "second" });
  });

  it("parses unchecked checkbox", () => {
    const blocks = markdownToBlocks("- [ ] todo");
    expect(blocks[0]).toMatchObject({ type: "checkbox", text: "todo", checked: false });
  });

  it("parses checked checkbox", () => {
    const blocks = markdownToBlocks("- [x] done");
    expect(blocks[0]).toMatchObject({ type: "checkbox", text: "done", checked: true });
  });

  it("parses spacer", () => {
    const blocks = markdownToBlocks("text\n---\nmore");
    expect(blocks[1]).toMatchObject({ type: "spacer" });
  });

  it("parses frontmatter at top", () => {
    const blocks = markdownToBlocks("---\ntitle: Test\nauthor: Me\n---\nContent");
    expect(blocks[0].type).toBe("frontmatter");
    expect(blocks[0].text).toBe("title: Test\nauthor: Me");
    expect(blocks[0].meta).toEqual({ title: "Test", author: "Me" });
    expect(blocks[1]).toMatchObject({ type: "p", text: "Content" });
  });

  it("parses code block", () => {
    const blocks = markdownToBlocks("```js\nconst x = 1;\n```");
    expect(blocks[0]).toMatchObject({ type: "code", lang: "js", text: "const x = 1;" });
  });

  it("parses code block without language", () => {
    const blocks = markdownToBlocks("```\nhello\n```");
    expect(blocks[0]).toMatchObject({ type: "code", lang: "", text: "hello" });
  });

  it("parses callout", () => {
    const blocks = markdownToBlocks("> [!warning] Be careful\n> This is important");
    expect(blocks[0]).toMatchObject({
      type: "callout",
      calloutType: "warning",
      calloutTypeRaw: "warning",
      title: "Be careful",
      text: "This is important",
    });
  });

  it("parses callout with alias", () => {
    const blocks = markdownToBlocks("> [!caution] Watch out");
    expect(blocks[0].calloutType).toBe("warning");
    expect(blocks[0].calloutTypeRaw).toBe("caution");
  });

  it("parses callout with fold", () => {
    const blocks = markdownToBlocks("> [!note]+ Click to expand");
    expect(blocks[0].calloutFold).toBe("+");
  });

  it("parses consecutive callouts separately", () => {
    const blocks = markdownToBlocks("> [!note] First\n> body1\n> [!tip] Second");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].title).toBe("First");
    expect(blocks[1].title).toBe("Second");
  });

  it("parses table", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |";
    const blocks = markdownToBlocks(md);
    expect(blocks[0]).toMatchObject({
      type: "table",
      rows: [
        ["Name", "Age"],
        ["Alice", "30"],
      ],
    });
  });

  it("parses wikilink image embed", () => {
    const blocks = markdownToBlocks("![[photo.png]]");
    expect(blocks[0]).toMatchObject({ type: "image", src: "photo.png" });
  });

  it("parses wikilink image embed with width", () => {
    const blocks = markdownToBlocks("![[photo.png|350]]");
    expect(blocks[0]).toMatchObject({ type: "image", src: "photo.png", width: 50 });
  });

  it("parses wikilink file embed", () => {
    const blocks = markdownToBlocks("![[document.pdf]]");
    expect(blocks[0]).toMatchObject({ type: "file", src: "document.pdf" });
  });

  it("parses markdown image", () => {
    const blocks = markdownToBlocks("![alt text](http://example.com/img.png)");
    expect(blocks[0]).toMatchObject({
      type: "image",
      src: "http://example.com/img.png",
      alt: "alt text",
    });
  });

  it("returns empty paragraph for empty input", () => {
    const blocks = markdownToBlocks("");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("p");
    expect(blocks[0].text).toBe("");
  });

  it("skips leading blank lines", () => {
    const blocks = markdownToBlocks("\n\n\nHello");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("Hello");
  });
});

// --- Round-trip ---

describe("round-trip", () => {
  it("preserves paragraphs", () => {
    const md = "Hello world";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("preserves headings", () => {
    const md = "# Title\n## Section\n### Sub";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("preserves lists", () => {
    const md = "- bullet\n1. numbered\n- [ ] unchecked\n- [x] checked";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("preserves code blocks", () => {
    const md = "```js\nconst x = 1;\nconsole.log(x);\n```";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("preserves callouts", () => {
    const md = "> [!warning] Careful\n> Be safe\n> Very important";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("preserves tables", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("preserves frontmatter", () => {
    const md = "---\ntitle: Test\n---\nContent";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });
});

// --- parseTableRow ---

describe("parseTableRow", () => {
  it("splits cells and trims whitespace", () => {
    expect(parseTableRow("| A | B | C |")).toEqual(["A", "B", "C"]);
  });

  it("handles empty cells", () => {
    expect(parseTableRow("|  |  |")).toEqual(["", ""]);
  });

  it("handles cells with extra whitespace", () => {
    expect(parseTableRow("|  hello  |  world  |")).toEqual(["hello", "world"]);
  });
});

// --- parseFrontmatterYaml ---

describe("parseFrontmatterYaml", () => {
  it("parses key-value pairs", () => {
    expect(parseFrontmatterYaml("title: Hello\nauthor: Me")).toEqual({
      title: "Hello",
      author: "Me",
    });
  });

  it("strips surrounding quotes", () => {
    expect(parseFrontmatterYaml('title: "Quoted"')).toEqual({ title: "Quoted" });
    expect(parseFrontmatterYaml("title: 'Single'")).toEqual({ title: "Single" });
  });

  it("skips lines without colon-space", () => {
    expect(parseFrontmatterYaml("no-colon\ntitle: Yes")).toEqual({ title: "Yes" });
  });

  it("returns empty object for empty string", () => {
    expect(parseFrontmatterYaml("")).toEqual({});
  });
});

// --- parseFrontmatter ---

describe("parseFrontmatter", () => {
  it("parses full frontmatter + body", () => {
    const result = parseFrontmatter("---\ntitle: My Note\nid: abc123\n---\nBody text");
    expect(result).toMatchObject({
      id: "abc123",
      title: "My Note",
      body: "Body text",
    });
  });

  it("returns null for non-frontmatter content", () => {
    expect(parseFrontmatter("Just regular text")).toBeNull();
  });

  it("defaults title to Untitled", () => {
    const result = parseFrontmatter("---\nid: x\n---\nbody");
    expect(result.title).toBe("Untitled");
  });
});
