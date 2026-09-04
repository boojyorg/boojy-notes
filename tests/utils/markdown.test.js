import { describe, it, expect } from "vitest";
import {
  applyEol,
  blocksToMarkdown,
  detectEol,
  markdownToBlocks,
  parseTableRow,
} from "../../src/utils/markdown.js";

// ─────────────────────────────────────────────────────────────────────────────
// ROUND-TRIP GUARDRAIL
//
// This is the load-bearing enforcement of the "markdown is the source of truth"
// constraint (docs/SPEC-markdown-source-of-truth.md). Every block MUST survive
// block → markdown → block losslessly. If you add a block type (or change a
// serializer) and it can't round-trip, this test goes red — that is the gate.
//
// Where a loss is *intrinsic to markdown* (a `file` block has no place to store
// byte-size in `![[...]]`; a custom image `alt` can't survive wikilink syntax),
// we assert the DOCUMENTED lossy behaviour explicitly rather than letting it pass
// silently. Those cases live in the "intrinsic, documented losses" block below.
// ─────────────────────────────────────────────────────────────────────────────

/** Drop the `id` field — originals use genBlockId, the parser mints `md-N`. */
const stripIds = (blocks) => blocks.map(({ id, ...rest }) => rest);

/** blocks → markdown → blocks, ids stripped, ready for deep-equal. */
const roundTrip = (blocks) => stripIds(markdownToBlocks(blocksToMarkdown(blocks)));

// One representative, fixture for each lossless type. Each object is written to
// EXACTLY match what markdownToBlocks emits, so a clean round-trip deep-equals it.
const LOSSLESS_CASES = [
  ["paragraph", [{ type: "p", text: "Just a plain paragraph." }]],
  ["h1", [{ type: "h1", text: "Heading one" }]],
  ["h2", [{ type: "h2", text: "Heading two" }]],
  ["h3", [{ type: "h3", text: "Heading three" }]],
  ["bullet", [{ type: "bullet", text: "a bullet" }]],
  ["bullet (indented)", [{ type: "bullet", text: "nested bullet", indent: 2 }]],
  ["numbered", [{ type: "numbered", text: "first item", num: 1 }]],
  ["numbered (indented)", [{ type: "numbered", text: "sub item", indent: 1, num: 1 }]],
  [
    "numbered (explicit non-1 start survives)",
    [
      { type: "numbered", text: "third", num: 3 },
      { type: "numbered", text: "fourth", num: 4 },
    ],
  ],
  ["checkbox unchecked", [{ type: "checkbox", text: "todo", checked: false }]],
  ["checkbox checked", [{ type: "checkbox", text: "done", checked: true }]],
  ["checkbox (indented)", [{ type: "checkbox", text: "sub task", checked: false, indent: 1 }]],
  // spacer must NOT be the first block (a leading `---` parses as frontmatter),
  // so it carries a preceding paragraph for context.
  [
    "spacer (non-first)",
    [
      { type: "p", text: "before the rule" },
      { type: "spacer", text: "" },
    ],
  ],
  [
    "image (default width)",
    [{ type: "image", src: "photo.png", alt: "photo", width: 100, text: "" }],
  ],
  [
    "image (scaled width)",
    [{ type: "image", src: "photo.png", alt: "photo", width: 50, text: "" }],
  ],
  [
    "image (standard markdown format keeps alt + syntax)",
    [
      {
        type: "image",
        src: "https://example.com/chart.png",
        alt: "A chart",
        width: 100,
        text: "",
        format: "md",
      },
    ],
  ],
  [
    "image (standard markdown format, scaled)",
    [
      {
        type: "image",
        src: "https://example.com/chart.png",
        alt: "A chart",
        width: 50,
        text: "",
        format: "md",
      },
    ],
  ],
  ["file", [{ type: "file", src: "report.pdf", filename: "report.pdf", size: null, text: "" }]],
  [
    "frontmatter (first)",
    [
      {
        type: "frontmatter",
        text: "title: My Note\nwords: 5",
        meta: { title: "My Note", words: "5" },
      },
    ],
  ],
  ["code (no lang)", [{ type: "code", lang: "", text: "plain code\nsecond line" }]],
  ["code (with lang)", [{ type: "code", lang: "js", text: "const x = 1;" }]],
  // body containing a fence forces a longer outer fence in blocksToMarkdown
  ["code (body contains a fence)", [{ type: "code", lang: "", text: "```\nnested fence\n```" }]],
  // a lone 4-backtick line used to match the outer 4-backtick fence and close
  // the block early, exploding the rest into paragraphs (audit P0)
  [
    "code (body contains a 4-backtick fence)",
    [{ type: "code", lang: "", text: "````\ninner code\n````" }],
  ],
  ["blockquote (single line)", [{ type: "blockquote", text: "a quote" }]],
  ["blockquote (multi line)", [{ type: "blockquote", text: "line one\nline two" }]],
  [
    "callout",
    [
      {
        type: "callout",
        calloutType: "tip",
        calloutTypeRaw: "tip",
        calloutFold: "-",
        title: "Heads up",
        text: "body one\nbody two",
      },
    ],
  ],
  [
    "table (mixed alignments)",
    [
      {
        type: "table",
        rows: [
          ["Name", "Score"],
          ["Ada", "100"],
        ],
        alignments: ["left", "center"],
        text: "",
      },
    ],
  ],
  ["embed (no heading)", [{ type: "embed", target: "Some Note", heading: null, text: "" }]],
  ["embed (with heading)", [{ type: "embed", target: "Some Note", heading: "Section", text: "" }]],
];

