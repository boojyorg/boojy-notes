/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetDeletedStyle } from "../../src/utils/typingStyle";

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

function caret() {
  const p = document.createElement("p");
  p.textContent = "plain";
  document.body.appendChild(p);
  window.getSelection()!.collapse(p.firstChild, 3);
  return p;
}
const input = (inputType: string, isComposing = false) =>
  ({ inputType, isComposing }) as unknown as InputEvent;

describe("forgetDeletedStyle", () => {
  it("sets the caret again where it is after every kind of deletion", () => {
    const p = caret();
    const collapse = vi.spyOn(Selection.prototype, "collapse");
    for (const type of [
      "deleteContentBackward",
      "deleteContentForward",
      "deleteWordBackward",
      "deleteSoftLineBackward",
      "deleteByCut",
    ]) {
      expect(forgetDeletedStyle(input(type))).toBe(true);
    }
    expect(collapse).toHaveBeenLastCalledWith(p.firstChild, 3);
    expect(window.getSelection()!.anchorOffset).toBe(3);
  });

  it("leaves typing, a composition and a selection alone", () => {
    caret();
    const collapse = vi.spyOn(Selection.prototype, "collapse");
    expect(forgetDeletedStyle(input("insertText"))).toBe(false);
    expect(forgetDeletedStyle(input("insertReplacementText"))).toBe(false);
    expect(forgetDeletedStyle(input("deleteContentBackward", true))).toBe(false);
    const text = document.querySelector("p")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 0, text, 2);
    expect(forgetDeletedStyle(input("deleteContentBackward"))).toBe(false);
    expect(collapse).not.toHaveBeenCalled();
  });
});
