/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import {
  inlineMarkdownToHtml,
  stripMarkdownFormatting,
  htmlToInlineMarkdown,
  sanitizeInlineHtml,
  domNodeToMarkdown,
} from "../../src/utils/inlineFormatting.js";

// --- inlineMarkdownToHtml ---

describe("inlineMarkdownToHtml", () => {
  it("returns empty string for falsy input", () => {
    expect(inlineMarkdownToHtml("")).toBe("");
    expect(inlineMarkdownToHtml(null)).toBe("");
    expect(inlineMarkdownToHtml(undefined)).toBe("");
  });

  it("escapes HTML entities", () => {
    expect(inlineMarkdownToHtml("<script>alert('xss')</script>")).toContain("&lt;script&gt;");
  });

  it("converts inline code", () => {
    expect(inlineMarkdownToHtml("`code`")).toBe("<code>code</code>");
  });

  it("converts bold+italic", () => {
    expect(inlineMarkdownToHtml("***bold italic***")).toBe("<strong><em>bold italic</em></strong>");
  });

  it("converts bold", () => {
    expect(inlineMarkdownToHtml("**bold**")).toBe("<strong>bold</strong>");
  });

  it("converts italic", () => {
    expect(inlineMarkdownToHtml("*italic*")).toBe("<em>italic</em>");
  });

  it("converts strikethrough", () => {
    expect(inlineMarkdownToHtml("~~deleted~~")).toBe("<del>deleted</del>");
  });

  it("converts highlight", () => {
    expect(inlineMarkdownToHtml("==marked==")).toBe("<mark>marked</mark>");
  });

  it("converts wikilinks", () => {
    const result = inlineMarkdownToHtml("[[My Note]]");
    expect(result).toContain('class="wikilink"');
    expect(result).toContain('data-target="My Note"');
    expect(result).toContain("My Note</span>");
  });

  it("converts aliased wikilinks", () => {
    const result = inlineMarkdownToHtml("[[Target|Display]]");
    expect(result).toContain('data-target="Target"');
    expect(result).toContain("Display</span>");
  });

  it("marks broken wikilinks", () => {
    const titles = new Set(["existing note"]);
    const result = inlineMarkdownToHtml("[[Missing Note]]", titles);
    expect(result).toContain("wikilink-broken");
  });

  it("converts markdown links", () => {
    const result = inlineMarkdownToHtml("[Click](https://example.com)");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("Click");
  });

  it("auto-links bare URLs", () => {
    const result = inlineMarkdownToHtml("Visit https://example.com today");
    expect(result).toContain('href="https://example.com"');
  });

  it("converts inline tags", () => {
    const result = inlineMarkdownToHtml("Hello #tag-name");
    expect(result).toContain('class="inline-tag"');
    expect(result).toContain("#tag-name");
  });

  it("handles mixed formatting", () => {
    const result = inlineMarkdownToHtml("**bold** and *italic* with `code`");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<em>italic</em>");
    expect(result).toContain("<code>code</code>");
  });

  // --- Bug fix regression tests ---

  it("escapes quotes in wikilink data-target", () => {
    const result = inlineMarkdownToHtml('[[He said "hello"]]');
    expect(result).toContain('data-target="He said &quot;hello&quot;"');
  });

  it("escapes quotes in aliased wikilink data-target", () => {
    const result = inlineMarkdownToHtml('[[She said "hi"|display]]');
    expect(result).toContain('data-target="She said &quot;hi&quot;"');
  });

  it("escapes quotes in markdown-link URLs (attribute-injection guard)", () => {
    const result = inlineMarkdownToHtml('[x](" onmouseover="alert(1))');
    // The stray " must be escaped so it can't break out of href/data-url
    expect(result).not.toContain('onmouseover="alert(1)"');
    expect(result).toContain("&quot;");
  });

  it("escapes quotes in bare URLs (attribute-injection guard)", () => {
    const result = inlineMarkdownToHtml('https://example.com/a"onmouseover="x');
    expect(result).not.toContain('onmouseover="x"');
    expect(result).toContain("&quot;");
  });

  it("does not match trailing punctuation in bare URLs", () => {
    const result = inlineMarkdownToHtml("See https://example.com.");
    // The period should NOT be part of the href
    expect(result).toContain('href="https://example.com"');
  });

  it("does not match trailing paren in bare URLs", () => {
    const result = inlineMarkdownToHtml("(https://example.com)");
    // The closing paren should NOT be part of the href
    expect(result).not.toContain('href="https://example.com)"');
  });

  it("does not double-link URLs inside markdown links", () => {
    const result = inlineMarkdownToHtml("[Click](https://example.com)");
    // Should have exactly one <a> tag, not a nested auto-link
    const aCount = (result.match(/<a /g) || []).length;
    expect(aCount).toBe(1);
  });

  it("handles italic inside bold correctly", () => {
    // **bold *italic* bold** — italic inside bold should not break bold
    const result = inlineMarkdownToHtml("**bold *italic* bold**");
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>italic</em>");
  });

  it("does not treat ** markers as italic", () => {
    // Lone ** should become bold, not be consumed by italic regex
    const result = inlineMarkdownToHtml("**bold text**");
    expect(result).toBe("<strong>bold text</strong>");
    expect(result).not.toContain("<em>");
  });

  // A backslash escape is shown as written, the way Obsidian's live preview
  // shows it: hiding it looked tidier, but the DOM walker read the text back
  // without it, so `\*not italic\*` became `*not italic*` on the first edit
  // and rendered as italic on the next repaint.
  it("shows backslash-escaped asterisks literally and never as italic", () => {
    const result = inlineMarkdownToHtml("\\*not italic\\*");
    expect(result).not.toContain("<em>");
    expect(result).toBe("\\*not italic\\*");
  });

  it("shows backslash-escaped tildes literally and never as strikethrough", () => {
    const result = inlineMarkdownToHtml("\\~\\~not deleted\\~\\~");
    expect(result).not.toContain("<del>");
    expect(result).toBe("\\~\\~not deleted\\~\\~");
  });

  it("shows backslash-escaped backticks literally and never as code", () => {
    const result = inlineMarkdownToHtml("\\`not code\\`");
    expect(result).not.toContain("<code>");
    expect(result).toBe("\\`not code\\`");
  });

  it("keeps every escape through the edit path: render, walk, serialise", () => {
    const cases = [
      "\\*not italic\\*",
      "\\~\\~kept\\~\\~",
      "\\`not code\\`",
      "\\=\\=not marked\\=\\=",
      "\\[not a link\\]",
      "\\[\\[not a wikilink\\]\\]",
      "\\# not a tag",
      "mixed **bold** and \\*escaped\\* and [[Real]]",
    ];
    for (const md of cases) {
      const html = inlineMarkdownToHtml(md);
      expect(htmlToInlineMarkdown(html), md).toBe(md);
      expect(domNodeToMarkdown(makeEl(html)), md).toBe(md);
    }
    expect(inlineMarkdownToHtml("\\[\\[not a wikilink\\]\\]")).not.toContain("class=");
  });

  it("handles & in HTML entity escaping", () => {
    const result = inlineMarkdownToHtml("Tom & Jerry");
    expect(result).toContain("Tom &amp; Jerry");
  });

  it("double-escapes pre-existing entities correctly", () => {
    const result = inlineMarkdownToHtml("already &lt; escaped");
    expect(result).toContain("&amp;lt;");
  });
});

