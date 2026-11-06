import { afterEach, describe, expect, it } from "vitest";
import { selectTagName, tagName, tagNameRange, tagRange } from "../../src/utils/tagName";

function pill(html: string) {
  const host = document.createElement("div");
  host.contentEditable = "true";
  host.innerHTML = `see ${html} after`;
  document.body.append(host);
  return host.querySelector(".inline-tag") as Element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("tagName", () => {
  it("reads the name with its nested parts, without the #", () => {
    expect(tagName(pill('<span class="inline-tag">#area/work</span>'))).toBe("area/work");
  });

  it("reads a name typed across text nodes, and skips a caret anchor", () => {
    const tag = pill('<span class="inline-tag">#area</span>');
    tag.append(document.createTextNode("/home"));
    const anchor = document.createElement("span");
    anchor.className = "caret-anchor";
    anchor.textContent = "\u200B";
    tag.append(anchor);
    expect(tagName(tag)).toBe("area/home");
  });
});

describe("tagNameRange / selectTagName", () => {
  it("selects the name, the # left out", () => {
    const tag = pill('<span class="inline-tag">#area/work</span>');
    expect(tagNameRange(tag)?.toString()).toBe("area/work");
    expect(selectTagName(tag)).toBe(true);
    expect(window.getSelection()?.toString()).toBe("area/work");
  });

  it("ends before a trailing caret anchor's U+200B in the text", () => {
    const tag = pill('<span class="inline-tag">#todo\u200B</span>');
    expect(tagNameRange(tag)?.toString()).toBe("todo");
  });
});

describe("tagRange", () => {
  it("is the whole tag with its #, for Cut and Copy", () => {
    const tag = pill('<span class="inline-tag">#area/work</span>');
    expect(tagRange(tag)?.toString()).toBe("#area/work");
  });
});
