import { describe, expect, it } from "vitest";
import {
  BLOCK_JOIN,
  buildPlainText,
  buildSearchIndex,
  findMatchBlock,
  foldText,
  searchNotes,
} from "../../src/utils/search";
import type { Block, NoteData } from "../../src/types/notes";

const p = (id: string, text: string) => ({ id, type: "p", text }) as Block;
const note = (title: string, blocks: Block[], extra: Record<string, unknown> = {}) =>
  ({ title, folder: null, content: { title, blocks }, lastModified: 0, ...extra }) as never;

describe("foldText", () => {
  it("lower-cases and drops accents, mapping every folded unit back to its source", () => {
    const f = foldText("Café Ñu");
    expect(f.text).toBe("cafe nu");
    expect(f.map[3]).toBe(3);
    expect(f.map[f.text.length]).toBe("Café Ñu".length);
  });

  it("keeps offsets right through a decomposed accent", () => {
    const s = "éx"; // é as e + combining acute
    const f = foldText(s);
    expect(f.text).toBe("ex");
    expect(f.map).toEqual([0, 2, 3]);
  });
});

describe("buildPlainText", () => {
  it("returns empty for no blocks", () => {
    expect(buildPlainText([])).toEqual({ plainText: "", blockOffsets: [] });
  });

  it("joins blocks with the block separator and tracks offsets", () => {
    const { plainText, blockOffsets } = buildPlainText([p("a", "Heading"), p("b", "line under")]);
    expect(plainText).toBe(`Heading${BLOCK_JOIN}line under`);
    expect(blockOffsets).toEqual([
      { blockIndex: 0, blockId: "a", start: 0, end: 7 },
      {
        blockIndex: 1,
        blockId: "b",
        start: 7 + BLOCK_JOIN.length,
        end: 7 + BLOCK_JOIN.length + 10,
      },
    ]);
  });

  it("reads a callout's title and body and a table's cells; a code body is text too", () => {
    const blocks = [
      { id: "c", type: "callout", title: "Note", text: "body" },
      {
        id: "t",
        type: "table",
        rows: [
          ["h1", "h2"],
          ["x", "y"],
        ],
      },
      { id: "k", type: "code", text: "const #fff = 1" },
    ] as Block[];
    const { plainText } = buildPlainText(blocks);
    expect(plainText).toContain("Note body");
    expect(plainText).toContain("h1 h2 x y");
    expect(plainText).toContain("const #fff = 1");
  });
});

describe("findMatchBlock", () => {
  const offsets = [
    { blockIndex: 0, blockId: "a", start: 0, end: 5 },
    { blockIndex: 1, blockId: "b", start: 8, end: 12 },
  ];
  it("returns null for empty offsets", () => {
    expect(findMatchBlock([], 0)).toBeNull();
  });
  it("finds the block, and the next block for a position in the join", () => {
    expect(findMatchBlock(offsets, 3)).toBe("a");
    expect(findMatchBlock(offsets, 9)).toBe("b");
    expect(findMatchBlock(offsets, 6)).toBe("b");
  });
});

