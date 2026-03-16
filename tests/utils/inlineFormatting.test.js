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
    expect(inlineMarkdownToHtml("***bold italic***")).toBe(
      "<strong><em>bold italic</em></strong>",
    );
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
    const html = '<a href="https://example.com">Click<span class="external-link-icon">\u2197</span></a>';
    expect(htmlToInlineMarkdown(html)).toBe("[Click](https://example.com)");
  });

  it("converts bare URL link", () => {
    const html = '<a href="https://example.com">https://example.com<span class="external-link-icon">\u2197</span></a>';
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
    const html = '<a href="https://example.com">Click<span class="external-link-icon">\u2197</span></a>';
    expect(domNodeToMarkdown(makeEl(html))).toBe("[Click](https://example.com)");
  });

  it("converts bare URL link to plain URL", () => {
    const html = '<a href="https://example.com">https://example.com<span class="external-link-icon">\u2197</span></a>';
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
