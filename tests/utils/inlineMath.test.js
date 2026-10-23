/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  domNodeToMarkdown,
  htmlToInlineMarkdown,
  inlineMarkdownToHtml,
  sanitizeInlineHtml,
} from "../../src/utils/inlineFormatting.js";
import {
  caretLength,
  caretOffsetAt,
  getCaretOffset,
  placeCaret,
} from "../../src/utils/domHelpers.js";

/** The block element as the editor paints it. */
function paint(text) {
  const el = document.createElement("p");
  el.setAttribute("contenteditable", "true");
  el.innerHTML = inlineMarkdownToHtml(text);
  document.body.appendChild(el);
  return el;
}
const formulas = (text) =>
  [...paint(text).querySelectorAll(".inline-math")].map((m) => m.getAttribute("data-math"));

describe("inline maths: which dollars are a formula (the Pandoc-style rule)", () => {
  it("draws $x$ and $\\frac{a}{b}$, with the source as written", () => {
    expect(formulas("the mean $\\bar{x}$ of $x_i$")).toEqual(["\\bar{x}", "x_i"]);
    expect(formulas("$\\frac{a}{b}$")).toEqual(["\\frac{a}{b}"]);
  });

  it("leaves money, spaced dollars, $$ and an escaped dollar as text", () => {
    for (const text of [
      "costs $5 and $10",
      "a $ b $ c",
      "$x $",
      "$ x$",
      "$x$5",
      "price \\$x$",
      "$$x$$ inline",
      "open $x",
    ]) {
      expect(formulas(text), text).toEqual([]);
    }
  });

  it("keeps a code span whole and reads TeX underscores and stars as TeX", () => {
    expect(formulas("`$x$` and $a_1 * b_2$")).toEqual(["a_1 * b_2"]);
    const el = paint("$a_1 * b_2 * c$");
    expect(el.querySelector("em")).toBeNull();
  });

  it("keeps escapes, < and & in the source", () => {
    expect(formulas("$\\{x\\} < y \\& z$")).toEqual(["\\{x\\} < y \\& z"]);
    expect(formulas("$\\[x\\]$")).toEqual(["\\[x\\]"]);
  });

  it("sits beside links, tags and formatting without taking them in", () => {
    expect(formulas("**$x$** and [link](https://a.b) and #tag $y$")).toEqual(["x", "y"]);
  });
});

describe("inline maths: the read-back is the source, never what KaTeX drew", () => {
  const cases = [
    "the mean $\\bar{x}$ of $x_i$",
    "$\\frac{a}{b}$ at the start",
    "at the end $x^2$",
    "**bold $x$** and *$y$*",
    "costs $5 and $10",
    "$\\{x\\} < y \\& z$",
    "line one $a$\nline two $b$",
  ];
  for (const text of cases) {
    it(JSON.stringify(text), () => {
      const el = paint(text);
      // What KaTeX would draw is inside the element; the walkers never read it.
      for (const m of el.querySelectorAll(".inline-math"))
        m.innerHTML = "<span>x²<math>junk</math></span>";
      expect(domNodeToMarkdown(el)).toBe(text);
      expect(htmlToInlineMarkdown(sanitizeInlineHtml(el.innerHTML))).toBe(text);
    });
  }
});

describe("inline maths: the caret counts a formula as one character", () => {
  it("measures and places around it, drawn or not", () => {
    const el = paint("ab $x^2$ cd");
    expect(caretLength(el)).toBe(7);
    for (const m of el.querySelectorAll(".inline-math"))
      m.innerHTML = "<span>x²</span><span>more text</span>";
    expect(caretLength(el)).toBe(7);
    for (let pos = 0; pos <= 7; pos++) {
      placeCaret(el, pos);
      expect(getCaretOffset(el), `pos ${pos}`).toBe(pos);
    }
  });

  it("never puts the caret inside one", () => {
    const el = paint("$x$");
    const atom = el.querySelector(".inline-math");
    placeCaret(el, 0);
    expect(atom.contains(window.getSelection().anchorNode)).toBe(false);
    placeCaret(el, 1);
    expect(atom.contains(window.getSelection().anchorNode)).toBe(false);
    expect(caretOffsetAt(el, el, el.childNodes.length)).toBe(1);
  });
});

describe("inline maths: a bare URL keeps its dollars", () => {
  it("draws no formula inside an address", () => {
    expect(formulas("https://x.y$a$a")).toEqual([]);
    expect(formulas("see https://x.y/$a$ then $b$")).toEqual(["b"]);
  });
});

it("a formula holding an unclosed wikilink keeps its text as written", () => {
  const el = paint("$[[a|$a");
  expect(domNodeToMarkdown(el)).toBe("$[[a|$a");
});

describe("inline maths: a link's destination keeps its dollars", () => {
  it("draws no formula in `](…)`, and reads the paragraph back unchanged", () => {
    for (const text of ["[doc](folder/$x$.md)", "see [doc](a/$x$/b.md) and $y$", "[$x$](a.md)"]) {
      const el = paint(text);
      expect(el.querySelector("a")?.getAttribute("href") ?? "").not.toContain("inline-math");
      expect(domNodeToMarkdown(el), text).toBe(text);
    }
    expect(formulas("see [doc](a/$x$/b.md) and $y$")).toEqual(["y"]);
  });
});