// --- stripMarkdownFormatting ---

describe("stripMarkdownFormatting", () => {
  it("returns empty for falsy input", () => {
    expect(stripMarkdownFormatting("")).toBe("");
    expect(stripMarkdownFormatting(null)).toBe("");
  });

  it("strips bold", () => {
    expect(stripMarkdownFormatting("**bold**")).toBe("bold");
  });

  it("strips italic", () => {
    expect(stripMarkdownFormatting("*italic*")).toBe("italic");
  });

  it("strips bold+italic", () => {
    expect(stripMarkdownFormatting("***both***")).toBe("both");
  });

  it("strips inline code", () => {
    expect(stripMarkdownFormatting("`code`")).toBe("code");
  });

  it("strips strikethrough", () => {
    expect(stripMarkdownFormatting("~~deleted~~")).toBe("deleted");
  });

  it("strips highlight", () => {
    expect(stripMarkdownFormatting("==marked==")).toBe("marked");
  });

  it("strips wikilinks", () => {
    expect(stripMarkdownFormatting("[[My Note]]")).toBe("My Note");
    expect(stripMarkdownFormatting("[[Target|Display]]")).toBe("Display");
  });

  it("strips markdown links", () => {
    expect(stripMarkdownFormatting("[text](url)")).toBe("text");
  });

  it("strips all formatting in mixed text", () => {
    expect(stripMarkdownFormatting("**bold** and *italic* with `code`")).toBe(
      "bold and italic with code",
    );
  });
});

// --- htmlToInlineMarkdown ---

