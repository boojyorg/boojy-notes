import { describe, expect, it } from "vitest";
import { footnotesAtBottom } from "../../src/utils/footnoteMove";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown";
import type { Block } from "../../src/types/notes";

/** The note as Move footnotes to bottom writes it, or null when nothing moves. */
const move = (md: string) => {
  const next = footnotesAtBottom(markdownToBlocks(md) as Block[]);
  return next && blocksToMarkdown(next);
};

describe("Move footnotes to bottom", () => {
  it("brings a footnote written mid-note, with its later paragraph, under the note", () => {
    expect(move("Claim.[^a]\n\n[^a]: Ay.\n\n    Second para.\n\nMiddle text.\n")).toBe(
      "Claim.[^a]\n\nMiddle text.\n\n[^a]: Ay.\n\n    Second para.\n",
    );
  });

  it("orders them by the number they show, on consecutive lines", () => {
    expect(move("One.[^b] Two.[^a]\n\n[^a]: Ay.\n\n[^b]: Bee.\n")).toBe(
      "One.[^b] Two.[^a]\n\n[^b]: Bee.\n[^a]: Ay.\n",
    );
  });

  it("puts a footnote nothing references last, and a duplicate beside its twin", () => {
    expect(
      move("One.[^a] Two.[^b]\n\n[^b]: Early bee.\n\n[^z]: Unused.\n\n[^a]: Ay.\n\n[^b]: Bee.\n"),
    ).toBe("One.[^a] Two.[^b]\n\n[^a]: Ay.\n[^b]: Early bee.\n[^b]: Bee.\n[^z]: Unused.\n");
  });

  it("keeps the blank rows the note ends with as its last lines", () => {
    expect(move("Claim.[^a]\n\n[^a]: Ay.\n\nEnd.\n\n\n\n")).toBe(
      "Claim.[^a]\n\nEnd.\n\n[^a]: Ay.\n\n\n\n",
    );
  });

  it("drops blank rows between the note and its footnotes", () => {
    expect(move("Claim.[^a]\n\n[^a]: Ay.\n\nEnd.\n\n\n\n[^b]: Bee.\n")).toBe(
      "Claim.[^a]\n\nEnd.\n\n[^a]: Ay.\n[^b]: Bee.\n",
    );
  });

  it("gives a block that stood right under a moved footnote a blank line above", () => {
    expect(move("Claim.[^a]\n\n[^a]: Ay.\n# Heading\n")).toBe(
      "Claim.[^a]\n\n# Heading\n\n[^a]: Ay.\n",
    );
  });

  it("changes nothing when the footnotes are at the bottom in order, however spaced", () => {
    expect(move("Claim.[^a] More.[^b]\n\n[^a]: Ay.\n[^b]: Bee.\n")).toBeNull();
    expect(move("Claim.[^a] More.[^b]\n\n[^a]: Ay.\n\n[^b]: Bee.\n\n")).toBeNull();
    expect(move("No footnotes here.\n")).toBeNull();
  });

  it("reads back as the same footnotes, each with its own text", () => {
    const md = "A.[^b] B.[^a]\n\n[^a]: Ay.\n\n    More ay.\n\nText.\n\n[^b]: Bee.\n";
    const next = footnotesAtBottom(markdownToBlocks(md) as Block[]) as Block[];
    const again = markdownToBlocks(blocksToMarkdown(next)) as Block[];
    const notes = again
      .filter((b) => b.type === "footnote")
      .map((b) => [(b as { label?: string }).label, b.text]);
    expect(notes).toEqual([
      ["b", "Bee."],
      ["a", "Ay."],
    ]);
    expect(blocksToMarkdown(again)).toContain("[^a]: Ay.\n\n    More ay.\n");
  });
});
