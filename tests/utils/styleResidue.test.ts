/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { editedSurface, shedStyleResidue } from "../../src/utils/styleResidue";

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

// Chromium, after the last character of a code span is deleted, types on in
// the span's copied look: `<font face>` and a `<span style>`.
const COPIED =
  '<span style="font-size: 15px;">Tag </span><font face="SF Mono"><span style="background-color: grey;">tag</span></font>';

function block(html: string) {
  const el = document.createElement("p");
  el.setAttribute("data-block-id", "b");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe("shedStyleResidue", () => {
  it("unwraps Chromium's copied look, keeping the text and the caret", () => {
    const el = block(COPIED);
    const typed = el.querySelector("font span")!.firstChild as Text;
    window.getSelection()!.collapse(typed, 2);
    expect(shedStyleResidue(el)).toBe(true);
    expect(el.innerHTML).toBe("Tag tag");
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(el, 0);
    range.setEnd(sel.anchorNode!, sel.anchorOffset);
    expect(range.toString()).toBe("Tag ta");
  });

  it("keeps the app's own elements and a span with a class", () => {
    const html =
      '<strong>b</strong> <code>c</code> <span class="wikilink" data-target="N">N</span> <span class="inline-tag" data-tag="t">#t</span>';
    const el = block(html);
    expect(shedStyleResidue(el)).toBe(false);
    expect(el.innerHTML).toBe(html);
  });

  it("never touches a sealed element's inside (a formula KaTeX drew)", () => {
    const html =
      'x <span class="inline-math" contenteditable="false" data-math="a"><span style="top: -2em;">a</span></span>';
    const el = block(html);
    expect(shedStyleResidue(el)).toBe(false);
    expect(el.innerHTML).toBe(html);
  });

  it("cleans a cell inside a sealed table wrapper", () => {
    const table = document.createElement("div");
    table.setAttribute("contenteditable", "false");
    table.innerHTML =
      '<span data-inline-field="" contenteditable="true"><font face="m"><span style="x: y">tag</span></font></span>';
    document.body.appendChild(table);
    const cell = table.firstElementChild!;
    expect(shedStyleResidue(cell)).toBe(true);
    expect(cell.innerHTML).toBe("tag");
  });

  it("never unwraps the root itself (a quote's text root is a class-less styled span)", () => {
    const quote = document.createElement("div");
    quote.setAttribute("data-block-id", "q");
    quote.innerHTML = '<span style="display: block;">before <font face="m">x</font></span>';
    document.body.appendChild(quote);
    const root = quote.firstElementChild!;
    expect(shedStyleResidue(root)).toBe(true);
    expect(quote.innerHTML).toBe('<span style="display: block;">before x</span>');
  });

  it("finds the surface an input edited: a field, else the block's text root, else nothing", () => {
    const quote = document.createElement("div");
    quote.setAttribute("data-block-id", "q");
    quote.innerHTML =
      '<span style="display: block;">t <span data-inline-field="">cell <b>x</b></span></span>';
    document.body.appendChild(quote);
    const root = quote.firstElementChild!;
    const rootOf = (b: Element) => (b === quote ? root : null);
    expect(editedSurface(quote.querySelector("b")!.firstChild, rootOf)).toBe(
      quote.querySelector("[data-inline-field]"),
    );
    expect(editedSurface(root.firstChild, rootOf)).toBe(root);
    // A block that holds no text (no root given) is never cleaned.
    expect(editedSurface(root.firstChild, () => null)).toBeNull();
    expect(editedSurface(null, rootOf)).toBeNull();
  });
});
