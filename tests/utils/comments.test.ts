import { afterEach, describe, expect, it } from "vitest";
import { htmlToInlineMarkdown, inlineMarkdownToHtml } from "../../src/utils/inlineFormatting";
import { findComments } from "../../src/utils/comments";
import { repaintComments } from "../../src/utils/typedFormatting";
import { extractAllTags, tagSpans, tagsInText } from "../../src/utils/tags";
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
  it("keeps markers and draws nothing inside but its tags: no bold, link, code or escape", () => {
    const md = "see %%**b** [[Note]] #tag `c` \\*%% then **bold**";
    const host = drawn(md);
    const c = host.querySelector(".md-comment");
    expect(c?.textContent).toBe("%%**b** [[Note]] #tag `c` \\*%%");
    expect(c?.querySelector("strong, .wikilink, code, a")).toBeNull();
    expect(host.querySelector("strong")?.textContent).toBe("bold");
  });
  it("draws a tag inside as a pill, as Obsidian does, and reads the source back", () => {
    // Listed in Search and the tag menu, a tag in a comment was never drawn.
    const md = "x %%todo #later, (#work/uni) & <b>%% y";
    const host = drawn(md);
    const pills = [...host.querySelectorAll(".md-comment .inline-tag")];
    expect(pills.map((p) => p.textContent)).toEqual(["#later", "#work/uni"]);
    expect(pills.map((p) => p.getAttribute("data-tag"))).toEqual(["later", "work/uni"]);
    expect(host.querySelector(".md-comment")?.textContent).toBe(
      "%%todo #later, (#work/uni) & <b>%%",
    );
    expect(htmlToInlineMarkdown(host.innerHTML)).toBe(md);
    // The pills are the tags Search lists: one grammar.
    expect(pills.map((p) => p.getAttribute("data-tag"))).toEqual(tagsInText(md));
  });
  it("draws no pill for what the grammar calls no tag", () => {
    for (const md of [
      "%%#x%%",
      "%%a#b%%",
      "%%`#code`%%",
      "%%[[Note #t]]%%",
      "%%see https://a.b/#top%%",
    ]) {
      expect(drawn(md).querySelector(".inline-tag")).toBeNull();
      expect(tagsInText(md)).toEqual([]);
    }
  });
  it("draws the tags of an inline footnote too, its text as written", () => {
    const md = "claim^[see #source **raw**] end";
    const host = drawn(md);
    expect([...host.querySelectorAll(".inline-tag")].map((p) => p.textContent)).toEqual([
      "#source",
    ]);
    expect(host.querySelector("strong")).toBeNull();
    expect(htmlToInlineMarkdown(host.innerHTML)).toBe(md);
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

describe("tagSpans", () => {
  it("answers each tag with its place in the text as written", () => {
    const md = "`#no` #one and (#two) [x](a#b) #three";
    const spans = tagSpans(md);
    expect(spans.map((s) => s.tag)).toEqual(["one", "two", "three"]);
    for (const s of spans) expect(md.slice(s.start, s.end)).toBe(`#${s.tag}`);
  });
});

describe("a tag typed inside a comment", () => {
  it("is drawn as it is typed, and undrawn when it stops being one", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.contentEditable = "true";
    const native = { isComposing: false } as InputEvent;
    el.innerHTML = inlineMarkdownToHtml("a %%todo%% b");
    // The page after a keystroke: the comment's text grown, no pill yet.
    const c = el.querySelector(".md-comment") as HTMLElement;
    c.textContent = "%%todo #l%%";
    repaintComments(el, "a %%todo #l%% b", native, undefined);
    expect(el.querySelector(".md-comment .inline-tag")?.textContent).toBe("#l");
    // Its `#` loses its space: no tag, no pill.
    (el.querySelector(".md-comment") as HTMLElement).textContent = "%%todo#l%%";
    repaintComments(el, "a %%todo#l%% b", native, undefined);
    expect(el.querySelector(".inline-tag")).toBeNull();
  });
});
