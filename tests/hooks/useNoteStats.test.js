/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useNoteStats } from "../../src/hooks/useNoteStats";

const stats = (blocks) => renderHook(() => useNoteStats(blocks)).result.current;

describe("useNoteStats", () => {
  it("returns empty stats for null/undefined blocks", () => {
    expect(stats(undefined)).toEqual({
      wordCount: 0,
      charCount: 0,
      charCountNoSpaces: 0,
      readingTime: 1,
    });
    expect(stats(null).wordCount).toBe(0);
  });

  it("returns zeroed counts (reading time floored at 1) for empty blocks", () => {
    const s = stats([{ text: "" }, { text: "" }]);
    expect(s.wordCount).toBe(0);
    expect(s.charCount).toBe(0);
    expect(s.readingTime).toBe(1);
  });

  it("counts words and characters across blocks", () => {
    const s = stats([{ text: "hello world" }, { text: "three more words" }]);
    expect(s.wordCount).toBe(5);
    // "hello world" + " " + "three more words" = 28 chars
    expect(s.charCount).toBe(28);
    expect(s.charCountNoSpaces).toBe(24);
  });

  it("ignores blocks without text (images, files, etc.)", () => {
    const s = stats([{ text: "only this" }, { type: "image", src: "x.png" }]);
    expect(s.wordCount).toBe(2);
  });

  it("strips markdown formatting before counting", () => {
    const s = stats([{ text: "**bold** text" }]);
    expect(s.wordCount).toBe(2);
    // bold markers stripped → "bold text"
    expect(s.charCount).toBe("bold text".length);
  });

  it("estimates reading time at ~200 words per minute", () => {
    const longText = Array.from({ length: 450 }, (_, i) => `word${i}`).join(" ");
    const s = stats([{ text: longText }]);
    expect(s.wordCount).toBe(450);
    expect(s.readingTime).toBe(3); // ceil(450 / 200)
  });
});
