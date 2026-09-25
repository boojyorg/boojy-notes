/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  caretOnEmptyLastLine,
  CARET_ANCHOR,
  CARET_ANCHOR_CLASS,
  caretIntoTextRoot,
  caretLength,
  caretOutOfLinkEnd,
  caretOutOfLinkStart,
  caretOutOfTagEnd,
  getCaretOffset,
  isEditableBlock,
  isSelectableBlock,
  linkText,
  placeCaret,
  titleFieldText,
  ownedField,
  caretRect,
  focusOwnedField,
  hasOwnField,
  focusBeyondNote,
  focusNote,
  focusSidebar,
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

describe("caretOutOfTagEnd — a space typed at the end of a #tag lands outside its pill", () => {
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
  const tagHtml = 'see <span class="inline-tag" data-tag="todd">#todd</span>';

  it("moves a caret at the end of a tag that ends the block onto an anchor after it", () => {
    const el = editable(tagHtml);
    setCaret(el.querySelector(".inline-tag").firstChild, "#todd".length);
    expect(caretOutOfTagEnd(root())).toBe(true);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(CARET_ANCHOR);
    expect(offset).toBe(1);
    expect(node.parentElement.previousSibling.className).toBe("inline-tag");
    expect(getCaretOffset(el)).toBe("see #todd".length);
  });

  it("leaves a caret inside the tag alone, so the tag can still grow or be edited", () => {
    const el = editable(tagHtml);
    const text = el.querySelector(".inline-tag").firstChild;
    for (const offset of [0, 2, 4]) {
      setCaret(text, offset);
      expect(caretOutOfTagEnd(root())).toBe(false);
      expect(anchorAt()).toEqual({ node: text, offset });
    }
  });

  it("leaves a caret outside any tag alone", () => {
    const el = editable(`${tagHtml} now`);
    setCaret(el.lastChild, 2);
    expect(caretOutOfTagEnd(root())).toBe(false);
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

describe("placeCaret — offset 0 of a block that opens with a link lands before it", () => {
  // The mirror of the end case (review 2026-09-07, §3.7). `placeCaret(el, 0)`
  // set the range on the block's first child, the link span itself, and the
  // next keystroke became the alias's first character. Offset 0 now rests on
  // an anchor before the link, as the end of a link rests on one after it.
  const anchorAt = () => {
    const sel = window.getSelection();
    return { node: sel.anchorNode, offset: sel.anchorOffset };
  };

  it("anchors before a wikilink that opens the block", () => {
    const el = editable('<span class="wikilink" data-target="Welcome">Welcome</span> first');
    expect(placeCaret(el, 0)).toBe(true);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(CARET_ANCHOR);
    expect(offset).toBe(1);
    expect(node.parentElement.className).toBe(CARET_ANCHOR_CLASS);
    expect(node.parentElement).toBe(el.firstChild);
    expect(node.parentElement.nextSibling.className).toBe("wikilink");
    expect(getCaretOffset(el)).toBe(0);
    expect(el.querySelector(".wikilink").textContent).toBe("Welcome");
  });

  it("anchors before an external link that opens the block, and reuses the anchor", () => {
    const el = editable('<a href="https://x.y">site</a> now');
    placeCaret(el, 0);
    placeCaret(el, 0);
    expect(el.querySelectorAll(`.${CARET_ANCHOR_CLASS}`).length).toBe(1);
    expect(anchorAt().node).toBe(el.firstChild.firstChild);
    expect(anchorAt().offset).toBe(1);
    expect(getCaretOffset(el)).toBe(0);
  });

  it("round-trips every offset across a leading link and its anchor", () => {
    const el = editable('<span class="wikilink" data-target="Welcome">Welcome</span> first');
    for (let pos = 0; pos <= "Welcome first".length; pos++) {
      placeCaret(el, pos);
      expect(getCaretOffset(el), `offset ${pos}`).toBe(pos);
    }
  });

  it("counts text typed on the leading anchor as the block's first characters", () => {
    const el = editable(
      `${anchorHtml("Y")}<span class="wikilink" data-target="Welcome">Welcome</span> first`,
    );
    expect(caretLength(el)).toBe("YWelcome first".length);
    placeCaret(el, 0);
    // Offset 0 is now in front of the typed text, not on a second anchor.
    expect(el.querySelectorAll(`.${CARET_ANCHOR_CLASS}`).length).toBe(1);
    expect(getCaretOffset(el)).toBe(0);
    placeCaret(el, 1);
    expect(getCaretOffset(el)).toBe(1);
  });

  it("puts a plain block's caret at its first character as before", () => {
    const el = editable("See <strong>bold</strong>");
    placeCaret(el, 0);
    expect(anchorAt()).toEqual({ node: el.firstChild, offset: 0 });
    expect(el.querySelectorAll(`.${CARET_ANCHOR_CLASS}`).length).toBe(0);
  });
});

describe("caretOutOfLinkStart — a browser-placed caret at the start of a link moves outside", () => {
  // Home on a block that opens with a link leaves Chromium's caret at offset
  // 0 of the link's own text node. Called from beforeinput beside
  // caretOutOfLinkEnd, this moves it onto the anchor placeCaret would have
  // used, so the insertion lands in front of the link.
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

  it("moves a caret at the start of a wikilink that opens the block onto an anchor before it", () => {
    const el = editable('<span class="wikilink" data-target="Welcome">Welcome</span> first');
    const linkText = el.querySelector(".wikilink").firstChild;
    setCaret(linkText, 0);
    expect(caretOutOfLinkStart(root())).toBe(true);
    const { node, offset } = anchorAt();
    expect(node.data).toBe(CARET_ANCHOR);
    expect(offset).toBe(1);
    expect(node.parentElement.className).toBe(CARET_ANCHOR_CLASS);
    expect(node.parentElement.nextSibling.className).toBe("wikilink");
    expect(getCaretOffset(el)).toBe(0);
    expect(el.querySelector(".wikilink").textContent).toBe("Welcome");
  });

  it("reuses an anchor already before the link rather than stacking another", () => {
    const el = editable(`${anchorHtml()}<a href="https://x.y">site</a> now`);
    setCaret(el.querySelector("a").firstChild, 0);
    expect(caretOutOfLinkStart(root())).toBe(true);
    expect(el.querySelectorAll(`.${CARET_ANCHOR_CLASS}`).length).toBe(1);
    expect(anchorAt().node).toBe(el.firstChild.firstChild);
    expect(el.textContent).toBe(`${CARET_ANCHOR}site now`);
  });

  it("leaves a caret past the link's first character alone, so alias editing still works", () => {
    const el = editable('<span class="wikilink" data-target="Welcome">Welcome</span> first');
    const linkText = el.querySelector(".wikilink").firstChild;
    for (const offset of [1, 3, "Welcome".length - 1]) {
      setCaret(linkText, offset);
      expect(caretOutOfLinkStart(root())).toBe(false);
      expect(anchorAt()).toEqual({ node: linkText, offset });
    }
    expect(el.textContent).toBe("Welcome first");
  });

  it("leaves a caret at offset 0 outside any link alone", () => {
    const el = editable('<strong>bold</strong> and <a href="https://x.y">site</a>');
    const bold = el.querySelector("strong").firstChild;
    setCaret(bold, 0);
    expect(caretOutOfLinkStart(root())).toBe(false);
    expect(anchorAt()).toEqual({ node: bold, offset: 0 });
    setCaret(el.firstChild.nextSibling, 0);
    expect(caretOutOfLinkStart(root())).toBe(false);
    expect(el.textContent).toBe("bold and site");
  });

  it("is the end case's mirror: the end of a link is the end case's, not this one's", () => {
    const el = editable('<span class="wikilink" data-target="Welcome">Welcome</span> first');
    const linkText = el.querySelector(".wikilink").firstChild;
    setCaret(linkText, "Welcome".length);
    expect(caretOutOfLinkStart(root())).toBe(false);
    expect(caretOutOfLinkEnd(root())).toBe(true);
    setCaret(linkText, 0);
    expect(caretOutOfLinkEnd(root())).toBe(false);
    expect(caretOutOfLinkStart(root())).toBe(true);
    expect(el.textContent).toBe(`${CARET_ANCHOR}Welcome${CARET_ANCHOR} first`);
  });
});

describe("caretOnEmptyLastLine — the Enter that leaves a quote", () => {
  const rootWith = (html) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  };
  const rangeAt = (node, offset) => {
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    return r;
  };

  it("is true between the break and the placeholder <br> of an empty last line", () => {
    const el = rootWith("Quote<br>Second<br><br>");
    // Chromium's caret after a line break at the end: between the two <br>s.
    expect(caretOnEmptyLastLine(el, rangeAt(el, 4))).toBe(true);
    // Before the first of them the caret is still at the end of "Second".
    expect(caretOnEmptyLastLine(el, rangeAt(el, 3))).toBe(false);
  });

  it("is true in an empty root, and on an empty line held by an empty element", () => {
    expect(caretOnEmptyLastLine(rootWith("<br>"), rangeAt(rootWith("<br>"), 0))).toBe(true);
    const el = rootWith("Quote<br><em></em><br>");
    expect(caretOnEmptyLastLine(el, rangeAt(el.querySelector("em"), 0))).toBe(true);
  });

  it("is false at the end of a line that holds text, and on an empty line that is not the last", () => {
    const el = rootWith("Quote<br>Second<br>");
    expect(caretOnEmptyLastLine(el, rangeAt(el.childNodes[2], 6))).toBe(false);
    const mid = rootWith("Quote<br><br>Third");
    expect(caretOnEmptyLastLine(mid, rangeAt(mid, 2))).toBe(false);
    const start = rootWith("Quote<br>Second<br>");
    expect(caretOnEmptyLastLine(start, rangeAt(start.childNodes[2], 0))).toBe(false);
  });

  it("ignores a caret anchor's zero-width space", () => {
    const el = rootWith('Quote<br><span class="caret-anchor">\u200B</span><br>');
    expect(caretOnEmptyLastLine(el, rangeAt(el.querySelector("span").firstChild, 1))).toBe(true);
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

describe("ownedField", () => {
  it("resolves a special block's first field by its wrapper, never a text root", () => {
    const editor = document.createElement("div");
    editor.innerHTML =
      '<div data-block-id="p1" data-block-type="p">text</div>' +
      '<div data-block-id="c1" data-block-type="code" contenteditable="false">' +
      '<textarea class="code-textarea"></textarea></div>' +
      '<div data-block-id="k1" data-block-type="callout" contenteditable="false">' +
      '<div role="button"></div><div class="callout-title" contenteditable="true"></div>' +
      '<div class="callout-body" contenteditable="true"></div></div>' +
      '<div data-block-id="t1" data-block-type="table" contenteditable="false">' +
      '<table><thead><tr><th contenteditable="true"></th><th contenteditable="true"></th></tr></thead>' +
      '<tbody><tr><td contenteditable="true"></td></tr></tbody></table></div>' +
      '<div data-block-id="s1" data-block-type="spacer" contenteditable="false"><hr></div>';
    expect(ownedField(editor, "c1")).toBe(editor.querySelector("textarea"));
    expect(ownedField(editor, "k1")).toBe(editor.querySelector(".callout-title"));
    expect(ownedField(editor, "t1")).toBe(editor.querySelector("th"));
    expect(ownedField(editor, "s1")).toBeNull();
    expect(ownedField(editor, "p1")).toBeNull();
    expect(ownedField(editor, "missing")).toBeNull();
    expect(ownedField(null, "c1")).toBeNull();
    // Arriving from below: a table's last row, first cell; every other block
    // has one field to enter whichever way the caret comes.
    expect(ownedField(editor, "t1", "end")).toBe(editor.querySelector("tbody td"));
    expect(ownedField(editor, "c1", "end")).toBe(editor.querySelector("textarea"));
    expect(ownedField(editor, "k1", "end")).toBe(editor.querySelector(".callout-title"));
  });
});

describe("isSelectableBlock / isEditableBlock", () => {
  it("a divider, an image and a table are addressed as a whole; code, callout and file are not", () => {
    for (const type of ["spacer", "image", "table"]) {
      expect(isSelectableBlock({ type })).toBe(true);
      expect(isEditableBlock({ type })).toBe(false);
    }
    for (const type of ["code", "callout", "file", "frontmatter"]) {
      expect(isSelectableBlock({ type })).toBe(false);
      expect(isEditableBlock({ type })).toBe(false);
    }
    for (const type of ["p", "h1", "bullet", "numbered", "checkbox", "blockquote"]) {
      expect(isSelectableBlock({ type })).toBe(false);
      expect(isEditableBlock({ type })).toBe(true);
    }
  });
});

describe("hasOwnField", () => {
  it("is the blocks that keep a field of their own", () => {
    for (const type of ["code", "callout", "table"]) expect(hasOwnField({ type })).toBe(true);
    for (const type of ["p", "h1", "bullet", "spacer", "image", "file", "frontmatter"])
      expect(hasOwnField({ type })).toBe(false);
    expect(hasOwnField(null)).toBe(false);
    expect(hasOwnField(undefined)).toBe(false);
  });
});

describe("focusOwnedField", () => {
  const editorWith = () => {
    const editor = document.createElement("div");
    editor.innerHTML =
      '<div data-block-id="c1" data-block-type="code" contenteditable="false">' +
      '<textarea class="code-textarea"></textarea></div>' +
      '<div data-block-id="p1" data-block-type="p">text</div>';
    document.body.appendChild(editor);
    return editor;
  };

  it("takes a code block's textarea at the edge the caret arrived from", () => {
    const editor = editorWith();
    const ta = editor.querySelector("textarea");
    ta.value = "one\ntwo";
    expect(focusOwnedField(editor, "c1")).toBe(true);
    expect(document.activeElement).toBe(ta);
    expect(ta.selectionStart).toBe(0);
    expect(focusOwnedField(editor, "c1", "end")).toBe(true);
    expect(ta.selectionStart).toBe(ta.value.length);
    editor.remove();
  });

  it("answers false for a block with no field of its own", () => {
    const editor = editorWith();
    expect(focusOwnedField(editor, "p1")).toBe(false);
    expect(focusOwnedField(editor, "missing")).toBe(false);
    expect(focusOwnedField(null, "c1")).toBe(false);
    editor.remove();
  });
});

describe("caretRect — a caret in an empty paragraph still has a line", () => {
  // Chromium reports all zeros for a collapsed caret in an empty text node,
  // and the arrow keys ask "first or last line of this block?" against it.
  it("takes the range's own rect when it has one", () => {
    const el = document.createElement("div");
    const range = document.createRange();
    range.getBoundingClientRect = () => ({ top: 40, bottom: 58, width: 0, height: 18 });
    expect(caretRect(range, el).top).toBe(40);
  });

  it("falls back to the node the caret sits in, then to the block", () => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () => ({ top: 197, bottom: 223, width: 300, height: 26 });
    const empty = document.createTextNode("");
    el.appendChild(empty);
    const range = document.createRange();
    range.setStart(empty, 0);
    range.collapse(true);
    range.getBoundingClientRect = () => ({ top: 0, bottom: 0, width: 0, height: 0 });
    range.getClientRects = () => [];
    const rect = caretRect(range, el);
    expect(rect.top).toBe(197);
    expect(rect.bottom).toBe(223);
    // Which is what makes both edge questions true for a one-line block.
    expect(rect.top - 197 < 5).toBe(true);
    expect(223 - rect.bottom < 5).toBe(true);
  });
});

describe("caretIntoTextRoot — a caret beside a list marker moves into the item's text", () => {
  const blocks = [
    { id: "a", type: "bullet", text: "one" },
    { id: "b", type: "code", text: "x" },
  ];
  const mount = () => {
    document.body.innerHTML =
      '<div contenteditable="true" id="ed">' +
      '<div data-block-id="a"><span contenteditable="false" data-marker="filled"></span><span id="t">one</span></div>' +
      '<div data-block-id="b"><span contenteditable="false"></span><div id="c">x</div></div>' +
      "</div>";
    const $ = (id) => document.getElementById(id);
    return { ed: $("ed"), refs: { a: $("t"), b: $("c") } };
  };
  const setCaret = (node, offset) => {
    const range = document.createRange();
    range.setStart(node, offset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const caret = () => {
    const sel = window.getSelection();
    return { text: sel.anchorNode.textContent, offset: sel.anchorOffset };
  };

  it("moves a caret before the text to its start", () => {
    const { ed, refs } = mount();
    setCaret(ed.querySelector('[data-block-id="a"]'), 0);
    expect(caretIntoTextRoot(ed, blocks, refs)).toBe(true);
    expect(refs.a.contains(window.getSelection().anchorNode)).toBe(true);
    expect(caret()).toEqual({ text: "one", offset: 0 });
  });

  it("moves a caret after the text to its end", () => {
    const { ed, refs } = mount();
    setCaret(ed.querySelector('[data-block-id="a"]'), 2);
    expect(caretIntoTextRoot(ed, blocks, refs)).toBe(true);
    expect(caret()).toEqual({ text: "one", offset: 3 });
  });

  it("leaves a caret already in the text, and a block that is not text", () => {
    const { ed, refs } = mount();
    setCaret(refs.a.firstChild, 1);
    expect(caretIntoTextRoot(ed, blocks, refs)).toBe(false);
    setCaret(ed.querySelector('[data-block-id="b"]'), 0);
    expect(caretIntoTextRoot(ed, blocks, refs)).toBe(false);
  });
});

/** jsdom lays nothing out; every element counts as showing here. */
function showAll() {
  for (const el of document.querySelectorAll("*")) el.getClientRects = () => [{}];
}

describe("focusBeyondNote — Tab out of the note", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="side">Side</button>
      <div data-title contenteditable="true" id="name">Name</div>
      <div data-editor contenteditable="true"><p>Text</p><textarea id="code"></textarea></div>
      <button id="after">After</button>
      <button id="hidden" inert>Hidden</button>`;
    showAll();
  });

  it("goes to the next stop after the note, never one inside it", () => {
    focusBeyondNote(1);
    expect(document.activeElement.id).toBe("after");
  });

  it("goes back to the name, caret at its end", () => {
    // jsdom focuses an editable only with a tabindex; Chromium without one.
    document.getElementById("name").setAttribute("tabindex", "0");
    focusBeyondNote(-1);
    expect(document.activeElement.id).toBe("name");
    expect(window.getSelection().anchorOffset).toBe(1);
  });

  it("wraps past the end", () => {
    document.getElementById("after").remove();
    focusBeyondNote(1);
    expect(document.activeElement.id).toBe("side");
  });
});

describe("focusSidebar and focusNote — into the tree and back", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div role="tree">
        <button data-tree-key="f:A" tabindex="0" id="stop">A</button>
        <button data-tree-key="n:1" tabindex="-1" aria-selected="true" id="open">Open</button>
      </div>
      <div data-title contenteditable="true" tabindex="0">Name</div>
      <div data-editor contenteditable="true" tabindex="0"><p id="p">Text</p></div>`;
  });

  it("lands on the open note's row, else the tree's stop", () => {
    expect(focusSidebar()).toBe(true);
    expect(document.activeElement.id).toBe("open");
    document.getElementById("open").removeAttribute("aria-selected");
    focusSidebar();
    expect(document.activeElement.id).toBe("stop");
  });

  it("goes back to the editor where the caret was, else to the name", () => {
    const text = document.getElementById("p").firstChild;
    document.getElementById("stop").focus();
    // A press on a row leaves the document's selection in the note.
    window.getSelection().collapse(text, 2);
    focusNote();
    expect(document.activeElement.hasAttribute("data-editor")).toBe(true);
    window.getSelection().removeAllRanges();
    focusNote();
    expect(document.activeElement.hasAttribute("data-title")).toBe(true);
  });
});
