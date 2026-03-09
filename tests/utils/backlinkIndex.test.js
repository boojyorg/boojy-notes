import { describe, it, expect } from "vitest";
import { buildBacklinkIndex, getBacklinksForNote } from "../../src/utils/backlinkIndex.js";

describe("buildBacklinkIndex", () => {
  it("builds index from wikilinks", () => {
    const noteData = {
      n1: {
        title: "Source Note",
        content: { blocks: [{ id: "b1", text: "See [[Target Note]] for details" }] },
      },
    };
    const index = buildBacklinkIndex(noteData);
    expect(index.has("target note")).toBe(true);
    const entries = index.get("target note");
    expect(entries).toHaveLength(1);
    expect(entries[0].sourceNoteId).toBe("n1");
    expect(entries[0].sourceTitle).toBe("Source Note");
  });

  it("handles aliased wikilinks [[target|display]]", () => {
    const noteData = {
      n1: {
        title: "Note A",
        content: { blocks: [{ id: "b1", text: "See [[My Note|alias]]" }] },
      },
    };
    const index = buildBacklinkIndex(noteData);
    expect(index.has("my note")).toBe(true);
  });

  it("deduplicates entries from same note", () => {
    const noteData = {
      n1: {
        title: "Source",
        content: {
          blocks: [
            { id: "b1", text: "[[Target]]" },
            { id: "b2", text: "[[Target]] again" },
          ],
        },
      },
    };
    const index = buildBacklinkIndex(noteData);
    expect(index.get("target")).toHaveLength(1);
  });

  it("tracks multiple sources for same target", () => {
    const noteData = {
      n1: { title: "A", content: { blocks: [{ id: "b1", text: "[[Target]]" }] } },
      n2: { title: "B", content: { blocks: [{ id: "b2", text: "[[Target]]" }] } },
    };
    const index = buildBacklinkIndex(noteData);
    expect(index.get("target")).toHaveLength(2);
  });

  it("skips notes without content/blocks", () => {
    const noteData = {
      n1: { title: "Empty" },
      n2: { title: "Null", content: null },
    };
    const index = buildBacklinkIndex(noteData);
    expect(index.size).toBe(0);
  });

  it("skips blocks without text", () => {
    const noteData = {
      n1: { title: "A", content: { blocks: [{ id: "b1" }] } },
    };
    const index = buildBacklinkIndex(noteData);
    expect(index.size).toBe(0);
  });

  it("includes snippet from block text", () => {
    const noteData = {
      n1: {
        title: "Source",
        content: { blocks: [{ id: "b1", text: "Check [[Link]] for info" }] },
      },
    };
    const index = buildBacklinkIndex(noteData);
    expect(index.get("link")[0].snippet).toBe("Check [[Link]] for info");
  });
});

describe("getBacklinksForNote", () => {
  it("returns backlinks case-insensitively", () => {
    const noteData = {
      n1: { title: "A", content: { blocks: [{ id: "b1", text: "[[My Note]]" }] } },
    };
    const index = buildBacklinkIndex(noteData);
    expect(getBacklinksForNote(index, "My Note")).toHaveLength(1);
    expect(getBacklinksForNote(index, "my note")).toHaveLength(1);
    expect(getBacklinksForNote(index, "MY NOTE")).toHaveLength(1);
  });

  it("returns empty array for unknown note", () => {
    const index = buildBacklinkIndex({});
    expect(getBacklinksForNote(index, "Nonexistent")).toEqual([]);
  });

  it("returns empty array for null/empty title", () => {
    const index = buildBacklinkIndex({});
    expect(getBacklinksForNote(index, null)).toEqual([]);
    expect(getBacklinksForNote(index, "")).toEqual([]);
  });

  it("trims whitespace from title", () => {
    const noteData = {
      n1: { title: "A", content: { blocks: [{ id: "b1", text: "[[Target]]" }] } },
    };
    const index = buildBacklinkIndex(noteData);
    expect(getBacklinksForNote(index, "  Target  ")).toHaveLength(1);
  });
});