describe("markdown round-trip — per block type (lossless)", () => {
  it.each(LOSSLESS_CASES)("round-trips %s without loss", (_name, blocks) => {
    expect(roundTrip(blocks)).toEqual(blocks);
  });
});

describe("markdown round-trip — multi-block adjacency", () => {
  it("keeps two callouts separate (does not merge)", () => {
    const blocks = [
      {
        type: "callout",
        calloutType: "tip",
        calloutTypeRaw: "tip",
        calloutFold: "",
        title: "First",
        text: "alpha",
      },
      {
        type: "callout",
        calloutType: "note",
        calloutTypeRaw: "note",
        calloutFold: "",
        title: "Second",
        text: "beta",
      },
    ];
    const result = roundTrip(blocks);
    expect(result).toHaveLength(2);
    expect(result).toEqual(blocks);
  });

  it("preserves bullet → paragraph → bullet boundaries", () => {
    const blocks = [
      { type: "bullet", text: "one" },
      { type: "p", text: "a paragraph between" },
      { type: "bullet", text: "two" },
    ];
    const result = roundTrip(blocks);
    expect(result).toHaveLength(3);
    expect(result).toEqual(blocks);
  });
});

describe("markdown round-trip — full document", () => {
  // A realistic note touching most block types. Ordering is deliberate:
  // quote-like blocks (blockquote/callout) are separated by paragraphs so the
  // parser's `>` look-ahead can't slurp the next block into the previous one,
  // and tables/quotes are never directly adjacent. This mirrors how real notes
  // look and is the strongest single assertion of the constraint.
  const DOC = [
    {
      type: "frontmatter",
      text: "title: Trip Notes\nwords: 42",
      meta: { title: "Trip Notes", words: "42" },
    },
    { type: "h1", text: "Trip Notes" },
    { type: "p", text: "An overview of the journey." },
    { type: "h2", text: "Checklist" },
    { type: "bullet", text: "Pack bags" },
    { type: "bullet", text: "Passport", indent: 1 },
    { type: "numbered", text: "Book flight", num: 1 },
    { type: "checkbox", text: "Confirm hotel", checked: true },
    { type: "checkbox", text: "Print tickets", checked: false },
    { type: "p", text: "A note before the quote." },
    { type: "blockquote", text: "Travel light.\nTravel often." },
    { type: "p", text: "And after the quote." },
    {
      type: "callout",
      calloutType: "warning",
      calloutTypeRaw: "warning",
      calloutFold: "",
      title: "Remember",
      text: "Charge devices the night before.",
    },
    { type: "p", text: "Some code:" },
    { type: "code", lang: "bash", text: "echo hello" },
    {
      type: "table",
      rows: [
        ["Day", "Plan"],
        ["Mon", "Fly out"],
      ],
      alignments: ["left", "right"],
      text: "",
    },
    { type: "image", src: "map.png", alt: "map", width: 100, text: "" },
    { type: "file", src: "itinerary.pdf", filename: "itinerary.pdf", size: null, text: "" },
    { type: "embed", target: "Packing List", heading: null, text: "" },
    { type: "spacer", text: "" },
    { type: "p", text: "The end." },
  ];

  it("round-trips a realistic mixed document losslessly", () => {
    expect(roundTrip(DOC)).toEqual(DOC);
  });
});

