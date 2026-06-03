import { describe, it, expect } from "vitest";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown.js";

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
  ["numbered", [{ type: "numbered", text: "first item" }]],
  ["numbered (indented)", [{ type: "numbered", text: "sub item", indent: 1 }]],
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
  // body containing a fence forces the 4-backtick path in blocksToMarkdown
  ["code (body contains a fence)", [{ type: "code", lang: "", text: "```\nnested fence\n```" }]],
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
    { type: "numbered", text: "Book flight" },
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
