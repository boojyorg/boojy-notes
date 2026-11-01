import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { codeSpanSource, codeSpanText, findCodeSpans } from "../../src/utils/codeSpans.js";
import {
  domNodeToMarkdown,
  htmlToInlineMarkdown,
  inlineMarkdownToHtml,
  sanitizeInlineHtml,
  stripMarkdownFormatting,
} from "../../src/utils/inlineFormatting.js";
import { tagsInText } from "../../src/utils/tags";

// A code span is literal (CommonMark 6.1): nothing inside one is formatting, a
// link, a tag or an escape. `**bold**` in backticks drew bold and `[[Note]]` a
// live link, so a cheat sheet could not show its own syntax.

const md = new MarkdownIt("commonmark");

const render = (source) => {
  const el = document.createElement("p");
  el.innerHTML = inlineMarkdownToHtml(source, new Set());
  return el;
};

/** What a reader makes of a line: each code span's text, and the elements outside code. */
function meaning(root) {
  const codes = [...root.querySelectorAll("code")].map((c) => c.textContent);
  const outside = (sel) => [...root.querySelectorAll(sel)].filter((e) => !e.closest("code")).length;
  return { codes, strong: outside("strong"), em: outside("em"), links: outside("a") };
}
const oracle = (source) => {
  const el = document.createElement("p");
  el.innerHTML = md.renderInline(source);
  return meaning(el);
};

/** The two read-backs: the live block, and the serialised road (Enter's split, a copy). */
function readBacks(source) {
  const el = render(source);
  return {
    live: domNodeToMarkdown(el),
    serialised: htmlToInlineMarkdown(sanitizeInlineHtml(el.innerHTML)),
  };
}

describe("a code span's text is literal", () => {
  it.each([
    ["`**bold**`", "**bold**"],
    ["`*italic*`", "*italic*"],
    ["`_italic_`", "_italic_"],
    ["`~~struck~~`", "~~struck~~"],
    ["`==highlight==`", "==highlight=="],
    ["`[words](https://example.com)`", "[words](https://example.com)"],
    ["`[[Note name]]`", "[[Note name]]"],
    ["`![description](image.png)`", "![description](image.png)"],
    ["`#tag`", "#tag"],
    ["`see https://x.com`", "see https://x.com"],
    ["`a\\*b`", "a\\*b"],
    ["`<b>&amp;`", "<b>&amp;"],
  ])("%s shows %s, with nothing inside it drawn", (source, text) => {
    const el = render(source);
    expect(el.querySelector("code").textContent).toBe(text);
    expect(el.querySelector("code").children).toHaveLength(0);
    expect(el.querySelector("strong, em, del, mark, a, .wikilink, .inline-tag")).toBeNull();
  });

  it("formatting around a span still wraps it (code nested)", () => {
    const el = render("**a `b` c**");
    expect(el.querySelector("strong code").textContent).toBe("b");
  });

  it("a span in a link's words stays inside the link", () => {
    const el = render("[`x`](https://u.com)");
    expect(el.querySelector("a code").textContent).toBe("x");
  });

  it("a span in a wikilink's name never breaks its attribute open", () => {
    const el = render("[[a `b`]]");
    expect(el.querySelector(".wikilink").getAttribute("data-target")).toBe("a `b`");
    expect(el.querySelector(".wikilink code").textContent).toBe("b");
  });
});