describe("markdown round-trip — intrinsic, documented losses", () => {
  // These are NOT bugs to fix — markdown's `![[...]]` wikilink syntax has no slot
  // for them. We pin the lossy behaviour so it's documented and can't change
  // silently. If a future format CAN preserve these, update these assertions.

  it("file block loses byte size (no slot in ![[...]] syntax)", () => {
    const [out] = markdownToBlocks(
      blocksToMarkdown([{ type: "file", src: "doc.pdf", filename: "doc.pdf", size: 12345 }]),
    );
    expect(out.size).toBeNull(); // 12345 → null, by design
  });

  it("image with a custom alt loses it (alt is re-derived from the filename)", () => {
    const [out] = markdownToBlocks(
      blocksToMarkdown([{ type: "image", src: "photo.png", alt: "My Caption", width: 100 }]),
    );
    expect(out.alt).toBe("photo"); // custom "My Caption" → filename stem
  });

  it("a leading spacer is read back as frontmatter (first-position ambiguity)", () => {
    // `---` at position 0 is always frontmatter; a spacer must never be first.
    const out = markdownToBlocks(blocksToMarkdown([{ type: "spacer", text: "" }]));
    expect(out[0].type).toBe("frontmatter");
  });
});

describe("table cells with literal pipes (preservation fix, 2026-08)", () => {
  // A naive split("|") used to delete cell content on files using `\|` —
  // the worst finding of the preservation damage report.

  it("parseTableRow splits only on unescaped pipes", () => {
    expect(parseTableRow("| pipe \\| inside | x |")).toEqual(["pipe | inside", "x"]);
    // `\\|` is an escaped backslash followed by a real separator
    expect(parseTableRow("| a\\\\ | b |")).toEqual(["a\\\\", "b"]);
    expect(parseTableRow("| plain | cells |")).toEqual(["plain", "cells"]);
    expect(parseTableRow("| a |  |")).toEqual(["a", ""]); // empty trailing cell kept
  });

  it("a cell containing a pipe round-trips block → markdown → block", () => {
    const blocks = [
      {
        type: "table",
        rows: [
          ["cmd", "desc"],
          ["grep a|b", "alternation"],
        ],
        alignments: ["left", "left"],
        text: "",
      },
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("grep a\\|b"); // written escaped
    const [out] = markdownToBlocks(md);
    expect(out.rows).toEqual(blocks[0].rows); // read back intact
  });
});

describe("paragraph whitespace preservation (preservation fix, 2026-08)", () => {
  // Paragraph text used to be stored trimmed, which flattened 4-space
  // indented code blocks to prose and stripped markdown hard breaks
  // (two trailing spaces) on every save.

  it("keeps leading indentation (indented code / HTML stay intact)", () => {
    const md = "    indented code line\n\ttab-indented line\n   three-space paragraph";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
    // Adjacent lines are one paragraph; each line keeps its own whitespace.
    expect(markdownToBlocks(md)).toHaveLength(1);
  });

  it("keeps trailing spaces (markdown hard breaks survive)", () => {
    const md = "line with a hard break  \ncontinuation line";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("still drops only the CR of a CRLF paragraph line (existing EOL policy)", () => {
    const [block] = markdownToBlocks("plain line\r\n");
    expect(block.text).toBe("plain line");
  });
});

describe("list marker + raw indent preservation (preservation fix, 2026-08)", () => {
  // `*` and `+` bullets used to parse as paragraphs — nested ones were
  // dedented to column 0, destroying the hierarchy. Tab and odd-space
  // indents were re-quantised to 2-space levels.

  it("recognises *, + bullets and writes the same marker back", () => {
    const md = "* star item\n+ plus item\n- dash item";
    const blocks = markdownToBlocks(md);
    expect(blocks.map((b) => b.type)).toEqual(["bullet", "bullet", "bullet"]);
    expect(blocks.map((b) => b.marker)).toEqual(["*", "+", undefined]);
    expect(blocksToMarkdown(blocks)).toBe(md);
  });

  it("preserves tab and odd-space list indentation byte-exact", () => {
    const md = "- parent\n\t- tab child\n   - three-space child\n    - four-space child";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("tab-indented children still nest in-app (indent level, not just bytes)", () => {
    const blocks = markdownToBlocks("- parent\n\t- tab child");
    expect(blocks[1].indent).toBe(1);
  });

  it("app-created bullets are unaffected (no marker/indentStr fields minted)", () => {
    const [out] = markdownToBlocks(blocksToMarkdown([{ type: "bullet", text: "plain" }]));
    expect(out.marker).toBeUndefined();
    expect(out.indentStr).toBeUndefined();
  });
});

describe("image width preservation (preservation fix, 2026-08)", () => {
  // Width was quantised px → % (÷7, rounded) → px, so ![[img|300]] drifted
  // to |301 on every save, and |700 (=100%) lost its suffix entirely.

  it("round-trips exact pixel widths in both image syntaxes", () => {
    for (const md of ["![[photo.png|300]]", "![[photo.png|700]]", "![alt|349](url.png)"]) {
      expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
    }
  });

  it("app-created images mint no widthPx (7-divisible px reconstructs from %)", () => {
    const [out] = markdownToBlocks(
      blocksToMarkdown([{ type: "image", src: "photo.png", alt: "photo", width: 50, text: "" }]),
    );
    expect(out.widthPx).toBeUndefined();
  });
});

describe("line-ending preservation (fidelity fix, 2026-08)", () => {
  // CRLF files were silently converted to LF — except inside code blocks,
  // which kept their CRs, leaving a mixed-EOL file. Blocks are now always
  // LF-internal; the file's style is detected on read and re-applied on save.

  it("detectEol picks the dominant style", () => {
    expect(detectEol("a\r\nb\r\n")).toBe("\r\n");
    expect(detectEol("a\nb\n")).toBe("\n");
    expect(detectEol("no newline")).toBe("\n");
  });

  it("a CRLF file round-trips byte-exact through the desktop path", () => {
    const md = "# Title\r\n\r\n- item\r\n\r\n```js\r\nconst x = 1;\r\n```\r\n";
    const out = applyEol(blocksToMarkdown(markdownToBlocks(md)), detectEol(md));
    expect(out).toBe(md);
  });

  it("code block text never contains CRs (no more mixed-EOL output)", () => {
    const blocks = markdownToBlocks("```\r\nline one\r\nline two\r\n```\r\n");
    expect(blocks[0].text).toBe("line one\nline two");
  });
});

describe("ordered-list number formatting (fidelity fix, 2026-08)", () => {
  it("keeps leading zeros exactly as written", () => {
    const md = "007. bond\n008. next";
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("plain numbering mints no numRaw field", () => {
    const [out] = markdownToBlocks("3. third");
    expect(out.num).toBe(3);
    expect(out.numRaw).toBeUndefined();
  });
});

describe("paragraph model: blocks are Markdown structure, not source lines", () => {
  // Round trips through the desktop path. A paragraph holds its soft breaks;
  // two paragraphs are separated by one blank line, which is structure and
  // not a block; further blanks are empty rows; a plain line under a list
  // item belongs to the item. Each case is written exactly as the parser
  // emits it, so a clean round trip deep-equals it.
  const p = (text) => ({ type: "p", text });
  const bullet = (text) => ({ type: "bullet", text });

  it("a paragraph with a soft break reads back as one paragraph block", () => {
    const blocks = [p("one\ntwo")];
    expect(blocksToMarkdown(blocks)).toBe("one\ntwo");
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("two paragraphs are written with one blank line between them", () => {
    const blocks = [p("First."), p("Second.")];
    expect(blocksToMarkdown(blocks)).toBe("First.\n\nSecond.");
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("one blank line in the source is the separator, not a block", () => {
    expect(stripIds(markdownToBlocks("First.\n\nSecond."))).toEqual([p("First."), p("Second.")]);
  });

  it("each blank line beyond the separator is an empty row, and comes back", () => {
    expect(stripIds(markdownToBlocks("First.\n\n\nSecond."))).toEqual([
      p("First."),
      p(""),
      p("Second."),
    ]);
    const blocks = [p("First."), p(""), p(""), p("Second.")];
    expect(blocksToMarkdown(blocks)).toBe("First.\n\n\n\nSecond.");
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("leading and trailing blank lines are empty rows, with no separator invented", () => {
    for (const md of ["\n\nFirst.", "First.\n", "First.\n\n", "\nFirst.\n"]) {
      expect(blocksToMarkdown(markdownToBlocks(md)), JSON.stringify(md)).toBe(md);
    }
    expect(stripIds(markdownToBlocks("First.\n"))).toEqual([p("First."), p("")]);
  });

  it("a paragraph after a list item is written with a blank line, never as a lazy line", () => {
    const blocks = [bullet("item"), p("After the list.")];
    expect(blocksToMarkdown(blocks)).toBe("- item\n\nAfter the list.");
    expect(roundTrip(blocks)).toEqual(blocks);
  });

  it("a plain line directly under a list item is the item's continuation", () => {
    expect(stripIds(markdownToBlocks("- item\ncontinued here\n- next"))).toEqual([
      bullet("item\ncontinued here"),
      bullet("next"),
    ]);
    expect(blocksToMarkdown(markdownToBlocks("- item\ncontinued here\n- next"))).toBe(
      "- item\ncontinued here\n- next",
    );
  });

  it("a paragraph after a quote keeps its own block and its bytes (see the interop note)", () => {
    const md = "> quoted\nlazy line\n\nAfter.";
    expect(stripIds(markdownToBlocks(md))).toEqual([
      { type: "blockquote", text: "quoted" },
      p("lazy line"),
      p("After."),
    ]);
    expect(blocksToMarkdown(markdownToBlocks(md))).toBe(md);
  });

  it("a blank line before a heading or a list stays an empty row, so those files keep their bytes", () => {
    for (const md of ["# T\n\nPara", "# T\nPara", "Para\n\n- a", "- a\n\n- b", "- a\n- b"]) {
      expect(blocksToMarkdown(markdownToBlocks(md)), JSON.stringify(md)).toBe(md);
    }
  });

  it("a whitespace-only line is a blank line that keeps its bytes as a row", () => {
    // It separates the paragraphs like any blank line, but its spaces are the
    // file's own, so it is kept as a row and no separator is written before it.
    expect(stripIds(markdownToBlocks("First.\n   \nSecond."))).toEqual([
      p("First."),
      p("   "),
      p("Second."),
    ]);
    for (const md of [
      "First.\n   \nSecond.",
      "First.\n   \n\nSecond.",
      "First.\n\n\n   \nSecond.",
      // A run that holds a whitespace-only line is written literally, all rows.
      "- a\n\n  \n\nSecond.",
      "- a\n\n  \nSecond.",
    ]) {
      expect(blocksToMarkdown(markdownToBlocks(md)), JSON.stringify(md)).toBe(md);
    }
  });
});
