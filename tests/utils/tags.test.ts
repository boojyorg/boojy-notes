import { describe, expect, it } from "vitest";
import {
  TAG_CHAR_RE,
  TAG_TAIL_RE,
  extractAllTags,
  tagKey,
  tagRows,
  tagsInText,
} from "../../src/utils/tags";
import type { NoteData } from "../../src/types/notes";

describe("tagsInText: the one tag grammar", () => {
  it("takes a tag at the start, after a space or after an opening bracket", () => {
    expect(tagsInText("#a b #c (#d)")).toEqual(["a", "c", "d"]);
  });

  it("needs a boundary before the #: a#b and a URL fragment are not tags", () => {
    expect(tagsInText("a#b")).toEqual([]);
    expect(tagsInText("see example.com/page#top")).toEqual([]);
    expect(tagsInText("see https://example.com/page#top now")).toEqual([]);
    expect(tagsInText("[docs](https://x.y/#section)")).toEqual([]);
    expect(tagsInText("[docs](https://x.y/a_(b) #section)")).toEqual([]);
  });

  it("drops inline code, so `#include` is not a tag", () => {
    expect(tagsInText("use `#include <x>` here #real")).toEqual(["real"]);
  });

  it("reads accented letters as part of a tag", () => {
    expect(tagsInText("un #café y #niño")).toEqual(["café", "niño"]);
  });

  it("allows digits, underscores, slashes and dashes after the first letter", () => {
    expect(tagsInText("#v2 #a_b #x/y #c-d #1no")).toEqual(["v2", "a_b", "x/y", "c-d"]);
  });
});

describe("tagKey", () => {
  it("is case-insensitive and accent-sensitive", () => {
    expect(tagKey("Café")).toBe(tagKey("café"));
    expect(tagKey("cafe")).not.toBe(tagKey("café"));
    expect(tagKey("café")).toBe(tagKey("café"));
  });
});

describe("extractAllTags", () => {
  const data: NoteData = {
    a: {
      title: "A",
      folder: null,
      content: {
        title: "A",
        blocks: [
          { id: "1", type: "p", text: "prose #work and #Work" },
          { id: "2", type: "code", text: "color: #fff; #include" },
          { id: "3", type: "frontmatter", text: "tags: #meta" },
          { id: "4", type: "table", rows: [["#cell", "x"]] },
          { id: "5", type: "callout", title: "#calltitle", text: "#callbody" },
        ],
      },
    } as never,
    b: {
      title: "B",
      folder: null,
      content: { title: "B", blocks: [{ id: "6", type: "p", text: "#work again" }] },
    } as never,
  };

  it("reads prose, table cells and callouts, never code or frontmatter", () => {
    const tags = extractAllTags(data);
    expect([...tags.keys()].sort()).toEqual(["callbody", "calltitle", "cell", "work"]);
  });

  it("merges case variants under one key, keeping the first spelling, and counts notes", () => {
    const rows = tagRows(extractAllTags(data));
    expect(rows[0]).toEqual({ tag: "work", count: 2 });
    expect(extractAllTags(data).get("work")!.noteIds).toEqual(new Set(["a", "b"]));
  });
});

describe("the grammar's helpers", () => {
  it("TAG_TAIL_RE finds the tag the caret is at the end of", () => {
    expect("hello #wor".match(TAG_TAIL_RE)?.[2]).toBe("wor");
    expect("hello#wor".match(TAG_TAIL_RE)).toBeNull();
  });
  it("TAG_CHAR_RE says which typed characters continue a tag", () => {
    for (const c of ["a", "é", "9", "_", "/", "-"]) expect(TAG_CHAR_RE.test(c)).toBe(true);
    for (const c of [" ", ".", ",", ")", "\n"]) expect(TAG_CHAR_RE.test(c)).toBe(false);
  });
});
