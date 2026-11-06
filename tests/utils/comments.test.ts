import { afterEach, describe, expect, it } from "vitest";
import { htmlToInlineMarkdown, inlineMarkdownToHtml } from "../../src/utils/inlineFormatting";
import { findComments } from "../../src/utils/comments";
import { repaintComments } from "../../src/utils/typedFormatting";
import { extractAllTags } from "../../src/utils/tags";
import { getCaretOffset, placeCaret } from "../../src/utils/domHelpers";

const drawn = (md: string) => {
  const host = document.createElement("div");
  host.innerHTML = inlineMarkdownToHtml(md);
  return host;
};
const comments = (md: string) =>
  [...drawn(md).querySelectorAll(".md-comment")].map((c) => c.textContent);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("findComments", () => {
  it("pairs %% markers left to right within the text", () => {
    expect(findComments("a %%b%% c %%d%%")).toEqual([
      { start: 2, end: 7 },
      { start: 10, end: 15 },
    ]);
  });
  it("leaves an unmatched marker, and an empty pair is a comment", () => {
    expect(findComments("odd %% marker")).toEqual([]);
    expect(findComments("%%%%")).toEqual([{ start: 0, end: 4 }]);
    expect(findComments("%%%")).toEqual([]);
  });
  it("an escaped % is no marker; an escaped backslash leaves the marker after it", () => {
    expect(findComments("\\%%not%%")).toEqual([]);
    expect(findComments("\\\\%%yes%%")).toEqual([{ start: 2, end: 9 }]);
    expect(findComments("\\\\\\%%not%%")).toEqual([]);
  });
  it("a code span wins: a marker inside one is code, and a comment cannot close in one", () => {
    expect(findComments("`%%code%%` x")).toEqual([]);
    expect(findComments("%%a `b%%` c")).toEqual([]);
    expect(findComments("%%a `b` c%%")).toEqual([{ start: 0, end: 11 }]);
  });
  it("spans soft breaks within the block", () => {
    expect(findComments("%%\nline\n%%")).toEqual([{ start: 0, end: 10 }]);
  });
});

describe("a comment is drawn literally, muted", () => {
  it("keeps markers and draws nothing inside: no bold, link, tag, code or escape", () => {
    const md = "see %%**b** [[Note]] #tag `c` \\*%% then **bold**";
    const host = drawn(md);
    const c = host.querySelector(".md-comment");
    expect(c?.textContent).toBe("%%**b** [[Note]] #tag `c` \\*%%");
    expect(c?.querySelector("strong, .wikilink, .inline-tag, code, a")).toBeNull();
    expect(host.querySelector("strong")?.textContent).toBe("bold");
  });
  it("draws several comments, and none for an odd marker or one in code", () => {
    expect(comments("%%one%% and %%two%%")).toEqual(["%%one%%", "%%two%%"]);
    expect(comments("odd %% marker")).toEqual([]);
    expect(comments("`%%x%%`")).toEqual([]);
    expect(comments("\\%%x%%")).toEqual([]);
    expect(comments("\\\\%%x%%")).toEqual(["%%x%%"]);
  });
  it("escapes HTML inside a comment and keeps a soft break", () => {
    const host = drawn("%%a < b & c\nd%%");
    const c = host.querySelector(".md-comment") as HTMLElement;
    expect(c.textContent).toBe("%%a < b & cd%%");
    expect(c.querySelector("br")).not.toBeNull();
  });
  it("a comment inside a wikilink target is the target's text, never an element in it", () => {
    const host = drawn("[[a %%b%%]]");
    expect(host.querySelector(".wikilink")?.getAttribute("data-target")).toBe("a %%b%%");
  });
});

describe("a comment reads back byte for byte", () => {
  for (const md of [
    "visible %%hidden **raw** [[Note]] #tag \\* `c`%% after",
    "%%one%% and %%two%%",
    "%%a < b & c\nd%%",
    "\\\\%%a%%",
    "%%%%",
  ]) {
    it(JSON.stringify(md), () => {
      expect(htmlToInlineMarkdown(inlineMarkdownToHtml(md))).toBe(md);
    });
  }
});

describe("repaintComments", () => {
  const typed = { inputType: "insertText", isComposing: false, data: "%" };
  function block(md: string) {
    const el = document.createElement("div");
    el.contentEditable = "true";
    el.innerHTML = inlineMarkdownToHtml(md);
    document.body.append(el);
    return el;
  }
  it("paints a comment once its closing marker is typed, the caret kept", () => {
    const el = block("see %%hidden%");
    placeCaret(el, el.textContent!.length);
    el.firstChild!.appendData("%");
    placeCaret(el, el.textContent!.length);
    repaintComments(el, "see %%hidden%%", typed);
    expect(el.querySelector(".md-comment")?.textContent).toBe("%%hidden%%");
    expect(getCaretOffset(el)).toBe("see %%hidden%%".length);
  });
  it("unpaints when a marker goes", () => {
    const el = block("see %%hidden%%");
    repaintComments(el, "see %%hidden%", { ...typed, inputType: "deleteContentBackward" });
    expect(el.querySelector(".md-comment")).toBeNull();
  });
  it("repaints when a marker moves between two comments, though one still shows", () => {
    const el = block("%%a%% b %%c%%");
    repaintComments(el, "%%a b %%c%%", { ...typed, inputType: "deleteContentBackward" });
    expect([...el.querySelectorAll(".md-comment")].map((c) => c.textContent)).toEqual(["%%a b %%"]);
  });
  it("does not repaint for typing inside a comment", () => {
    const el = block("x %%abc%% y");
    const span = el.querySelector(".md-comment") as HTMLElement;
    (span.firstChild as Text).insertData(3, "Z");
    repaintComments(el, "x %%aZbc%% y", { ...typed, data: "Z" });
    expect(el.querySelector(".md-comment")).toBe(span);
  });
});

// A comment is visible and searchable, never private: a #tag in one still
// counts in the tag list and filter, as Obsidian counts it.
describe("tags in a comment", () => {
  it("count in the tag list", () => {
    const noteData = {
      n1: {
        id: "n1",
        title: "N",
        content: { blocks: [{ id: "b", type: "p", text: "x %%see #hidden%% y" }] },
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: a minimal note map
    expect([...extractAllTags(noteData as any).keys()]).toContain("hidden");
  });
});
