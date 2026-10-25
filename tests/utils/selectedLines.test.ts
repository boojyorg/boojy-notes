import { afterEach, describe, expect, it } from "vitest";
import type { Block } from "../../src/types/notes";
import { selectedLinesOf } from "../../src/utils/selectedLines";

const todo = (id: string) => ({ id, type: "checkbox", text: id, checked: false }) as Block;

describe("selectedLines", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  const blocks = [todo("a"), todo("b"), todo("c")];
  function select(start: [string, number], end: [string, number]) {
    document.body.innerHTML =
      '<div data-editor><div data-block-id="a">First</div><div data-block-id="b">Second</div><div data-block-id="c">Third</div></div>';
    const text = (id: string) =>
      document.querySelector(`[data-block-id="${id}"]`)?.firstChild as Node;
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    range.setStart(text(start[0]), start[1]);
    range.setEnd(text(end[0]), end[1]);
    sel.removeAllRanges();
    sel.addRange(range);
    return sel;
  }

  it("covers each block the selection holds something of", () => {
    expect(selectedLinesOf(blocks, select(["a", 2], ["b", 1]))).toEqual(["a", "b"]);
    expect(selectedLinesOf(blocks, select(["b", 3], ["b", 3]))).toEqual(["b"]);
  });

  it("leaves out an end block the selection stops before", () => {
    expect(selectedLinesOf(blocks, select(["a", 0], ["b", 0]))).toEqual(["a"]);
    expect(selectedLinesOf(blocks, select(["a", 0], ["c", 0]))).toEqual(["a", "b"]);
  });

  it("keeps a block with no text of its own that a range ends on", () => {
    const withImage = [todo("a"), { id: "b", type: "image", src: "x.png" } as Block, todo("c")];
    expect(selectedLinesOf(withImage, select(["a", 0], ["b", 0]))).toEqual(["a", "b"]);
  });

  it("takes a line the selection ends after, on the editor itself", () => {
    const sel = select(["a", 0], ["a", 1]);
    const range = sel.getRangeAt(0);
    const editor = document.querySelector("[data-editor]") as Element;
    range.setEnd(editor, 2); // after b
    expect(selectedLinesOf(blocks, sel)).toEqual(["a", "b"]);
  });

  it("reads a caret anchor as no text, and a U+200B of the file's as text", () => {
    const sel = select(["a", 0], ["b", 0]);
    const b = document.querySelector('[data-block-id="b"]') as Element;
    b.innerHTML = '<span class="caret-anchor">\u200b</span>Second';
    const range = sel.getRangeAt(0);
    range.setEnd(b, 1); // after the anchor
    expect(selectedLinesOf(blocks, sel)).toEqual(["a"]);
    b.innerHTML = "\u200bSecond";
    range.setEnd(b.firstChild as Node, 1); // after the file's own U+200B
    expect(selectedLinesOf(blocks, sel)).toEqual(["a", "b"]);
  });

  it("reads a list row's marker as no text", () => {
    const sel = select(["a", 0], ["b", 0]);
    const b = document.querySelector('[data-block-id="b"]') as Element;
    b.innerHTML = '<span contenteditable="false">2.</span><span>Second</span>';
    sel.getRangeAt(0).setEnd(b.lastChild?.firstChild as Node, 0); // before "Second"
    expect(selectedLinesOf(blocks, sel)).toEqual(["a"]);
  });

  it("is empty outside the editor", () => {
    expect(selectedLinesOf(blocks, null)).toEqual([]);
  });
});
