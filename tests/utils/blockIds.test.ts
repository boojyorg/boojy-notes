import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { keepBlockIds, withKeptBlockIds } from "../../src/utils/blockIds";
import { markdownToBlocks } from "../../src/utils/markdown";
import type { Block } from "../../src/types/notes";

// The parser ends every note with an empty paragraph to type into; the
// examples leave it out. The property below reads notes whole.
const parse = (md: string) => markdownToBlocks(md) as Block[];
const read = (md: string) => {
  const blocks = parse(md);
  return blocks.at(-1)?.text === "" ? blocks.slice(0, -1) : blocks;
};
const ids = (blocks: Block[]) => blocks.map((b) => b.id);
const texts = (blocks: Block[]) => blocks.map((b) => b.text);

describe("keepBlockIds", () => {
  it("keeps every id, and the array itself, when nothing changed", () => {
    const before = read("One.\n\nTwo.\n\nThree.\n");
    const after = read("One.\n\nTwo.\n\nThree.\n");
    const kept = keepBlockIds(before, after);
    expect(ids(kept)).toEqual(ids(before));
    expect(keepBlockIds(before, kept)).toBe(kept);
  });

  it("keeps the ids below a line added above, and gives the new line its own", () => {
    const before = read("One.\n\nTwo.\n");
    const kept = keepBlockIds(before, read("New.\n\nOne.\n\nTwo.\n"));
    expect(texts(kept)).toEqual(["New.", "One.", "Two."]);
    expect(ids(kept).slice(1)).toEqual(ids(before));
    expect(ids(before)).not.toContain(kept[0].id);
  });

  it("keeps the id of the one block an editor changed, so its caret is painted back", () => {
    const before = read("One.\n\nTwo.\n\nThree.\n");
    const kept = keepBlockIds(before, read("One.\n\nTwo, rewritten.\n\nThree.\n"));
    expect(ids(kept)).toEqual(ids(before));
    expect(kept[1].text).toBe("Two, rewritten.");
  });

  it("gives a block that changed kind a new id", () => {
    const before = read("One.\n\nTwo.\n");
    const kept = keepBlockIds(before, read("One.\n\n# Two.\n"));
    expect(kept[0].id).toBe(before[0].id);
    expect(kept[1].id).not.toBe(before[1].id);
  });

  it("keeps the ids of blocks that survive a removal", () => {
    const before = read("One.\n\nTwo.\n\nThree.\n");
    const kept = keepBlockIds(before, read("One.\n\nThree.\n"));
    expect(ids(kept)).toEqual([before[0].id, before[2].id]);
  });

  it("matches identical blocks in order, never giving one id to two blocks", () => {
    const before = read("Same.\n\nSame.\n\nSame.\n");
    const kept = keepBlockIds(before, read("Same.\n\nSame.\n\nSame.\n\nSame.\n"));
    expect(new Set(ids(kept)).size).toBe(4);
    expect(ids(kept).filter((id) => ids(before).includes(id))).toHaveLength(3);
  });

  it("keeps ids through a reorder for the blocks in the longest common run", () => {
    const before = read("A.\n\nB.\n\nC.\n\nD.\n");
    const kept = keepBlockIds(before, read("A.\n\nC.\n\nB.\n\nD.\n"));
    expect(kept[0].id).toBe(before[0].id);
    expect(kept[3].id).toBe(before[3].id);
    expect(new Set(ids(kept)).size).toBe(4);
  });

  it("keeps a list item's id when only its text changed", () => {
    const before = read("- one\n- two\n- three\n");
    const kept = keepBlockIds(before, read("- one\n- two!\n- three\n"));
    expect(ids(kept)).toEqual(ids(before));
  });

  it("never gives two blocks one id, whatever the two versions are", () => {
    const line = fc.constantFrom("A.", "B.", "Same.", "# H", "- item", "> quote", "---");
    const doc = fc.array(line, { maxLength: 12 }).map((ls) => `${ls.join("\n\n")}\n`);
    fc.assert(
      fc.property(doc, doc, (a, b) => {
        const before = parse(a);
        const after = parse(b);
        const kept = keepBlockIds(before, after);
        expect(new Set(ids(kept)).size).toBe(kept.length);
        expect(kept.map((k) => ({ ...k, id: "" }))).toEqual(after.map((k) => ({ ...k, id: "" })));
      }),
      { seed: 42, numRuns: 300 },
    );
  });
});

describe("withKeptBlockIds", () => {
  it("returns the note itself when there is nothing to keep", () => {
    const note = { id: "n", content: { blocks: read("One.\n") } };
    expect(withKeptBlockIds(undefined, note)).toBe(note);
    expect(withKeptBlockIds(note, note)).toBe(note);
  });

  it("carries the previous version's ids into the new one", () => {
    const previous = { id: "n", content: { blocks: read("One.\n\nTwo.\n") } };
    const note = { id: "n", title: "T", content: { blocks: read("One.\n\nTwo!\n") } };
    const kept = withKeptBlockIds(previous, note);
    expect(ids(kept.content.blocks)).toEqual(ids(previous.content.blocks));
    expect(kept.title).toBe("T");
  });
});
