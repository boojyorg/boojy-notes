import fc from "fast-check";
import MarkdownIt from "markdown-it";
import footnotePlugin from "markdown-it-footnote";
import { describe, expect, it } from "vitest";
import { footnotesAtBottom } from "../../src/utils/footnoteMove";
import { footnoteNumbers } from "../../src/utils/footnoteTarget";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown";
import type { Block } from "../../src/types/notes";

// Meaning is judged by markdown-it, never by our own parser.
const reader = new MarkdownIt("commonmark").use(footnotePlugin);

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

  const lists = (md: string) => reader.render(md).match(/<ol>/g)?.length ?? 0;

  it("leaves a footnote in place where it is all that parts two lists", () => {
    const md = "1. First[^a]\n\n[^a]: Ay.\n\n1. Second[^b]\n\n[^b]: Bee.\n\nEnd.\n";
    const moved = move(md) as string;
    expect(moved).toBe("1. First[^a]\n\n[^a]: Ay.\n\n1. Second[^b]\n\nEnd.\n\n[^b]: Bee.\n");
    expect(lists(moved)).toBe(lists(md));
    expect(move(moved)).toBeNull();
    // Two footnotes between the lists: one stays, the other goes.
    const two = "- a[^a][^b]\n\n[^a]: Ay.\n\n[^b]: Bee.\n\n- b\n\nEnd.\n";
    expect(move(two)).toBe("- a[^a][^b]\n\n[^b]: Bee.\n\n- b\n\nEnd.\n\n[^a]: Ay.\n");
  });
});

describe("Move footnotes to bottom: numbers as they read after the move", () => {
  /** The labels of the footnotes the note ends with, and the number each then shows. */
  const settled = (md: string) => {
    const next = footnotesAtBottom(markdownToBlocks(md) as Block[]) as Block[];
    const numbers = footnoteNumbers(next);
    const run = next
      .filter((b) => b.type === "footnote")
      .map((b) => (b as { label?: string }).label);
    return {
      run,
      shown: run.map((l) => numbers.get(l as string) ?? null),
      again: footnotesAtBottom(next),
    };
  };

  it("counts a reference inside a definition where the definition lands", () => {
    // Before: a (body), b (in a's footnote, above Y), c (body). After the
    // move b's reference is read last, so it is 3.
    const r = settled("X.[^a]\n\n[^a]: Ay, see[^b].\n\nY.[^c]\n\n[^b]: Bee.\n\n[^c]: Cee.\n");
    expect(r.run).toEqual(["a", "c", "b"]);
    expect(r.shown).toEqual([1, 2, 3]);
    expect(r.again).toBeNull();
  });

  it("reaches a stable order when definitions refer to each other", () => {
    const r = settled("X.[^b]\n\n[^a]: Ay, see[^b].\n\n[^b]: Bee, see[^a].\n\nY.\n");
    expect(r.run).toEqual(["b", "a"]);
    expect(r.shown).toEqual([1, 2]);
    expect(r.again).toBeNull();
  });

  it("puts a footnote numbered only from an unused one after it, and stays put", () => {
    const r = settled("X.\n\n[^q]: Queue.\n\n[^z]: Unused, see[^q].\n\nY.[^p]\n\n[^p]: Pea.\n");
    expect(r.run).toEqual(["p", "z", "q"]);
    expect(r.shown).toEqual([1, null, 2]);
    expect(r.again).toBeNull();
  });
});

describe("Move footnotes to bottom, over generated notes", () => {
  const labels = ["a", "b", "c", "d"];
  const refs = fc.array(fc.constantFrom(...labels), { maxLength: 2 });
  const text = (word: string, rs: string[]) => `${word}${rs.map((r) => `[^${r}]`).join("")}`;
  const block = fc.oneof(
    refs.map((rs) => text("Para.", rs)),
    refs.map((rs) => `1. Item${text("", rs)}`),
    refs.map((rs) => `- Bullet${text("", rs)}`),
    fc.tuple(fc.constantFrom(...labels), refs).map(([l, rs]) => `[^${l}]: ${text("Note.", rs)}`),
  );
  const note = fc.array(block, { minLength: 1, maxLength: 8 }).map((bs) => `${bs.join("\n\n")}\n`);
  const runs = Number(process.env.FC_RUNS) || 300;

  it("moves to a layout it then leaves alone, numbered in order, every list kept", () => {
    fc.assert(
      fc.property(note, (md) => {
        const blocks = markdownToBlocks(md) as Block[];
        const next = footnotesAtBottom(blocks);
        if (!next) return;
        expect(footnotesAtBottom(next)).toBeNull();
        // The run the note now ends with (footnotes and their later
        // paragraphs) shows its numbers in order.
        const numbers = footnoteNumbers(next);
        let from = next.length;
        while (from > 0 && next[from - 1].type === "footnote") from--;
        const shown = next
          .slice(from)
          .map((b) => numbers.get((b as { label?: string }).label as string))
          .filter((n): n is number => n !== undefined);
        expect(shown).toEqual([...shown].sort((x, y) => x - y));
        const out = blocksToMarkdown(next);
        expect(reader.render(out).match(/<[ou]l>/g)?.length ?? 0).toBe(
          reader.render(md).match(/<[ou]l>/g)?.length ?? 0,
        );
      }),
      { numRuns: runs, seed: 7 },
    );
  });
});
