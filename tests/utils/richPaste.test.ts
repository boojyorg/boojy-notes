/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { markdownToBlocks } from "../../src/utils/markdown";
import { richPasteMarkdown } from "../../src/utils/richPaste";

/** The blocks a paste of `html` becomes, as type and text. */
const blocks = (html: string) =>
  markdownToBlocks(richPasteMarkdown(html) ?? "").map((b: { type: string; text?: string }) => [
    b.type,
    b.text,
  ]);

describe("richPasteMarkdown", () => {
  it("keeps each paragraph's bold, italics and links", () => {
    expect(
      richPasteMarkdown(
        '<p><b>bold</b> one</p><p><i>italic</i> two</p><p><a href="https://example.com">link</a> three</p>',
      ),
    ).toBe("**bold** one\n\n*italic* two\n\n[link](https://example.com) three");
  });

  it("reads headings, a nested list with its start, a task list, a quote and a rule", () => {
    const md = richPasteMarkdown(
      "<h2>Plan</h2>" +
        '<ol start="3"><li>three<ul><li>nested</li></ul></li><li><b>four</b></li></ol>' +
        '<ul><li><input type="checkbox" checked> done</li><li><input type="checkbox"> todo</li></ul>' +
        "<blockquote><p>quoted <em>words</em></p></blockquote><hr><p>after</p>",
    );
    expect(md).toBe(
      [
        "## Plan",
        "3. three\n   - nested\n4. **four**",
        "- [x] done\n- [ ] todo",
        "> quoted *words*",
        "---",
        "after",
      ].join("\n\n"),
    );
  });

  it("keeps a code block's text and lines exactly, in a fence longer than its backticks", () => {
    expect(richPasteMarkdown("<pre><code>a  =  1\n``b``\n</code></pre>")).toBe(
      "```\na  =  1\n``b``\n```",
    );
  });

  it("reads a table, the first row as its header", () => {
    expect(
      richPasteMarkdown(
        "<table><tr><th>Name</th><th>Note</th></tr><tr><td><b>A</b></td><td>x | y</td></tr></table>",
      ),
    ).toBe("| Name | Note |\n| --- | --- |\n| **A** | x \\| y |");
  });

  it("a <br> is a soft break inside one paragraph", () => {
    expect(blocks("<p><b>one</b><br>two</p><p>three</p>")).toEqual([
      ["p", "**one**\ntwo"],
      ["p", "three"],
    ]);
  });

  it("collapses the page source's whitespace", () => {
    expect(richPasteMarkdown("<div>\n  <p>\n    some\n    <b>bold</b>\n  </p>\n</div>")).toBe(
      "some **bold**",
    );
  });

  it("Google Docs: the whole-document <b> is not bold; its styled spans are", () => {
    const docs =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">' +
      '<p><span style="font-weight:700;">Heavy</span> plain</p>' +
      '<p><span style="font-style:italic;">Slanted</span> plain</p></b>';
    expect(richPasteMarkdown(docs)).toBe("**Heavy** plain\n\n*Slanted* plain");
  });

  it("keeps only links with a web or mail address", () => {
    expect(
      richPasteMarkdown(
        '<p><a href="/wiki/Foo">relative</a> <a href="javascript:alert(1)">script</a> <a href="mailto:a@b.c">mail</a> <b>x</b></p>',
      ),
    ).toBe("relative script [mail](mailto:a@b.c) **x**");
  });

  it("drops what is never content", () => {
    expect(
      richPasteMarkdown(
        '<style>p{}</style><p><b>kept</b></p><script>x()</script><img src="a.png">',
      ),
    ).toBe("**kept**");
  });

  it("is null for HTML with no formatting, so the plain text is pasted as before", () => {
    // VS Code's clipboard: a <div> per line and colour spans. Read as blocks,
    // every line of a pasted fence would be a paragraph of its own.
    const vscode =
      '<div style="color: #d4d4d4;"><div><span style="color: #569cd6;">```js</span></div>' +
      "<div><span>let a = 1;</span></div><div><span>```</span></div></div>";
    expect(richPasteMarkdown(vscode)).toBeNull();
    expect(richPasteMarkdown("<p>just</p><p>text</p>")).toBeNull();
    expect(richPasteMarkdown("")).toBeNull();
  });
});
