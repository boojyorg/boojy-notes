/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  caretOffsetIn,
  overlaps,
  spellParagraphs,
  wordRanges,
} from "../../src/utils/spellingMarks";

afterEach(() => {
  document.body.innerHTML = "";
});

const editor = (html: string) => {
  document.body.innerHTML = `<div data-editor>${html}</div>`;
  return document.querySelector("[data-editor]") as HTMLElement;
};
const words = (html: string, wrong: string[], skipEnd = -1) =>
  spellParagraphs(editor(html)).flatMap((p) =>
    wordRanges(p, new Set(wrong), skipEnd).map((r) => r.toString()),
  );

describe("spellParagraphs", () => {
  it("reads each block apart, and a table cell apart from its neighbour", () => {
    const ps = spellParagraphs(
      editor(
        '<p data-block-id="a">One <b>two</b></p>' +
          '<div data-block-id="t"><span data-inline-field>left</span><span data-inline-field>right</span></div>',
      ),
    );
    expect(ps.map((p) => p.text)).toEqual(["One two", "left", "right"]);
  });

  it("reads a soft break as a newline and code, tags and links as one space", () => {
    const [p] = spellParagraphs(
      editor(
        '<p data-block-id="a">a<br>b <code>xyz</code>c<span class="inline-tag">#tagg</span>d<a href="x">lnk</a>e</p>',
      ),
    );
    expect(p.text).toBe("a\nb  c d e");
  });

  it("never reads a code block or frontmatter", () => {
    const ps = spellParagraphs(
      editor('<div data-block-id="c" data-block-type="code"><pre>teh</pre></div>'),
    );
    expect(ps.every((p) => !p.text.trim())).toBe(true);
  });
});

describe("wordRanges", () => {
  it("underlines every occurrence of a misspelled word, across a bold edge", () => {
    expect(
      words('<p data-block-id="a">teh cat, <b>re</b>cieve teh</p>', ["teh", "recieve"]),
    ).toEqual(["teh", "recieve", "teh"]);
  });

  it("leaves a word in code, a tag or a link alone even when it is on the list", () => {
    expect(
      words('<p data-block-id="a"><code>teh</code> <span class="inline-tag">#teh</span></p>', [
        "teh",
      ]),
    ).toEqual([]);
  });

  it("skips the word the caret has just typed, and only that one", () => {
    const [p] = spellParagraphs(editor('<p data-block-id="a">teh and teh</p>'));
    const node = p.pieces[0].node;
    const end = caretOffsetIn(p, node, 11);
    expect(wordRanges(p, new Set(["teh"]), end).map((r) => r.startOffset)).toEqual([0]);
  });
});

describe("overlaps", () => {
  it("is true for ranges sharing text, false for neighbours", () => {
    editor('<p data-block-id="a">abcdef</p>');
    const t = document.querySelector("p")?.firstChild as Text;
    const r = (a: number, b: number) => {
      const x = document.createRange();
      x.setStart(t, a);
      x.setEnd(t, b);
      return x;
    };
    expect(overlaps(r(0, 3), r(2, 5))).toBe(true);
    expect(overlaps(r(0, 3), r(3, 5))).toBe(false);
  });
});
