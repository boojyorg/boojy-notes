import MarkdownIt from "markdown-it";
import footnotePlugin from "markdown-it-footnote";
import { describe, expect, it } from "vitest";
import { moveStep } from "../../src/utils/blockRun";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown.js";

// ─────────────────────────────────────────────────────────────────────────────
// FOOTNOTE MEANING, judged by markdown-it-footnote, never by our parser.
//
// It reads standard footnotes as Obsidian's Reading view does on every case we
// checked but one (a missing definition: Obsidian drops the brackets, both
// leave it no footnote). Where the two differ on how far a footnote runs (a
// later paragraph two spaces in: Obsidian's help writes two, the plugin wants
// four), only the bytes are promised here, and the editor keeps the paragraph
// with its footnote either way.
// ─────────────────────────────────────────────────────────────────────────────

const md = new MarkdownIt("commonmark").enable("table").use(footnotePlugin);

/** Inline text as the reader sees it, footnote references as `[^label]`. */
function inlineText(children) {
  let out = "";
  for (const t of children ?? []) {
    if (t.type === "footnote_ref") out += `[^${t.meta.label ?? `inline:${t.meta.id}`}]`;
    else if (t.type === "text" || t.type === "code_inline") out += t.content;
    else if (t.type === "softbreak") out += "\n";
    else if (t.children) out += inlineText(t.children);
  }
  return out;
}

/**
 * What the reader makes of a note's footnotes: each reference in reading
 * order, then each footnote's paragraphs. The unit every test compares.
 */
function footnotesOf(source) {
  const env = {};
  const tokens = md.parse(source, env);
  const refs = [];
  const notes = [];
  let current = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "footnote_open") {
      current = { label: t.meta.label ?? "(inline)", paragraphs: [] };
      notes.push(current);
    } else if (t.type === "footnote_close") current = null;
    else if (current && (t.type === "fence" || t.type === "code_block"))
      current.paragraphs.push(`code:${t.content}`);
    else if (t.type === "inline") {
      const text = inlineText(t.children);
      if (current) current.paragraphs.push(text);
      for (const c of t.children ?? [])
        if (c.type === "footnote_ref") refs.push(c.meta.label ?? "(inline)");
    }
  }
  // Inline footnotes keep their text on the env, not as tokens.
  for (const n of notes) {
    if (n.label === "(inline)" && !n.paragraphs.length) n.paragraphs.push("(inline)");
  }
  return { refs, notes };
}

const saveCycle = (source) => blocksToMarkdown(markdownToBlocks(source));

const CASES = {
  basic: "Markdown was created in 2004.[^1]\n\n[^1]: By John Gruber, with Aaron Swartz.\n",
  repeat: "First claim.[^src] Second claim.[^src]\n\n[^src]: The same source for both.\n",
  missing: "This points nowhere.[^missing]\n",
  duplicate:
    "Which one wins?[^dup]\n\n[^dup]: The first definition.\n\n[^dup]: The second definition.\n",
  adjacent: "Alpha.[^a] Beta.[^b]\n\n[^a]: Definition A.\n[^b]: Definition B.\n",
  multipara:
    "Long note.[^long]\n\n[^long]: First paragraph.\n    Still the first paragraph, indented.\n\n    A second paragraph, indented four spaces.\n\nThis line is back in the note.\n",
  twoSpaces: "Two.[^two]\n\n[^two]: First paragraph.\n\n  Second paragraph, two spaces.\n",
  lazy: "Lazy.[^lazy]\n\n[^lazy]: First line.\nSecond line, no indent.\n\nBack in the note.\n",
  order:
    "See this.[^b2] Then this.[^a2]\n\n[^a2]: Defined first, referenced second.\n[^b2]: Defined second, referenced first.\n",
  inline: "Obsidian came out in 2020.^[Version 1.0 followed in 2022.]\n",
  inlineBrackets: "Tricky.^[with [brackets] inside] end.\n",
  table: "| Item | Note |\n| --- | --- |\n| Flour | Strong.[^flour] |\n\n[^flour]: Bread flour.\n",
  code: "Not a footnote: `[^code1]` here.\n\n[^code1]: Defined anyway.\n",
  escaped: "Escaped \\[^esc1] is text.\n\n[^esc1]: Defined.\n",
  spaces: "Spaced.[^my note]\n\n[^my note]: Label has a space.\n",
  reflink: "A [link][x] and a note.[^r]\n\n[x]: https://example.com\n[^r]: The footnote.\n",
  empty: "Empty.[^e]\n\n[^e]:\n",
};

