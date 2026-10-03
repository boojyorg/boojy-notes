import { describe, expect, it } from "vitest";
import type { NoteData } from "../../src/types/notes";
import { editBlocks, patchBlock } from "../../src/utils/editBlocks";

const notes = (): NoteData =>
  ({
    a: {
      id: "a",
      title: "A",
      content: {
        title: "A",
        blocks: [
          { id: "1", type: "p", text: "one" },
          { id: "2", type: "p", text: "two" },
        ],
      },
    },
    b: { id: "b", title: "B", content: { title: "B", blocks: [] } },
  }) as unknown as NoteData;

describe("editBlocks", () => {
  it("edits a copy: the note and map are new, the other notes and blocks are the same objects", () => {
    const prev = notes();
    const next = editBlocks("a", (blocks) => {
      blocks.splice(1, 1);
    })(prev);
    expect(next.a.content.blocks.map((b) => b.id)).toEqual(["1"]);
    expect(prev.a.content.blocks).toHaveLength(2);
    expect(next).not.toBe(prev);
    expect(next.b).toBe(prev.b);
    expect(next.a.content.blocks[0]).toBe(prev.a.content.blocks[0]);
    expect(next.a.title).toBe("A");
  });

  it("ignores what the edit returns unless it is false: a splice's removed blocks are not the note", () => {
    const prev = notes();
    const next = editBlocks("a", (blocks) => blocks.splice(0, 1))(prev);
    expect(next.a.content.blocks.map((b) => b.id)).toEqual(["2"]);
  });

  it("returns the same map when the edit answers false, or the note is gone", () => {
    const prev = notes();
    expect(editBlocks("a", () => false)(prev)).toBe(prev);
    expect(editBlocks("missing", () => {})(prev)).toBe(prev);
  });
});

describe("patchBlock", () => {
  it("merges fields over one block, given or computed from it", () => {
    const prev = notes();
    expect(patchBlock("a", 1, { text: "TWO" })(prev).a.content.blocks[1]).toEqual({
      id: "2",
      type: "p",
      text: "TWO",
    });
    const shouted = patchBlock("a", 0, (b) => ({ text: `${(b as { text: string }).text}!` }))(prev);
    expect(shouted.a.content.blocks[0]).toMatchObject({ text: "one!" });
    expect(shouted.a.content.blocks[1]).toBe(prev.a.content.blocks[1]);
  });
});