describe("htmlToInlineMarkdown", () => {
  it("returns empty for falsy input", () => {
    expect(htmlToInlineMarkdown("")).toBe("");
    expect(htmlToInlineMarkdown(null)).toBe("");
  });

  it("passes through plain text", () => {
    expect(htmlToInlineMarkdown("hello world")).toBe("hello world");
  });

  it("converts strong to bold", () => {
    expect(htmlToInlineMarkdown("<strong>bold</strong>")).toBe("**bold**");
  });

  it("converts b to bold", () => {
    expect(htmlToInlineMarkdown("<b>bold</b>")).toBe("**bold**");
  });

  it("converts em to italic", () => {
    expect(htmlToInlineMarkdown("<em>italic</em>")).toBe("*italic*");
  });

  it("converts i to italic", () => {
    expect(htmlToInlineMarkdown("<i>italic</i>")).toBe("*italic*");
  });

  it("converts code", () => {
    expect(htmlToInlineMarkdown("<code>code</code>")).toBe("`code`");
  });

  it("converts del to strikethrough", () => {
    expect(htmlToInlineMarkdown("<del>deleted</del>")).toBe("~~deleted~~");
  });

  it("converts mark to highlight", () => {
    expect(htmlToInlineMarkdown("<mark>highlighted</mark>")).toBe("==highlighted==");
  });

  it("converts wikilink span", () => {
    const html = '<span class="wikilink" data-target="My Note">My Note</span>';
    expect(htmlToInlineMarkdown(html)).toBe("[[My Note]]");
  });

  it("converts aliased wikilink span", () => {
    const html = '<span class="wikilink" data-target="Target">Display</span>';
    expect(htmlToInlineMarkdown(html)).toBe("[[Target|Display]]");
  });

  it("converts link to markdown", () => {
    const html =
      '<a href="https://example.com">Click<span class="external-link-icon">\u2197</span></a>';
    expect(htmlToInlineMarkdown(html)).toBe("[Click](https://example.com)");
  });

  it("converts bare URL link", () => {
    const html =
      '<a href="https://example.com">https://example.com<span class="external-link-icon">\u2197</span></a>';
    expect(htmlToInlineMarkdown(html)).toBe("https://example.com");
  });
});

// --- sanitizeInlineHtml ---

describe("sanitizeInlineHtml", () => {
  it("returns empty for falsy input", () => {
    expect(sanitizeInlineHtml("")).toBe("");
    expect(sanitizeInlineHtml(null)).toBe("");
  });

  it("preserves allowed tags", () => {
    const result = sanitizeInlineHtml("<strong>bold</strong>");
    expect(result).toContain("<strong>");
    expect(result).toContain("bold");
  });

  it("normalizes b to strong", () => {
    const result = sanitizeInlineHtml("<b>bold</b>");
    expect(result).toContain("<strong>");
    expect(result).toContain("bold");
    expect(result).not.toContain("<b>");
  });

  it("normalizes i to em", () => {
    const result = sanitizeInlineHtml("<i>italic</i>");
    expect(result).toContain("<em>");
    expect(result).toContain("italic");
    expect(result).not.toContain("<i>");
  });

  it("strips unknown tags but keeps content", () => {
    const result = sanitizeInlineHtml("<div><font>text</font></div>");
    expect(result).toContain("text");
    expect(result).not.toContain("<font>");
  });

  it("strips empty formatting tags", () => {
    expect(sanitizeInlineHtml("<strong>  </strong>")).toBe("");
  });
});

// --- domNodeToMarkdown ---

