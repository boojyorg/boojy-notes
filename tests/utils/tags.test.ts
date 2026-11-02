import { describe, expect, it } from "vitest";
import {
  TAG_CHAR_RE,
  TAG_TAIL_RE,
  extractAllTags,
  frontmatterTags,
  nestTags,
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
          { id: "3", type: "frontmatter", text: "title: #notatag\ntags: [meta]" },
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

  it("reads prose, table cells, callouts and frontmatter's tags, never code or other properties", () => {
    const tags = extractAllTags(data);
    expect([...tags.keys()].sort()).toEqual(["callbody", "calltitle", "cell", "meta", "work"]);
  });

  it("merges case variants under one key, keeping the first spelling, and counts notes", () => {
    const rows = tagRows(extractAllTags(data));
    expect(rows[0]).toEqual({ tag: "work", count: 2 });
    expect(extractAllTags(data).get("work")!.noteIds).toEqual(new Set(["a", "b"]));
  });
});

describe("frontmatterTags: the tags property, as Obsidian reads it", () => {
  const fm = (text: string) => frontmatterTags({ id: "f", type: "frontmatter", text } as never);

  it("reads a flow list, a block list and a string of names", () => {
    expect(fm("tags: [demo, obsidian]")).toEqual(["demo", "obsidian"]);
    expect(fm("tags:\n  - demo\n  - uni/lectures")).toEqual(["demo", "uni/lectures"]);
    expect(fm("tags: demo, obsidian  café")).toEqual(["demo", "obsidian", "café"]);
  });

  it("takes a leading # or none, and keeps only what the tag grammar reads whole", () => {
    expect(fm('tags: ["#demo", "two words", "9lives", "ok-1"]')).toEqual(["demo", "ok-1"]);
  });

  it("reads nothing from another key, a map, a number, or YAML that does not read", () => {
    expect(fm("tag: demo\ntopics: [demo]")).toEqual([]);
    expect(fm("tags:\n  demo: 1")).toEqual([]);
    expect(fm("tags: 5")).toEqual([]);
    expect(fm("tags: [demo")).toEqual([]);
    expect(fm("tags: [a]\ntags: [b]")).toEqual([]);
    expect(fm("")).toEqual([]);
  });

  it("answers an unchanged block from its cache", () => {
    const block = { id: "f", type: "frontmatter", text: "tags: [demo]" } as never;
    expect(frontmatterTags(block)).toBe(frontmatterTags(block));
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

describe("nestTags: a tag counts towards its parents", () => {
  const n = (id: string, text: string) =>
    ({
      title: id,
      folder: null,
      content: { title: id, blocks: [{ id, type: "p", text }] },
    }) as never;
  const data: NoteData = {
    lec: n("lec", "#Uni/Lectures/week1"),
    exam: n("exam", "#uni/exams"),
    top: n("top", "#unity"),
  };
  const nested = nestTags(extractAllTags(data));

  it("adds every parent, spelt as the child writes it, holding its children's notes", () => {
    expect(nested.get("uni")).toEqual({ tag: "Uni", noteIds: new Set(["lec", "exam"]) });
    expect(nested.get("uni/lectures")!.noteIds).toEqual(new Set(["lec"]));
    expect(nested.get("uni/lectures/week1")!.noteIds).toEqual(new Set(["lec"]));
  });

  it("never takes a tag that merely starts with the same letters", () => {
    expect(nested.get("unity")!.noteIds).toEqual(new Set(["top"]));
    expect(nested.get("uni")!.noteIds.has("top")).toBe(false);
  });

  it("leaves the written tags' own entries untouched", () => {
    const flat = extractAllTags(data);
    nestTags(flat);
    expect(flat.has("uni")).toBe(false);
    expect(flat.get("uni/exams")!.noteIds).toEqual(new Set(["exam"]));
  });

  it("makes no parent from an empty level: a doubled or trailing slash", () => {
    const odd = nestTags(extractAllTags({ x: n("x", "#a//b/") }));
    expect([...odd.keys()].sort()).toEqual(["a", "a//b", "a//b/"]);
  });
});

describe("a formula is not prose", () => {
  it("reads no tag inside $…$", () => {
    expect(tagsInText("see $a \\#b$ and #real")).toEqual(["real"]);
  });
});
