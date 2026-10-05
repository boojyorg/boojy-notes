import fc from "fast-check";

// Generated Markdown documents for the round-trip properties
// (roundTripProperty.test.js). Built from the parser's own edge cases, a line
// at a time: what the hand-written preservation fixtures cover one file each,
// these combine thousands of ways.

const word = fc.constantFrom(
  "alpha",
  "Beta",
  "café",
  "日本",
  "🙂",
  "x",
  "42",
  "a b",
  "zero​width",
  "under_score",
  "back\\slash",
  "pipe\\|",
  "1.",
);

const inline = fc.constantFrom(
  "**bold**",
  "*italic*",
  "_under_",
  "__strong__",
  "`code`",
  "``two `ticks``",
  "~~strike~~",
  "==mark==",
  "[[Note]]",
  "[[Folder/Note|alias]]",
  "[[Note#Heading]]",
  "#tag",
  "#nested/tag",
  "[link](https://example.com)",
  '[titled](https://example.com "t")',
  "<https://example.com>",
  "https://example.com/path.",
  "\\*escaped\\*",
  "![[pic.png]]",
  "![alt](pic.png)",
  "<span>html</span>",
  "$x$",
);

const spaces = fc.constantFrom("", "", "", " ", "  ", "\t");
const text = fc
  .array(fc.oneof({ weight: 3, arbitrary: word }, { weight: 1, arbitrary: inline }), {
    minLength: 1,
    maxLength: 6,
  })
  .map((parts) => parts.join(" "));
const textLine = fc.tuple(text, spaces).map(([t, trail]) => t + trail);

const indent = fc.constantFrom("", "", "  ", "    ", "\t", " ");

const paragraph = fc.array(textLine, { minLength: 1, maxLength: 3 }).map((ls) => ls.join("\n"));
const heading = fc
  .tuple(fc.integer({ min: 1, max: 6 }), text, fc.constantFrom("", "", " #", " ##"))
  .map(([n, t, close]) => `${"#".repeat(n)} ${t}${close}`);
const listItem = fc
  .tuple(
    indent,
    fc.constantFrom("- ", "* ", "+ ", "1. ", "2) ", "10. ", "- [ ] ", "- [x] ", "- [X] "),
    fc.oneof(text, fc.constant("")),
  )
  .map(([i, m, t]) => `${i}${m}${t}`);
const list = fc.array(listItem, { minLength: 1, maxLength: 4 }).map((ls) => ls.join("\n"));
const quote = fc
  .array(
    fc.oneof(
      text.map((t) => `> ${t}`),
      fc.constant(">"),
      text.map((t) => `>${t}`),
    ),
    { minLength: 1, maxLength: 3 },
  )
  .map((ls) => ls.join("\n"));
const callout = fc
  .tuple(fc.constantFrom("note", "Warning", "TIP", "faq"), fc.constantFrom("", "-", "+"), text)
  .map(([kind, fold, t]) => `> [!${kind}]${fold} Title\n> ${t}`);
const fence = fc
  .tuple(
    fc.constantFrom("```", "~~~", "````"),
    fc.constantFrom("", "js", "python", "c++"),
    fc.array(fc.oneof(text, fc.constant(""), fc.constant("  indented")), { maxLength: 3 }),
    fc.boolean(),
  )
  .map(([f, lang, body, closed]) => [`${f}${lang}`, ...body, ...(closed ? [f] : [])].join("\n"));
const cell = fc.oneof(word, fc.constant(""), fc.constant("a \\| b"));
const table = fc
  .tuple(
    fc.integer({ min: 1, max: 3 }),
    fc.array(fc.array(cell, { minLength: 1, maxLength: 4 }), { maxLength: 3 }),
    fc.constantFrom("---", ":--", "--:", ":-:"),
  )
  .map(([cols, rows, sep]) => {
    const row = (cells) => `| ${cells.join(" | ")} |`;
    const head = Array.from({ length: cols }, (_, i) => `h${i}`);
    return [row(head), row(head.map(() => sep)), ...rows.map(row)].join("\n");
  });
const divider = fc.constantFrom("---", "---", " ---", "   ---", "--- ", "***", "___", "- - -");
const html = fc.constantFrom("<div>\nblock\n</div>", "<!-- comment -->", "<br>");
// An embed's own line, with whitespace either side: indented, it sits under
// the list item above it (Obsidian), and its bytes are kept like any other.
const embed = fc
  .tuple(
    indent,
    fc.constantFrom("![[pic.png]]", "![[pic.png|300]]", "![alt](pic.png)", "![[Note]]"),
    spaces,
  )
  .map(([lead, line, trail]) => lead + line + trail);

const block = fc.oneof(
  { weight: 6, arbitrary: paragraph },
  { weight: 2, arbitrary: heading },
  { weight: 3, arbitrary: list },
  { weight: 2, arbitrary: quote },
  { weight: 1, arbitrary: callout },
  { weight: 2, arbitrary: fence },
  { weight: 2, arbitrary: table },
  { weight: 1, arbitrary: divider },
  { weight: 1, arbitrary: html },
  { weight: 1, arbitrary: embed },
);

const frontmatter = fc.constantFrom(
  "",
  "",
  "",
  "---\ntags: [a, b]\ntitle: x\n---\n",
  "---\n---\n",
  "---\nkey: value\n",
);

/**
 * A whole document: optional frontmatter, then blocks separated by one to
 * three newlines, one line-ending style throughout, a final newline or not.
 */
export const markdownDocument = fc
  .tuple(
    frontmatter,
    fc.array(fc.tuple(block, fc.constantFrom("\n\n", "\n\n", "\n", "\n\n\n")), {
      minLength: 1,
      maxLength: 10,
    }),
    fc.constantFrom("\n", "\n", ""),
    fc.constantFrom("\n", "\n", "\n", "\r\n"),
  )
  .map(([fm, blocks, end, eol]) => {
    const body = blocks.map(([b, gap], i) => (i ? gap : "") + b).join("");
    const doc = fm + body + end;
    return eol === "\n" ? doc : doc.replace(/\n/g, "\r\n");
  });

const inlinePiece = fc.constantFrom(
  "a",
  "b",
  " ",
  "  ",
  "*",
  "**",
  "_",
  "__",
  "`",
  "``",
  "~~",
  "==",
  "[[",
  "]]",
  "|",
  "#",
  "#t",
  "\\",
  "[",
  "]",
  "(",
  ")",
  "https://x.y",
  "<",
  ">",
  "!",
  " ",
  "​",
  "é",
  "1.",
  "$",
  "&",
  "&amp;",
);

/** One block's text, as typed: inline syntax in any order, no newline, no edge spaces. */
export const inlineText = fc
  .array(inlinePiece, { minLength: 1, maxLength: 12 })
  .map((pieces) => pieces.join(""))
  .filter((t) => t.trim() === t && !t.includes("\n"));
