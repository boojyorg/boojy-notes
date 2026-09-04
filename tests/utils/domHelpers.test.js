/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  CARET_ANCHOR,
  caretLength,
  getCaretOffset,
  placeCaret,
  titleFieldText,
} from "../../src/utils/domHelpers.js";

function editable(html) {
  document.body.innerHTML = `<div contenteditable="true"><p id="b">${html}</p></div>`;
  return document.getElementById("b");
}

describe("getCaretOffset", () => {
  beforeEach(() => {
    window.getSelection().removeAllRanges();
  });

  it("is the inverse of placeCaret across inline markup", () => {
    const el = editable("Hello <strong>bold</strong> world");
    for (const pos of [0, 3, 6, 8, 10, 16]) {
      expect(placeCaret(el, pos)).toBe(true);
      expect(getCaretOffset(el)).toBe(pos);
    }
  });

  it("reports 0 for an empty block holding only the caret <br>", () => {
    const el = editable("<br>");
    placeCaret(el, 0);
    expect(getCaretOffset(el)).toBe(0);
  });

  it("returns -1 when the selection is elsewhere or absent", () => {
    const el = editable("Hello");
    expect(getCaretOffset(el)).toBe(-1);
    document.body.insertAdjacentHTML("beforeend", '<p id="other">Other</p>');
    placeCaret(document.getElementById("other"), 2);
    expect(getCaretOffset(el)).toBe(-1);
    expect(getCaretOffset(null)).toBe(-1);
  });

  it("skips the decorative icon inside external links, like placeCaret does", () => {
    const el = editable(
      'See <a href="https://x.y">site<span class="external-link-icon">↗</span></a> now',
    );
    placeCaret(el, 9); // "See site|" then " now"
    expect(getCaretOffset(el)).toBe(9);
  });
});

describe("titleFieldText", () => {
  // Chromium reads an emptied contentEditable (which keeps a <br> for the
  // caret) as "\n". Committed as the title, that named the file `_.md`.
  it("drops the trailing line break an emptied field reports", () => {
    const el = document.createElement("div");
    el.innerText = "\n"; // what Chromium's innerText reports for <br>
    expect(titleFieldText(el)).toBe("");
    el.innerText = "Meeting notes\n";
    expect(titleFieldText(el)).toBe("Meeting notes");
  });

  it("reads a plain title as is", () => {
    const el = document.createElement("div");
    el.textContent = "Notes: a/b?";
    expect(titleFieldText(el)).toBe("Notes: a/b?");
  });
});

describe("placeCaret — a caret at the end of a link lands outside it", () => {
  // Chromium canonicalises a caret at a link's edge to inside the link, so the
  // next keystroke extended the link (a completed [[wikilink]] became
  // `[[Beta|Beta after]]` on disk). The only anchor Chromium honours there is
  // a zero-width space after the link; it is dropped on the way to Markdown.
  const anchorAt = () => {
    const sel = window.getSelection();
    return { node: sel.anchorNode, offset: sel.anchorOffset };
  };

  it("anchors after a wikilink that ends the block", () => {
    const el = editable('see <span class="wikilink" data-target="Beta">Beta</span>');
    placeCaret(el, "see Beta".length);
    const { node, offset } = anchorAt();
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    expect(node.data).toBe(CARET_ANCHOR);
    expect(offset).toBe(1);
    expect(node.previousSibling.className).toBe("wikilink");
    // The anchor is not note text.
    expect(getCaretOffset(el)).toBe("see Beta".length);
  });

  it("anchors after a link that is followed by text", () => {
    const el = editable('see <a href="https://x.y">link</a> after');
    placeCaret(el, "see link".length);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(CARET_ANCHOR);
    expect(offset).toBe(1);
    expect(node.nextSibling.data).toBe(" after");
    // Placing there again reuses the anchor rather than stacking another.
    placeCaret(el, "see link".length);
    expect(el.textContent).toBe(`see link${CARET_ANCHOR} after`);
  });

  it("does not count anchors when placing later in the text", () => {
    const el = editable(`see <a href="https://x.y">link</a>${CARET_ANCHOR} after`);
    placeCaret(el, "see link af".length);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(`${CARET_ANCHOR} after`);
    expect(offset).toBe(" af".length + 1);
    expect(getCaretOffset(el)).toBe("see link af".length);
  });

  it("still lets bold and other formatting be extended", () => {
    const el = editable("see <strong>bold</strong>");
    placeCaret(el, "see bold".length);
    const { node } = anchorAt();
    expect(node.parentElement.tagName).toBe("STRONG");
    expect(el.textContent).toBe("see bold");
  });

  it("reaches past a wikilink in the end-of-element fallback", () => {
    const el = editable('see <span class="wikilink" data-target="Beta">Beta</span>');
    placeCaret(el, 999);
    const { node } = anchorAt();
    expect(node.data).toBe(CARET_ANCHOR);
    expect(node.previousSibling.className).toBe("wikilink");
  });
});

describe("soft breaks: a <br> is one caret position, the newline it stands for", () => {
  // Caret positions are measured in the block's Markdown text, where a soft
  // break is "\n". A block's final <br> keeps an empty last line visible and
  // stands for nothing.
  const anchorAt = () => {
    const sel = window.getSelection();
    return { node: sel.anchorNode, offset: sel.anchorOffset };
  };

  it("caretLength counts text plus soft breaks, not the trailing <br>", () => {
    expect(caretLength(editable("one<br>two"))).toBe("one\ntwo".length);
    expect(caretLength(editable("one<br><br>"))).toBe("one\n".length);
    expect(caretLength(editable("<br>"))).toBe(0);
    expect(caretLength(editable("plain"))).toBe(5);
  });

  it("places the caret at the start of the second line for the offset after the break", () => {
    const el = editable("one<br>two");
    placeCaret(el, "one\n".length);
    const { node, offset } = anchorAt();
    // Just after the <br>: on the second line, before "two".
    expect(node).toBe(el);
    expect(offset).toBe(2);
    expect(getCaretOffset(el)).toBe("one\n".length);
  });

  it("round-trips every offset across a break", () => {
    const el = editable("one<br>two");
    for (let pos = 0; pos <= "one\ntwo".length; pos++) {
      placeCaret(el, pos);
      expect(getCaretOffset(el), `offset ${pos}`).toBe(pos);
    }
  });

  it("reaches the empty last line after a trailing break", () => {
    const el = editable("one<br><br>");
    placeCaret(el, "one\n".length);
    const { node, offset } = anchorAt();
    expect(node).toBe(el);
    expect(offset).toBe(2); // between the two <br>s: the empty second line
    expect(getCaretOffset(el)).toBe("one\n".length);
  });
});