describe("footnotes keep their meaning through a load and save", () => {
  for (const [name, source] of Object.entries(CASES)) {
    it(name, () => {
      expect(saveCycle(source)).toBe(source);
      expect(footnotesOf(saveCycle(source))).toEqual(footnotesOf(source));
    });
  }
});

describe("footnotes keep their meaning through an edit", () => {
  it("editing a definition's text changes that footnote alone", () => {
    const blocks = markdownToBlocks(CASES.adjacent);
    const a = blocks.find((b) => b.type === "footnote" && b.label === "a");
    a.text = "Rewritten A.";
    expect(footnotesOf(blocksToMarkdown(blocks)).notes).toEqual([
      { label: "a", paragraphs: ["Rewritten A."] },
      { label: "b", paragraphs: ["Definition B."] },
    ]);
  });

  it("a Shift+Enter line in a definition stays in that footnote", () => {
    const blocks = markdownToBlocks(CASES.basic);
    const def = blocks.find((b) => b.type === "footnote");
    def.text = "By John Gruber,\nwith Aaron Swartz.";
    expect(footnotesOf(blocksToMarkdown(blocks)).notes).toEqual([
      { label: "1", paragraphs: ["By John Gruber,\nwith Aaron Swartz."] },
    ]);
  });

  it("a soft-broken line that looks like a definition stays text", () => {
    const blocks = markdownToBlocks(CASES.basic);
    blocks.find((b) => b.type === "footnote").text = "One.\n[^2]: not a second footnote";
    const meaning = footnotesOf(blocksToMarkdown(blocks));
    expect(meaning.notes.map((n) => n.label)).toEqual(["1"]);
  });

  it("moving a two-paragraph footnote past another keeps both paragraphs with it", () => {
    const source =
      "One.[^long] Two.[^b]\n\n[^long]: First paragraph.\n\n    Second paragraph.\n\n[^b]: Definition B.\n";
    const blocks = markdownToBlocks(source);
    const i = blocks.findIndex((b) => b.type === "footnote" && b.label === "long");
    const moved = moveStep(blocks, i, 1);
    expect(moved).not.toBeNull();
    const saved = blocksToMarkdown(moved);
    expect(saved).toBe(
      "One.[^long] Two.[^b]\n\n[^b]: Definition B.\n\n[^long]: First paragraph.\n\n    Second paragraph.\n",
    );
    const byLabel = (m) => Object.fromEntries(m.notes.map((n) => [n.label, n.paragraphs]));
    expect(byLabel(footnotesOf(saved))).toEqual(byLabel(footnotesOf(source)));
  });

  const byLabel = (m) => Object.fromEntries(m.notes.map((n) => [n.label, n.paragraphs]));
  /** The source with footnote `label` moved one step down by ⌘⇧↓, saved. */
  const movedDown = (source, label) => {
    const blocks = markdownToBlocks(source);
    const i = blocks.findIndex((b) => b.type === "footnote" && b.label === label);
    return blocksToMarkdown(moveStep(blocks, i, 1));
  };

  it("moving a footnote takes its indented list with it", () => {
    const source =
      "One.[^list] Two.[^b]\n\n[^list]: Ingredients:\n\n    - flour\n    - water\n\n[^b]: Definition B.\n";
    expect(byLabel(footnotesOf(movedDown(source, "list")))).toEqual(byLabel(footnotesOf(source)));
  });

  it("moving a footnote takes an indented code block with it", () => {
    const source =
      "One.[^code] Two.[^b]\n\n[^code]: Example:\n\n    ```\n    x = 1\n    ```\n\n[^b]: Definition B.\n";
    expect(byLabel(footnotesOf(movedDown(source, "code")))).toEqual(byLabel(footnotesOf(source)));
  });

  it("a blank line holding spaces does not part a footnote from its later paragraph", () => {
    const source =
      "One.[^long] Two.[^b]\n\n[^long]: First paragraph.\n   \n    Second paragraph.\n\n[^b]: Definition B.\n";
    expect(byLabel(footnotesOf(movedDown(source, "long")))).toEqual(byLabel(footnotesOf(source)));
  });

  it("a definition the app makes reads back as a footnote", () => {
    const blocks = [
      { id: "p", type: "p", text: "A claim.[^1]" },
      { id: "f", type: "footnote", label: "1", text: "The source." },
    ];
    expect(footnotesOf(blocksToMarkdown(blocks))).toEqual({
      refs: ["1"],
      notes: [{ label: "1", paragraphs: ["The source."] }],
    });
  });
});
