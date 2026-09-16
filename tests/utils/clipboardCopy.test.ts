/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { blockCopyPayload, inlineCopyPayload } from "../../src/utils/clipboardCopy";
import type { CopiedBlock } from "../../src/utils/clipboardCopy";

const p = (text: string): CopiedBlock => ({ type: "p", text });
const h = (level: number, text: string): CopiedBlock => ({ type: `h${level}` as "h1", text });
const li = (text: string, indent = 0): CopiedBlock => ({ type: "bullet", text, indent });
const num = (text: string, n?: number, indent = 0): CopiedBlock => ({
  type: "numbered",
  text,
  indent,
  ...(n === undefined ? {} : { num: n }),
});
const todo = (text: string, checked: boolean): CopiedBlock => ({ type: "checkbox", text, checked });

describe("blockCopyPayload: a whole-block copy is Markdown and block HTML", () => {
  it("the reported case: headings, paragraphs and a bullet keep their structure", () => {
    const { text, html } = blockCopyPayload([
      h(1, "PSYC327"),
      h(2, "Assessments"),
      p("30% Coursework – Blog"),
      p("70% Online Exam"),
      li("Psychology module"),
    ]);
    expect(text).toBe(
      "# PSYC327\n## Assessments\n30% Coursework – Blog\n\n70% Online Exam\n- Psychology module",
    );
    expect(html).toBe(
      "<h1>PSYC327</h1><h2>Assessments</h2><p>30% Coursework – Blog</p><p>70% Online Exam</p><ul><li>Psychology module</li></ul>",
    );
  });

  it("a nested bullet list nests its HTML and indents its Markdown", () => {
    const { text, html } = blockCopyPayload([li("a"), li("b", 1), li("c", 1), li("d")]);
    expect(text).toBe("- a\n  - b\n  - c\n- d");
    expect(html).toBe("<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>");
  });

  it("a numbered run copied from the middle of a list keeps its start", () => {
    const { text, html } = blockCopyPayload([num("x", 3), num("y", 4)]);
    expect(text).toBe("3. x\n4. y");
    expect(html).toBe('<ol start="3"><li>x</li><li>y</li></ol>');
    expect(blockCopyPayload([num("x"), num("y")]).html).toBe("<ol><li>x</li><li>y</li></ol>");
  });

  it("a list type change at the same depth starts a new list", () => {
    const { html } = blockCopyPayload([li("a"), num("b", 1), todo("c", true), todo("d", false)]);
    expect(html).toBe(
      '<ul><li>a</li></ul><ol><li>b</li></ol><ul><li><input type="checkbox" checked disabled> c</li><li><input type="checkbox" disabled> d</li></ul>',
    );
    expect(blockCopyPayload([todo("c", true), todo("d", false)]).text).toBe("- [x] c\n- [ ] d");
  });

  it("links: the ↗ icon and editor classes go, a wikilink keeps its notation, a tag is text", () => {
    const md = "see [docs](https://x.com) and [[Beta]] or [[Beta|B]] #tag https://a.com";
    const { text, html } = blockCopyPayload([p(md)]);
    expect(text).toBe(md);
    expect(html).toBe(
      '<p>see <a href="https://x.com">docs</a> and [[Beta]] or [[Beta|B]] #tag <a href="https://a.com">https://a.com</a></p>',
    );
    expect(html).not.toContain("↗");
  });

  it("inline formatting renders as elements, in a heading too", () => {
    const { html } = blockCopyPayload([p("**b** *i* `c` ~~s~~ ==h=="), h(2, "Release **day**")]);
    expect(html).toBe(
      "<p><strong>b</strong> <em>i</em> <code>c</code> <del>s</del> <mark>h</mark></p><h2>Release <strong>day</strong></h2>",
    );
  });

  it("a soft break is a <br>, an empty row an empty paragraph, and text is escaped", () => {
    const { text, html } = blockCopyPayload([p("a\nb"), p(""), p("1 < 2 & 3")]);
    // A blank line between paragraphs is structure; the empty row is one more.
    expect(text).toBe("a\nb\n\n\n1 < 2 & 3");
    expect(html).toBe("<p>a<br>b</p><p></p><p>1 &lt; 2 &amp; 3</p>");
  });

  it("quote, code, divider, table and callout", () => {
    const { text, html } = blockCopyPayload([
      { type: "blockquote", text: "q1\nq2" },
      { type: "code", text: "let a = 1 < 2;", lang: "js" },
      { type: "code", text: "plain" },
      { type: "spacer", text: "" },
      {
        type: "table",
        text: "",
        rows: [
          ["H1", "H2"],
          ["a", "**b**"],
        ],
      },
      { type: "callout", calloutType: "warning", title: "Careful", text: "body" },
      { type: "callout", calloutType: "note", title: "", text: "" },
    ]);
    expect(text).toBe(
      [
        "> q1",
        "> q2",
        "```js",
        "let a = 1 < 2;",
        "```",
        "```",
        "plain",
        "```",
        "---",
        "| H1 | H2 |",
        "| --- | --- |",
        "| a | **b** |",
        "> [!warning] Careful",
        "> body",
        "> [!note]",
      ].join("\n"),
    );
    expect(html).toBe(
      "<blockquote><p>q1<br>q2</p></blockquote>" +
        '<pre><code class="language-js">let a = 1 &lt; 2;</code></pre>' +
        "<pre><code>plain</code></pre>" +
        "<hr>" +
        "<table><thead><tr><th>H1</th><th>H2</th></tr></thead><tbody><tr><td>a</td><td><strong>b</strong></td></tr></tbody></table>" +
        "<blockquote><p><strong>Careful</strong></p><p>body</p></blockquote>" +
        "<blockquote><p><strong>Note</strong></p></blockquote>",
    );
  });

  it("an image, a file and an embed stay references; frontmatter is its source", () => {
    const { text, html } = blockCopyPayload([
      { type: "frontmatter", text: "title: x" },
      { type: "image", src: "pic.png", text: "", width: 100 },
      { type: "image", src: "https://x.com/a.png", alt: "alt", format: "md", text: "" },
      { type: "file", src: "doc.pdf", text: "" },
      { type: "embed", target: "Other", text: "" },
    ]);
    expect(text).toBe(
      "---\ntitle: x\n---\n![[pic.png]]\n![alt](https://x.com/a.png)\n![[doc.pdf]]\n![[Other]]",
    );
    expect(html).toBe(
      "<pre>---\ntitle: x\n---</pre><p>![[pic.png]]</p><p>![alt](https://x.com/a.png)</p><p>![[doc.pdf]]</p><p>![[Other]]</p>",
    );
  });
});

