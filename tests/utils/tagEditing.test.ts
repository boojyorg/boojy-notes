import { afterEach, describe, expect, it } from "vitest";
import { editingTag, enterWouldSplit } from "../../src/utils/tagEditing";

function setup() {
  const root = document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = 'see <span class="inline-tag">#area/home</span> more';
  document.body.append(root);
  const tag = root.querySelector(".inline-tag") as Element;
  const text = tag.firstChild as Text;
  const caret = (offset: number, end = offset) => {
    const r = document.createRange();
    r.setStart(text, offset);
    r.setEnd(text, end);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
  };
  return { root, tag, caret };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("editingTag", () => {
  it("is the tag holding the caret past its #, or a selection in it", () => {
    const { root, tag, caret } = setup();
    caret(6);
    expect(editingTag(root)).toBe(tag);
    caret(1, 10);
    expect(editingTag(root)).toBe(tag);
    caret(10);
    expect(editingTag(root)).toBe(tag);
  });

  it("is null before the #, and outside every tag", () => {
    const { root, caret } = setup();
    caret(0);
    expect(editingTag(root)).toBeNull();
    const sel = window.getSelection()!;
    const r = document.createRange();
    r.setStart(root.firstChild as Text, 2);
    sel.removeAllRanges();
    sel.addRange(r);
    expect(editingTag(root)).toBeNull();
  });
});

describe("enterWouldSplit", () => {
  it("inside the tag or over a selection: yes; at its end: no", () => {
    const { tag, caret } = setup();
    caret(6);
    expect(enterWouldSplit(tag)).toBe(true);
    caret(1, 10);
    expect(enterWouldSplit(tag)).toBe(true);
    caret(10);
    expect(enterWouldSplit(tag)).toBe(false);
  });
});
