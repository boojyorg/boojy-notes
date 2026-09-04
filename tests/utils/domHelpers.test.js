/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getCaretOffset, placeCaret, titleFieldText } from "../../src/utils/domHelpers.js";

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
