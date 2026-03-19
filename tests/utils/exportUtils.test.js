import { describe, it, expect } from "vitest";
import { blocksToHtml } from "../../src/utils/exportUtils.js";

describe("blocksToHtml", () => {
  it("wraps paragraph in <p>", () => {
    const html = blocksToHtml([{ type: "p", text: "Hello world" }]);
    expect(html).toContain("<p>Hello world</p>");
  });

  it("wraps heading in correct tag (h1, h2, h3)", () => {
    const html = blocksToHtml([
      { type: "h1", text: "Title" },
      { type: "h2", text: "Subtitle" },
      { type: "h3", text: "Section" },
    ]);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<h2>Subtitle</h2>");
    expect(html).toContain("<h3>Section</h3>");
  });

  it("renders bullet list items", () => {
    const html = blocksToHtml([
      { type: "bullet", text: "Item A" },
      { type: "bullet", text: "Item B" },
    ]);
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Item A</li>");
    expect(html).toContain("<li>Item B</li>");
    expect(html).toContain("</ul>");
  });

  it("renders numbered list items", () => {
    const html = blocksToHtml([
      { type: "numbered", text: "First" },
      { type: "numbered", text: "Second" },
    ]);
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>First</li>");
    expect(html).toContain("<li>Second</li>");
    expect(html).toContain("</ol>");
  });

  it("renders checkbox with checked/unchecked", () => {
    const html = blocksToHtml([
      { type: "checkbox", text: "Done task", checked: true },
      { type: "checkbox", text: "Open task", checked: false },
    ]);
    expect(html).toContain("\u2611 Done task");
    expect(html).toContain("\u2610 Open task");
  });

  it("renders code block", () => {
    const html = blocksToHtml([{ type: "code", text: "const x = 1;" }]);
    expect(html).toContain("<pre><code>const x = 1;</code></pre>");
  });

  it("renders blockquote for callout", () => {
    const html = blocksToHtml([
      { type: "callout", calloutType: "note", title: "Important", text: "Details here" },
    ]);
    expect(html).toContain("<blockquote>");
    expect(html).toContain("[NOTE]");
    expect(html).toContain("Important");
    expect(html).toContain("<p>Details here</p>");
    expect(html).toContain("</blockquote>");
  });

  it("renders image tag with src and alt", () => {
    const html = blocksToHtml([
      { type: "image", src: "https://example.com/img.png", alt: "My image" },
    ]);
    expect(html).toContain('<img src="https://example.com/img.png" alt="My image" />');
  });
});
