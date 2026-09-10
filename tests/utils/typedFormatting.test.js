/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { closingFormatAt, paintTypedFormat, typedFormatHit } from "../../src/utils/typedFormatting";
import { domNodeToMarkdown } from "../../src/utils/inlineFormatting";
import { CARET_ANCHOR } from "../../src/utils/domHelpers";

// ── The pure matcher ────────────────────────────────────────────────────────

describe("closingFormatAt", () => {
  const kindOf = (before, after = "") => closingFormatAt(before, after)?.kind ?? null;

  it("reads each closed run by its marker", () => {
    expect(closingFormatAt("say **bold**")).toMatchObject({
      kind: "bold",
      marker: "**",
      canonical: "**",
      tag: "STRONG",
      runLength: 8,
      content: "bold",
    });
    expect(kindOf("*it*")).toBe("italic");
    expect(kindOf("`code`")).toBe("code");
    expect(kindOf("~~old~~")).toBe("strikethrough");
    expect(kindOf("==key==")).toBe("highlight");
    expect(closingFormatAt("***both***")).toMatchObject({ kind: "boldItalic", tag: "STRONG" });
  });

  it("reads the underscore forms and reports the star form to write", () => {
    expect(closingFormatAt("_it_")).toMatchObject({ kind: "italic", marker: "_", canonical: "*" });
    expect(closingFormatAt("__bo__")).toMatchObject({
      kind: "bold",
      marker: "__",
      canonical: "**",
    });
  });

  it("needs content that neither starts nor ends with whitespace", () => {
    expect(kindOf("2 * 3 * 4 *")).toBeNull();
    expect(kindOf("a ** b **")).toBeNull();
    expect(kindOf("* a*")).toBeNull();
    expect(kindOf("*a *")).toBeNull();
    expect(kindOf("****")).toBeNull();
    expect(kindOf("**")).toBeNull();
    expect(kindOf("* *")).toBeNull();
  });

  it("is not fooled by the first closing star of a bold run", () => {
    // `**bold*` is a bold run still open, not `*bold*` with a stray star.
    expect(kindOf("**bold*")).toBeNull();
    // `***x**` is a bold-italic run still open.
    expect(kindOf("***x**")).toBeNull();
    // The second closing star does close it.
    expect(kindOf("**bold**")).toBe("bold");
  });

  it("leaves an escaped opener alone", () => {
    expect(kindOf("\\*not*")).toBeNull();
    expect(kindOf("\\**not**")).toBeNull();
    expect(kindOf("\\`not`")).toBeNull();
  });

  it("keeps CommonMark's intraword rule for underscores", () => {
    expect(kindOf("snake_case_")).toBeNull();
    expect(kindOf("_a_", "b")).toBeNull();
    expect(kindOf("see _it_", " now")).toBe("italic");
    // Stars have no intraword rule: `2*3*` closes an italic, as CommonMark reads it.
    expect(kindOf("2*3*")).toBe("italic");
  });

  it("refuses a closer followed by its own marker", () => {
    expect(kindOf("*a*", "*")).toBeNull();
    expect(kindOf("**a**", "*")).toBeNull();
    expect(kindOf("*a*", " b")).toBe("italic");
  });

  it("leaves a run holding its own marker to the renderer", () => {
    expect(kindOf("**a*b**")).toBeNull();
    expect(kindOf("`a`b`")).toBe("code"); // the last pair, `b`
    expect(closingFormatAt("`a`b`")?.content).toBe("b");
  });
});

// ── The DOM half ────────────────────────────────────────────────────────────

/** A block root inside a contentEditable, with the caret at `pos` (visible characters). */
function block(html, pos) {
  document.body.innerHTML = `<div contenteditable="true"><p id="b">${html}</p></div>`;
  const el = document.getElementById("b");
  const sel = window.getSelection();
  sel.removeAllRanges();
  if (pos !== undefined) {
    // Walk text nodes to the position, as a click there would.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = pos;
    let node = walker.nextNode();
    while (node && remaining > node.data.length) {
      remaining -= node.data.length;
      node = walker.nextNode();
    }
    const range = document.createRange();
    range.setStart(node ?? el, node ? remaining : 0);
    range.collapse(true);
    sel.addRange(range);
  }
  return el;
}