describe("backtick runs, as CommonMark reads them", () => {
  // Each case's meaning (the spans' texts, and what is outside them) is
  // markdown-it's; Boojy's own renderer is never the oracle.
  it.each([
    "`` `code` ``",
    "``a`b``",
    "``` `` ```",
    "`` a ``",
    "`  `",
    "` `` `",
    "`a\nb`",
    "``a`",
    "`a\\`b",
    "\\`not code\\`",
    "**`x`** and *`y`*",
    "`**x**` then **y**",
    "a ``` b",
    "[link `code`](https://u.com) after",
  ])("%j means what markdown-it reads", (source) => {
    expect(meaning(render(source))).toEqual(oracle(source));
  });

  it("a span of only spaces keeps them; one with text loses one at each end", () => {
    expect(codeSpanText("  ")).toBe("  ");
    expect(codeSpanText(" a ")).toBe("a");
    expect(codeSpanText("  a  ")).toBe(" a ");
    expect(codeSpanText(" a")).toBe(" a");
    expect(codeSpanText("a\nb")).toBe("a b");
  });

  it("finds each span with its source", () => {
    expect(findCodeSpans("x `a` y ``b`c`` z")).toEqual([
      { start: 2, end: 5, source: "`a`", text: "a" },
      { start: 8, end: 15, source: "``b`c``", text: "b`c" },
    ]);
  });
});

describe("an untouched span keeps its spelling", () => {
  it.each([
    "`code`",
    "``code``",
    "`` `code` ``",
    "`` a ``",
    "```x```",
    "`  `",
    "`a\nb`",
    "before\n```\ncode\n```\nafter",
    "**a `b` c** and `**d**`",
    "[[a `b`]]",
    "`#tag` #real",
  ])("%j reads back byte for byte", (source) => {
    const { live, serialised } = readBacks(source);
    expect(live).toBe(source);
    expect(serialised).toBe(source);
  });

  it("an edited span keeps its runs and padding around the new text where they still read back", () => {
    const el = render("``code``");
    el.querySelector("code").textContent = "co`de";
    expect(domNodeToMarkdown(el)).toBe("``co`de``");
    el.querySelector("code").textContent = "new";
    expect(domNodeToMarkdown(el)).toBe("``new``");
    // A fence written in a quote, edited inside, stays three lines.
    const fence = render("before\n```\ncode\n```\nafter");
    fence.querySelector("code").textContent = "co%de";
    expect(domNodeToMarkdown(fence)).toBe("before\n```\nco%de\n```\nafter");
    // A line break inside the text, away from the edit, stays a line break.
    const js = render("```js\nlet a = 1\n```");
    js.querySelector("code").textContent = "js let a = 12 ";
    expect(domNodeToMarkdown(js)).toBe("```js\nlet a = 12\n```");
  });

  it("an edit the old runs cannot hold is written in the fewest safe backticks", () => {
    const el = render("``code``");
    el.querySelector("code").textContent = "`x";
    expect(domNodeToMarkdown(el)).toBe("`` `x ``");
    el.querySelector("code").textContent = "a``b";
    expect(domNodeToMarkdown(el)).toBe("`a``b`");
    // A span typed in the app has no source: the shortest spelling.
    const typed = document.createElement("p");
    typed.innerHTML = "<code>a`b</code>";
    expect(domNodeToMarkdown(typed)).toBe("``a`b``");
  });

  it("a source that is not one span showing the text is ignored", () => {
    // Pasted HTML can carry any attribute: `` `a` **b** `a` `` is two spans
    // and a bold, never this span's spelling.
    const html = '<code data-md="`a` **b** `a`">a` **b** `a</code>';
    expect(htmlToInlineMarkdown(sanitizeInlineHtml(html))).toBe("``a` **b** `a``");
  });
});

describe("codeSpanSource", () => {
  it.each([
    ["code", "`code`"],
    ["a`b", "``a`b``"],
    ["a``b`c", "```a``b`c```"],
    ["`x`", "`` `x` ``"],
    [" a ", "`  a  `"],
    ["  ", "`  `"],
    ["", ""],
  ])("%j is written %j and reads back as itself", (text, source) => {
    expect(codeSpanSource(text)).toBe(source);
    if (text) expect(findCodeSpans(source)[0].text).toBe(text);
  });
});

describe("readers beside the renderer", () => {
  it("a tag in a code span is no tag, however many backticks", () => {
    expect(tagsInText("`#a` ``#b`` `` `#c` `` #d")).toEqual(["d"]);
  });

  it("the plain text of a span is its text, formatting inside it kept", () => {
    expect(stripMarkdownFormatting("**a** `**b**` ``c`d``")).toBe("a **b** c`d");
  });
});