describe("searchNotes", () => {
  const noteData: NoteData = {
    js: note("JavaScript Guide", [p("b1", "Learn JS basics")], { lastModified: 100 }),
    py: note("Python Tutorial", [p("b2", "Learn Python")], { lastModified: 200 }),
    meet: note(
      "Meeting Notes",
      [p("b3", "Discuss project"), p("b4", "with #todd about the draft")],
      {
        lastModified: 300,
      },
    ),
    todd: note("Todd's Note", [p("b5", "Nothing to see")], { lastModified: 50 }),
    today: note("Shopping", [p("b6", "Today I decided to do the dishes")], { lastModified: 10 }),
    cafe: note("Café list", [p("b7", "El café de la esquina")], { lastModified: 5 }),
  };
  const index = buildSearchIndex(noteData);

  it("returns empty for a blank query", () => {
    expect(searchNotes("", index).results).toEqual([]);
    expect(searchNotes("  ", index).results).toEqual([]);
  });

  it("ranks a title hit above a body hit and marks the matched title words", () => {
    const { results } = searchNotes("todd", index);
    expect(results.map((r) => r.noteId)).toEqual(["todd", "meet"]);
    expect(results[0].matchIn).toBe("title");
    expect(results[0].titleRanges).toEqual([[0, 4]]);
    expect(results[0].snippet).toBeNull();
  });

  it("never matches scattered letters: `todd` does not light `Today I de`", () => {
    const { results } = searchNotes("todd", index);
    expect(results.map((r) => r.noteId)).not.toContain("today");
  });

  it("a body-only hit carries an excerpt with only the matched word marked, and its block", () => {
    const { results } = searchNotes("todd", index);
    const meet = results[1];
    expect(meet.matchIn).toBe("body");
    expect(meet.matchBlockId).toBe("b4");
    const s = meet.snippet!;
    expect(s.ranges).toHaveLength(1);
    expect(s.text.slice(...s.ranges[0])).toBe("todd");
  });

  it("an excerpt that crosses a block boundary shows the separator; one inside a block does not", () => {
    const { results } = searchNotes("discuss", index);
    expect(results[0].snippet!.text).toContain("Discuss project");
    const across = searchNotes("project with", index).results[0];
    expect(across.snippet!.text).toContain(`project${BLOCK_JOIN}with`);
    const inside = searchNotes("basics", index).results[0];
    expect(inside.snippet!.text).not.toContain(BLOCK_JOIN);
  });

  it("every word must match, in any order, across title and body", () => {
    expect(searchNotes("draft meeting", index).results.map((r) => r.noteId)).toEqual(["meet"]);
    expect(searchNotes("meeting python", index).results).toEqual([]);
    // Some words in the title, one only in the body: an excerpt explains the rest.
    const mixed = searchNotes("meeting draft", index).results[0];
    expect(mixed.matchIn).toBe("body");
    expect(mixed.titleRanges).toEqual([[0, 7]]);
  });

  it("folds case and accents: `cafe` finds `Café`, marked as written", () => {
    const { results } = searchNotes("cafe", index);
    expect(results[0].noteId).toBe("cafe");
    expect(results[0].titleRanges).toEqual([[0, 4]]);
  });

  it("ranks a word-start hit above a mid-word one, then by recency", () => {
    const data: NoteData = {
      a: note("Notes on scripting", [], { lastModified: 1 }),
      b: note("Script ideas", [], { lastModified: 2 }),
      c: note("Scripts", [], { lastModified: 3 }),
    };
    const { results } = searchNotes("script", buildSearchIndex(data));
    expect(results.map((r) => r.noteId)).toEqual(["c", "b", "a"]);
  });

  it("matches a title's initials (`tn` → Todd's Note) and nothing looser", () => {
    const { results } = searchNotes("tn", index);
    expect(results.map((r) => r.noteId)).toEqual(["todd"]);
    expect(results[0].titleRanges).toEqual([
      [0, 1],
      [7, 8],
    ]);
    expect(searchNotes("tdn", index).results).toEqual([]);
  });

  it("restricts to the given notes, and lists them newest first with no query", () => {
    const ids = new Set(["meet", "todd"]);
    expect(searchNotes("", index, { noteIds: ids }).results.map((r) => r.noteId)).toEqual([
      "meet",
      "todd",
    ]);
    expect(searchNotes("nothing", index, { noteIds: ids }).results.map((r) => r.noteId)).toEqual([
      "todd",
    ]);
    expect(searchNotes("python", index, { noteIds: ids }).results).toEqual([]);
  });

  it("respects the limit and reports the total", () => {
    const { results, totalCount } = searchNotes("learn", index, { limit: 1 });
    expect(results).toHaveLength(1);
    expect(totalCount).toBe(2);
  });
});