const typed = (data, extra = {}) => ({
  inputType: "insertText",
  data,
  isComposing: false,
  ...extra,
});

const caretAfterAnchor = (el, tag) => {
  const sel = window.getSelection();
  const target = el.querySelector(tag);
  const anchor = target.nextSibling;
  expect(anchor.className).toBe("caret-anchor");
  expect(anchor.textContent).toBe(CARET_ANCHOR);
  expect(sel.anchorNode).toBe(anchor.firstChild);
  expect(sel.anchorOffset).toBe(1);
};

describe("typedFormatHit", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reports a closed bold run at the end of a block", () => {
    const el = block("say **bold**", 12);
    const hit = typedFormatHit(el, typed("*"));
    expect(hit).toMatchObject({
      kind: "bold",
      before: "say **bold**",
      after: "",
      head: "say ",
      canonicalRun: "**bold**",
      newText: "say **bold**",
      rewritten: false,
      visibleCaret: 12,
    });
  });

  it("reports a run closed mid-block, with the text after the caret", () => {
    const el = block("the **mid** end", 11);
    const hit = typedFormatHit(el, typed("*"));
    expect(hit).toMatchObject({ before: "the **mid**", after: " end", head: "the " });
  });

  it("rewrites an underscore run to the star form", () => {
    const el = block("see _it_ now", 8);
    const hit = typedFormatHit(el, typed("_"));
    expect(hit).toMatchObject({
      rewritten: true,
      canonicalRun: "*it*",
      newText: "see *it* now",
    });
  });

  it("fires only on a typed marker character outside a composition", () => {
    const el = block("**bold**", 8);
    expect(typedFormatHit(el, null)).toBeNull();
    expect(typedFormatHit(el, typed("*", { inputType: "deleteContentBackward" }))).toBeNull();
    expect(typedFormatHit(el, typed("*", { inputType: "insertFromPaste" }))).toBeNull();
    expect(typedFormatHit(el, typed("*", { inputType: "insertCompositionText" }))).toBeNull();
    expect(typedFormatHit(el, typed("*", { isComposing: true }))).toBeNull();
    expect(typedFormatHit(el, typed("d"))).toBeNull();
    expect(typedFormatHit(el, typed("**"))).toBeNull();
    expect(typedFormatHit(el, typed(null))).toBeNull();
    expect(typedFormatHit(el, typed("*"))).not.toBeNull();
  });

  it("does not fire inside an existing formatting element or link", () => {
    const inBold = block("<strong>see *x*</strong>", 7);
    expect(typedFormatHit(inBold, typed("*"))).toBeNull();
    const inCode = block("<code>**x**</code>", 5);
    expect(typedFormatHit(inCode, typed("*"))).toBeNull();
    const inLink = block('<a href="u">**x**</a>', 5);
    expect(typedFormatHit(inLink, typed("*"))).toBeNull();
    const inWiki = block('<span class="wikilink" data-target="N">**x**</span>', 5);
    expect(typedFormatHit(inWiki, typed("*"))).toBeNull();
  });

  it("fires after an earlier formatting element and from inside a caret anchor", () => {
    // The head's bold is read back as Markdown, so the prefix is exact.
    const el = block("<strong>one</strong> and *two*", 13);
    expect(typedFormatHit(el, typed("*"))).toMatchObject({
      head: "**one** and ",
      canonicalRun: "*two*",
    });
    // Typing on the anchor a previous conversion left is typing in prose.
    const onAnchor = block(
      `<strong>one</strong><span class="caret-anchor">${CARET_ANCHOR} *two*</span>`,
      10, // raw characters: the anchor's zero-width space counts here
    );
    expect(typedFormatHit(onAnchor, typed("*"))).toMatchObject({ head: "**one** " });
  });

  it("needs a collapsed caret inside the block", () => {
    const el = block("**bold**");
    expect(typedFormatHit(el, typed("*"))).toBeNull();
  });
});

