/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  CARET_ANCHOR,
  CARET_ANCHOR_CLASS,
  caretLength,
  caretOutOfLinkEnd,
  getCaretOffset,
  linkText,
  placeCaret,
  titleFieldText,
} from "../../src/utils/domHelpers.js";

function editable(html) {
  document.body.innerHTML = `<div contenteditable="true"><p id="b">${html}</p></div>`;
  return document.getElementById("b");
}

/** The anchor as the editor makes it, with `typed` text landed on it. */
const anchorHtml = (typed = "") =>
  `<span class="${CARET_ANCHOR_CLASS}">${CARET_ANCHOR}${typed}</span>`;

describe("linkText", () => {
  it("is the link's text without its ↗ icon, a typed ↗ included", () => {
    document.body.innerHTML =
      '<a id="l" href="https://x.y">north ↗<span class="external-link-icon" contenteditable="false">↗</span></a>';
    expect(linkText(document.getElementById("l"))).toBe("north ↗");
  });
});

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
  // a zero-width space after the link. It sits in a `caret-anchor` span, which
  // is what marks it as scaffolding: the walkers drop that one and keep a
  // U+200B the file itself holds.
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
    expect(node.parentElement.className).toBe(CARET_ANCHOR_CLASS);
    expect(node.parentElement.previousSibling.className).toBe("wikilink");
    // The anchor is not note text.
    expect(getCaretOffset(el)).toBe("see Beta".length);
    expect(caretLength(el)).toBe("see Beta".length);
  });

  it("anchors after a link that is followed by text", () => {
    const el = editable('see <a href="https://x.y">link</a> after');
    placeCaret(el, "see link".length);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(CARET_ANCHOR);
    expect(offset).toBe(1);
    expect(node.parentElement.nextSibling.data).toBe(" after");
    // Placing there again reuses the anchor rather than stacking another.
    placeCaret(el, "see link".length);
    expect(el.querySelectorAll(`.${CARET_ANCHOR_CLASS}`).length).toBe(1);
    expect(el.textContent).toBe(`see link${CARET_ANCHOR} after`);
  });

  it("does not count anchors when placing later in the text", () => {
    const el = editable(`see <a href="https://x.y">link</a>${anchorHtml()} after`);
    placeCaret(el, "see link af".length);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(" after");
    expect(offset).toBe(" af".length);
    expect(getCaretOffset(el)).toBe("see link af".length);
  });

  it("counts text typed on the anchor, and the anchor's space alone is skipped", () => {
    // Typing on the anchor lands inside its span: "\u200Bxy" after the link.
    const el = editable(`see <a href="https://x.y">link</a>${anchorHtml("xy")} after`);
    expect(caretLength(el)).toBe("see linkxy after".length);
    placeCaret(el, "see linkx".length);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(`${CARET_ANCHOR}xy`);
    expect(offset).toBe(2);
    expect(getCaretOffset(el)).toBe("see linkx".length);
  });

  it("counts a zero-width space that is the note's own as a character", () => {
    // A U+200B in the file (escapes-unicode.md in the preservation corpus) is
    // text, not scaffolding: it is one caret position, like any character.
    const el = editable("zero-width\u200Bspace");
    expect(caretLength(el)).toBe("zero-width\u200Bspace".length);
    placeCaret(el, "zero-width\u200Bs".length);
    expect(anchorAt().offset).toBe("zero-width\u200Bs".length);
    expect(getCaretOffset(el)).toBe("zero-width\u200Bs".length);
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
    expect(node.parentElement.previousSibling.className).toBe("wikilink");
  });
});

