import { afterEach, describe, expect, it } from "vitest";
import {
  MARKDOWN_VIEW_KEY,
  MARKDOWN_VIEW_MAX,
  readMarkdownViewNotes,
  withMarkdownView,
  writeMarkdownViewNotes,
} from "../../src/utils/markdownViewNotes";

afterEach(() => localStorage.clear());

describe("markdownViewNotes", () => {
  it("turns one note on or off, leaving the others as they were", () => {
    const on = withMarkdownView(["a"], "b", true);
    expect(on).toEqual(["a", "b"]);
    expect(withMarkdownView(on, "a", false)).toEqual(["b"]);
    expect(withMarkdownView(on, "a", true)).toEqual(["b", "a"]);
  });

  it("keeps the newest, so ids of notes long gone fall off", () => {
    const full = Array.from({ length: MARKDOWN_VIEW_MAX }, (_, i) => `n${i}`);
    const next = withMarkdownView(full, "new", true);
    expect(next).toHaveLength(MARKDOWN_VIEW_MAX);
    expect(next[0]).toBe("n1");
    expect(next.at(-1)).toBe("new");
  });

  it("reads back what was written, and nothing from a damaged store", () => {
    writeMarkdownViewNotes(["a", "b"]);
    expect(readMarkdownViewNotes()).toEqual(["a", "b"]);
    localStorage.setItem(MARKDOWN_VIEW_KEY, "{oops");
    expect(readMarkdownViewNotes()).toEqual([]);
    localStorage.setItem(MARKDOWN_VIEW_KEY, JSON.stringify(["a", 3]));
    expect(readMarkdownViewNotes()).toEqual(["a"]);
  });
});