describe("paintTypedFormat", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("paints the run and parks the caret on an anchor after it", () => {
    const el = block("say **bold**", 12);
    const hit = typedFormatHit(el, typed("*"));
    expect(paintTypedFormat(el, hit, "say **bold**", new Set())).toBe(true);
    expect(el.querySelector("strong")?.textContent).toBe("bold");
    caretAfterAnchor(el, "strong");
    // The anchor is scaffolding: the block reads back as the bytes it holds.
    expect(domNodeToMarkdown(el)).toBe("say **bold**");
  });

  it("paints a run closed mid-block and keeps the text after it", () => {
    const el = block("the **mid** end", 11);
    const hit = typedFormatHit(el, typed("*"));
    expect(paintTypedFormat(el, hit, "the **mid** end", new Set())).toBe(true);
    caretAfterAnchor(el, "strong");
    expect(el.textContent).toBe(`the mid${CARET_ANCHOR} end`);
  });

  it("paints each kind after its own tag", () => {
    for (const [html, tag] of [
      ["*it*", "em"],
      ["`code`", "code"],
      ["~~old~~", "del"],
      ["==key==", "mark"],
      ["***both***", "strong"],
    ]) {
      const el = block(html, html.length);
      const hit = typedFormatHit(el, typed(html[html.length - 1]));
      expect(hit, html).not.toBeNull();
      expect(paintTypedFormat(el, hit, html, new Set()), html).toBe(true);
      caretAfterAnchor(el, tag);
    }
    // Bold-italic is a strong holding an em.
    expect(document.querySelector("strong > em")?.textContent).toBe("both");
  });

  it("paints an underscore run from its star-form text", () => {
    const el = block("see _it_ now", 8);
    const hit = typedFormatHit(el, typed("_"));
    expect(paintTypedFormat(el, hit, hit.newText, new Set())).toBe(true);
    expect(el.querySelector("em")?.textContent).toBe("it");
    caretAfterAnchor(el, "em");
    expect(domNodeToMarkdown(el)).toBe("see *it* now");
  });

  it("finds the element past an earlier bold, a soft break and an escaped star", () => {
    const el = block("<strong>one</strong><br>\\* a *two*", 13);
    const hit = typedFormatHit(el, typed("*"));
    expect(hit).toMatchObject({ head: "**one**\n\\* a ", canonicalRun: "*two*" });
    expect(paintTypedFormat(el, hit, "**one**\n\\* a *two*", new Set())).toBe(true);
    caretAfterAnchor(el, "em");
  });

  it("puts the block back when a lone earlier star pairs with the opener", () => {
    // The renderer's italic pass reads `* a *` before `*two*`; the file will
    // show that pairing at the next open, and the typed run stays literal now.
    const el = block("* a *two*", 9);
    const hit = typedFormatHit(el, typed("*"));
    expect(hit).toMatchObject({ canonicalRun: "*two*" });
    expect(paintTypedFormat(el, hit, "* a *two*", new Set())).toBe(false);
    expect(el.querySelector("em")).toBeNull();
  });

  it("puts the block back when the renderer pairs the markers differently", () => {
    // The renderer's italic pass takes `* y *` first; `*z*` never becomes an element.
    const el = block("x* y *z*", 8);
    const hit = typedFormatHit(el, typed("*"));
    expect(hit).toMatchObject({ canonicalRun: "*z*" });
    const before = el.innerHTML;
    expect(paintTypedFormat(el, hit, "x* y *z*", new Set())).toBe(false);
    expect(el.innerHTML).toBe(before);
    expect(el.querySelector(".caret-anchor")).toBeNull();
    const sel = window.getSelection();
    expect(sel.anchorNode).toBe(el.firstChild);
    expect(sel.anchorOffset).toBe(8);
  });
});