describe("caretOutOfLinkEnd — a browser-placed caret at the end of a link moves outside", () => {
  // End, a click past the link or on its right edge, and ArrowRight all leave
  // Chromium's caret at the last offset of the link's own text node. Called
  // from beforeinput, this moves it onto the anchor placeCaret would have
  // used, so the insertion lands outside the link.
  const root = () => document.querySelector("[contenteditable]");
  const setCaret = (node, offset) => {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const anchorAt = () => {
    const sel = window.getSelection();
    return { node: sel.anchorNode, offset: sel.anchorOffset };
  };

  it("moves a caret at the end of a wikilink that ends the block onto an anchor after it", () => {
    const el = editable('See <span class="wikilink" data-target="Welcome">Welcome</span>');
    const linkText = el.querySelector(".wikilink").firstChild;
    setCaret(linkText, "Welcome".length);
    expect(caretOutOfLinkEnd(root())).toBe(true);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(CARET_ANCHOR);
    expect(offset).toBe(1);
    expect(node.parentElement.className).toBe(CARET_ANCHOR_CLASS);
    expect(node.parentElement.previousSibling.className).toBe("wikilink");
    // Same Markdown position, just outside the link; the anchor is not text.
    expect(getCaretOffset(el)).toBe("See Welcome".length);
    expect(el.querySelector(".wikilink").textContent).toBe("Welcome");
  });

  it("moves a caret on the seam between a link and the text after it", () => {
    const el = editable('See <a href="https://x.y">site</a> now');
    const linkText = el.querySelector("a").firstChild;
    setCaret(linkText, "site".length);
    expect(caretOutOfLinkEnd(root())).toBe(true);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(CARET_ANCHOR);
    expect(offset).toBe(1);
    expect(node.parentElement.nextSibling.data).toBe(" now");
    expect(el.textContent).toBe(`See site${CARET_ANCHOR} now`);
  });

  it("reuses an anchor already after the link rather than stacking another", () => {
    const el = editable(`See <a href="https://x.y">site</a>${anchorHtml()} now`);
    setCaret(el.querySelector("a").firstChild, "site".length);
    expect(caretOutOfLinkEnd(root())).toBe(true);
    expect(el.textContent).toBe(`See site${CARET_ANCHOR} now`);
    expect(anchorAt().node).toBe(el.querySelector("a").nextSibling.firstChild);
  });

  it("puts the zero-width space back into an anchor it was deleted from", () => {
    // Backspace on the anchor removes its character and can leave the span.
    const el = editable(
      `See <a href="https://x.y">site</a><span class="${CARET_ANCHOR_CLASS}"></span> now`,
    );
    setCaret(el.querySelector("a").firstChild, "site".length);
    expect(caretOutOfLinkEnd(root())).toBe(true);
    expect(el.querySelectorAll(`.${CARET_ANCHOR_CLASS}`).length).toBe(1);
    expect(anchorAt().node.data).toBe(CARET_ANCHOR);
    expect(anchorAt().offset).toBe(1);
  });

  it("leaves a caret inside a link alone, so alias editing still works", () => {
    const el = editable('See <span class="wikilink" data-target="Welcome">Welcome</span>');
    const linkText = el.querySelector(".wikilink").firstChild;
    for (const offset of [0, 3, "Welcome".length - 1]) {
      setCaret(linkText, offset);
      expect(caretOutOfLinkEnd(root())).toBe(false);
      expect(anchorAt()).toEqual({ node: linkText, offset });
    }
    expect(el.textContent).toBe("See Welcome");
  });

  it("leaves a caret outside any link alone, including at the end of bold text", () => {
    const el = editable('See <strong>bold</strong> and <a href="https://x.y">site</a> now');
    const bold = el.querySelector("strong").firstChild;
    setCaret(bold, "bold".length);
    expect(caretOutOfLinkEnd(root())).toBe(false);
    expect(anchorAt()).toEqual({ node: bold, offset: "bold".length });
    const tail = el.lastChild;
    setCaret(tail, 1);
    expect(caretOutOfLinkEnd(root())).toBe(false);
    expect(anchorAt()).toEqual({ node: tail, offset: 1 });
    expect(el.textContent).toBe("See bold and site now");
  });

  it("leaves a range selection alone", () => {
    const el = editable('See <span class="wikilink" data-target="Welcome">Welcome</span>');
    const linkText = el.querySelector(".wikilink").firstChild;
    const range = document.createRange();
    range.setStart(linkText, 2);
    range.setEnd(linkText, "Welcome".length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    expect(caretOutOfLinkEnd(root())).toBe(false);
    expect(sel.isCollapsed).toBe(false);
    expect(el.textContent).toBe("See Welcome");
  });

  it("only acts inside the given root, and never without one", () => {
    const el = editable('See <span class="wikilink" data-target="Welcome">Welcome</span>');
    const linkText = el.querySelector(".wikilink").firstChild;
    setCaret(linkText, "Welcome".length);
    expect(caretOutOfLinkEnd(null)).toBe(false);
    document.body.insertAdjacentHTML("beforeend", '<div id="elsewhere"></div>');
    expect(caretOutOfLinkEnd(document.getElementById("elsewhere"))).toBe(false);
    expect(anchorAt()).toEqual({ node: linkText, offset: "Welcome".length });
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