function makeEl(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("domNodeToMarkdown", () => {
  it("returns empty for null", () => {
    expect(domNodeToMarkdown(null)).toBe("");
  });

  it("returns plain text from text nodes", () => {
    expect(domNodeToMarkdown(makeEl("hello world"))).toBe("hello world");
  });

  it("converts strong to bold markdown", () => {
    expect(domNodeToMarkdown(makeEl("<strong>bold</strong>"))).toBe("**bold**");
  });

  it("converts b to bold markdown", () => {
    expect(domNodeToMarkdown(makeEl("<b>bold</b>"))).toBe("**bold**");
  });

  it("converts em to italic markdown", () => {
    expect(domNodeToMarkdown(makeEl("<em>italic</em>"))).toBe("*italic*");
  });

  it("converts i to italic markdown", () => {
    expect(domNodeToMarkdown(makeEl("<i>italic</i>"))).toBe("*italic*");
  });

  it("converts code to backticks", () => {
    expect(domNodeToMarkdown(makeEl("<code>x</code>"))).toBe("`x`");
  });

  it("converts del to strikethrough", () => {
    expect(domNodeToMarkdown(makeEl("<del>deleted</del>"))).toBe("~~deleted~~");
  });

  it("converts mark to highlight", () => {
    expect(domNodeToMarkdown(makeEl("<mark>highlighted</mark>"))).toBe("==highlighted==");
  });

  it("converts wikilink span", () => {
    const html = '<span class="wikilink" data-target="My Note">My Note</span>';
    expect(domNodeToMarkdown(makeEl(html))).toBe("[[My Note]]");
  });

  it("converts aliased wikilink span", () => {
    const html = '<span class="wikilink" data-target="Target">Display</span>';
    expect(domNodeToMarkdown(makeEl(html))).toBe("[[Target|Display]]");
  });

  it("converts link with different text to markdown link", () => {
    const html =
      '<a href="https://example.com">Click<span class="external-link-icon">\u2197</span></a>';
    expect(domNodeToMarkdown(makeEl(html))).toBe("[Click](https://example.com)");
  });

  it("converts bare URL link to plain URL", () => {
    const html =
      '<a href="https://example.com">https://example.com<span class="external-link-icon">\u2197</span></a>';
    expect(domNodeToMarkdown(makeEl(html))).toBe("https://example.com");
  });

  it("skips external-link-icon spans", () => {
    const html = 'text<span class="external-link-icon">\u2197</span>more';
    expect(domNodeToMarkdown(makeEl(html))).toBe("textmore");
  });

  it("passes through inline-tag spans", () => {
    const html = '<span class="inline-tag">#mytag</span>';
    expect(domNodeToMarkdown(makeEl(html))).toBe("#mytag");
  });

  it("skips empty formatting elements", () => {
    expect(domNodeToMarkdown(makeEl("<strong>  </strong>"))).toBe("");
  });

  it("handles nested formatting", () => {
    expect(domNodeToMarkdown(makeEl("<strong><em>both</em></strong>"))).toBe("***both***");
  });

  it("handles mixed content", () => {
    const html = "hello <strong>bold</strong> and <em>italic</em>";
    expect(domNodeToMarkdown(makeEl(html))).toBe("hello **bold** and *italic*");
  });

  it("produces same output as htmlToInlineMarkdown for typical content", () => {
    const cases = [
      "<strong>bold</strong> text",
      "<em>italic</em>",
      "<code>code</code>",
      '<span class="wikilink" data-target="Note">Note</span>',
      "<del>deleted</del>",
      "<mark>marked</mark>",
    ];
    for (const html of cases) {
      expect(domNodeToMarkdown(makeEl(html))).toBe(htmlToInlineMarkdown(html));
    }
  });
});

describe("caret anchors never reach Markdown", () => {
  // placeCaret parks the caret on a zero-width space after a link (domHelpers
  // CARET_ANCHOR); it is editor scaffolding and both converters drop it.
  it("htmlToInlineMarkdown drops the zero-width space after a link", () => {
    expect(
      htmlToInlineMarkdown('see <span class="wikilink" data-target="Beta">Beta</span>\u200B after'),
    ).toBe("see [[Beta]] after");
  });

  it("domNodeToMarkdown drops it from a live element", () => {
    const el = document.createElement("p");
    el.innerHTML = 'see <span class="wikilink" data-target="Beta">Beta</span>\u200B after';
    expect(domNodeToMarkdown(el)).toBe("see [[Beta]] after");
  });
});

describe("soft breaks: a newline inside block text is a visible line break", () => {
  // The paragraph model's foundation (PR A): the renderer never turned a
  // newline back into a <br>, so a Shift+Enter break collapsed to a space on
  // the next repaint. The DOM→Markdown walkers already read <br> as "\n" and
  // ignore a block's final <br>, so the two directions agree.
  it("renders each newline as one <br>", () => {
    expect(inlineMarkdownToHtml("one\ntwo")).toBe("one<br>two");
    expect(inlineMarkdownToHtml("a\nb\nc")).toBe("a<br>b<br>c");
  });

  it("gives a trailing newline a second <br> so the empty last line is visible", () => {
    expect(inlineMarkdownToHtml("one\n")).toBe("one<br><br>");
  });

  it("reads the rendered breaks back as the same text", () => {
    for (const text of ["one\ntwo", "a\nb\nc", "one\n"]) {
      expect(htmlToInlineMarkdown(inlineMarkdownToHtml(text))).toBe(text);
      const el = document.createElement("p");
      el.innerHTML = inlineMarkdownToHtml(text);
      expect(domNodeToMarkdown(el)).toBe(text);
    }
  });

  it("keeps a hard break's trailing spaces on the line before the break", () => {
    expect(inlineMarkdownToHtml("hard  \nbreak")).toBe("hard  <br>break");
    expect(htmlToInlineMarkdown("hard  <br>break")).toBe("hard  \nbreak");
  });

  it("does not let inline formatting span a line break", () => {
    expect(inlineMarkdownToHtml("**a\nb**")).toBe("**a<br>b**");
  });
});