describe("inlineCopyPayload: an ordinary selection is its visible text and inline HTML", () => {
  const link =
    '<a href="https://x.com" class="external-link" data-url="https://x.com">docs<span class="external-link-icon" contenteditable="false">↗</span></a>';
  const bare =
    '<a href="https://a.com" class="external-link bare-url" data-url="https://a.com">https://a.com<span class="external-link-icon" contenteditable="false">↗</span></a>';

  it("formatting markers are not added to the plain text; the HTML keeps the elements", () => {
    const { text, html } = inlineCopyPayload(
      "see <strong>bold</strong> and <em>it</em> <code>c</code>",
    );
    expect(text).toBe("see bold and it c");
    expect(html).toBe("see <strong>bold</strong> and <em>it</em> <code>c</code>");
  });

  it("a link is its text in plain and a bare anchor in HTML; the ↗ goes from both", () => {
    const { text, html } = inlineCopyPayload(`read ${link} at ${bare}`);
    expect(text).toBe("read docs at https://a.com");
    expect(html).toBe(
      'read <a href="https://x.com">docs</a> at <a href="https://a.com">https://a.com</a>',
    );
  });

  it("a wikilink keeps its notation in both formats; a tag is its text", () => {
    const { text, html } = inlineCopyPayload(
      'to <span class="wikilink" data-target="Beta">Beta</span>, <span class="wikilink wikilink-broken" data-target="Gone">Alias</span> <span class="inline-tag" data-tag="t">#t</span>',
    );
    expect(text).toBe("to [[Beta]], [[Gone|Alias]] #t");
    expect(html).toBe("to [[Beta]], [[Gone|Alias]] #t");
  });

  it("a soft break is a newline; a trailing <br> is the block's own and is dropped", () => {
    const { text, html } = inlineCopyPayload("a<br>b<br>");
    expect(text).toBe("a\nb");
    expect(html).toBe("a<br>b");
  });

  it("a backslash escape is the visible text it is", () => {
    const { text, html } = inlineCopyPayload("\\*not italic\\*");
    expect(text).toBe("\\*not italic\\*");
    expect(html).toBe("\\*not italic\\*");
  });
});
