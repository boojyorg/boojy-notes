import { describe, it, expect } from "vitest";
import {
  fuzzyMatch,
  searchNotes,
  buildPlainText,
  extractSnippet,
  findMatchBlock,
  groupByFolder,
  buildSearchIndex,
} from "../../src/utils/search.js";

// --- fuzzyMatch ---

describe("fuzzyMatch", () => {
  it("returns match: false for empty inputs", () => {
    expect(fuzzyMatch("", "test").match).toBe(false);
    expect(fuzzyMatch("test", "").match).toBe(false);
    expect(fuzzyMatch(null, "test").match).toBe(false);
  });

  it("finds exact substring match with score 1.0", () => {
    const result = fuzzyMatch("hello", "say hello world");
    expect(result.match).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.type).toBe("exact");
    expect(result.matchStart).toBe(4);
    expect(result.matchEnd).toBe(9);
  });

  it("is case insensitive", () => {
    const result = fuzzyMatch("HELLO", "hello world");
    expect(result.match).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it("finds fuzzy match", () => {
    const result = fuzzyMatch("hlo", "hello");
    expect(result.match).toBe(true);
    expect(result.type).toBe("fuzzy");
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it("returns match: false when characters not in order", () => {
    expect(fuzzyMatch("ba", "abc").match).toBe(false);
  });

  it("scores tighter matches higher", () => {
    const tight = fuzzyMatch("abc", "xabcx");
    const spread = fuzzyMatch("abc", "xaxxbxxcx");
    expect(tight.score).toBeGreaterThan(spread.score);
  });
});

// --- buildPlainText ---

describe("buildPlainText", () => {
  it("returns empty for no blocks", () => {
    expect(buildPlainText([]).plainText).toBe("");
    expect(buildPlainText(null).plainText).toBe("");
  });

  it("joins block text with spaces", () => {
    const { plainText } = buildPlainText([
      { id: "1", type: "p", text: "Hello" },
      { id: "2", type: "p", text: "World" },
    ]);
    expect(plainText).toBe("Hello World");
  });

  it("includes callout title and text", () => {
    const { plainText } = buildPlainText([
      { id: "1", type: "callout", title: "Warning", text: "be careful" },
    ]);
    expect(plainText).toContain("Warning");
    expect(plainText).toContain("be careful");
  });

  it("tracks block offsets", () => {
    const { blockOffsets } = buildPlainText([
      { id: "a", type: "p", text: "Hello" },
      { id: "b", type: "p", text: "World" },
    ]);
    expect(blockOffsets).toHaveLength(2);
    expect(blockOffsets[0]).toMatchObject({ blockId: "a", start: 0, end: 5 });
    expect(blockOffsets[1]).toMatchObject({ blockId: "b", start: 6, end: 11 });
  });
});

// --- extractSnippet ---

describe("extractSnippet", () => {
  it("returns null for invalid input", () => {
    expect(extractSnippet("hello", -1, 3)).toBeNull();
    expect(extractSnippet(null, 0, 3)).toBeNull();
  });

  it("extracts text around match", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    const result = extractSnippet(text, 10, 15); // "brown"
    expect(result.text).toContain("brown");
    expect(result.highlightStart).toBeGreaterThanOrEqual(0);
    expect(result.highlightEnd).toBeGreaterThan(result.highlightStart);
  });

  it("adds ellipsis when truncated", () => {
    const text = "a".repeat(100);
    const result = extractSnippet(text, 50, 55);
    expect(result.text.startsWith("...")).toBe(true);
    expect(result.text.endsWith("..")).toBe(true);
  });
});

// --- findMatchBlock ---

describe("findMatchBlock", () => {
  const offsets = [
    { blockId: "a", start: 0, end: 10 },
    { blockId: "b", start: 11, end: 20 },
  ];

  it("returns null for empty offsets", () => {
    expect(findMatchBlock([], 5)).toBeNull();
    expect(findMatchBlock(null, 5)).toBeNull();
  });

  it("finds correct block", () => {
    expect(findMatchBlock(offsets, 5)).toBe("a");
    expect(findMatchBlock(offsets, 15)).toBe("b");
  });

  it("handles gap between blocks", () => {
    expect(findMatchBlock(offsets, 10)).toBe("b");
  });
});

// --- searchNotes ---

describe("searchNotes", () => {
  const noteData = {
    n1: { title: "JavaScript Guide", content: { blocks: [{ id: "b1", text: "Learn JS basics" }] }, lastModified: 100 },
    n2: { title: "Python Tutorial", content: { blocks: [{ id: "b2", text: "Learn Python" }] }, lastModified: 200 },
    n3: { title: "Meeting Notes", content: { blocks: [{ id: "b3", text: "Discuss project" }] }, lastModified: 300 },
  };

  it("returns empty for blank query", () => {
    const index = buildSearchIndex(noteData);
    expect(searchNotes("", index).results).toEqual([]);
    expect(searchNotes("  ", index).results).toEqual([]);
  });

  it("finds title matches", () => {
    const index = buildSearchIndex(noteData);
    const { results } = searchNotes("JavaScript", index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].noteId).toBe("n1");
  });

  it("finds body matches", () => {
    const index = buildSearchIndex(noteData);
    const { results } = searchNotes("Discuss project", index);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].noteId).toBe("n3");
  });

  it("respects limit", () => {
    const index = buildSearchIndex(noteData);
    const { results, totalCount } = searchNotes("Learn", index, 1);
    expect(results).toHaveLength(1);
    expect(totalCount).toBe(2);
  });

  it("sorts by score descending", () => {
    const index = buildSearchIndex(noteData);
    const { results } = searchNotes("Python", index);
    // Title exact match should score highest
    expect(results[0].noteId).toBe("n2");
  });
});

// --- groupByFolder ---

describe("groupByFolder", () => {
  it("groups root and folder results", () => {
    const results = [
      { noteId: "1", folder: null },
      { noteId: "2", folder: "Work" },
      { noteId: "3", folder: "Work" },
      { noteId: "4", folder: "Personal" },
    ];
    const groups = groupByFolder(results);
    expect(groups).toHaveLength(3); // root, Personal, Work
    expect(groups[0].folderName).toBeNull();
    expect(groups[0].results).toHaveLength(1);
  });

  it("sorts folders alphabetically", () => {
    const results = [
      { noteId: "1", folder: "Zebra" },
      { noteId: "2", folder: "Alpha" },
    ];
    const groups = groupByFolder(results);
    expect(groups[0].folderName).toBe("Alpha");
    expect(groups[1].folderName).toBe("Zebra");
  });

  it("assigns global indices", () => {
    const results = [
      { noteId: "1", folder: null },
      { noteId: "2", folder: null },
    ];
    const groups = groupByFolder(results);
    expect(groups[0].results[0]._globalIndex).toBe(0);
    expect(groups[0].results[1]._globalIndex).toBe(1);
  });
});
