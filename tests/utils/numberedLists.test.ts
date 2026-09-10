import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown";
import { listLayout, reconcileListEdit } from "../../src/utils/listStructure";
import type { Block } from "../../src/types/notes";

const md = new MarkdownIt("commonmark");
const item = (id: string, indent = 0, type: Block["type"] = "numbered"): Block => ({
  id,
  text: id,
  type,
  ...(indent ? { indent } : {}),
});

// Assert the independent reader's item depth, not just our own round-trip.
function outline(source: string) {
  let depth = 0;
  const rows: [number, string][] = [];
  for (const token of md.parse(source, {})) {
    if (token.type === "list_item_open") depth++;
    if (token.type === "inline") rows.push([depth, token.content]);
    if (token.type === "list_item_close") depth--;
  }
  return rows;
}

describe("numbered-list interoperability", () => {
  it("does not mistake small variations in sibling indentation for nesting", () => {
    const source = "1. Alpha\n  2. Beta\n   1. Child\n2. Gamma";
    const blocks = markdownToBlocks(source);
    expect(blocks.map((b) => b.indent || 0)).toEqual([0, 0, 0, 0]);
    expect(outline(source)).toEqual([
      [1, "Alpha"],
      [1, "Beta"],
      [1, "Child"],
      [1, "Gamma"],
    ]);
    expect(blocksToMarkdown(blocks)).toBe(source);
  });

  it("prevents skipped levels and promotes children when their parent is deleted", () => {
    const before = [item("Parent"), item("Child", 1), item("Grandchild", 2)];
    const skipped = reconcileListEdit(before, [before[0], { ...before[1], indent: 2 }, before[2]]);
    expect(skipped.map((b) => b.indent || 0)).toEqual([0, 1, 2]);
    const deleted = reconcileListEdit(before, before.slice(1));
    expect(blocksToMarkdown(deleted)).toBe("1. Child\n   1. Grandchild");
    expect(outline(blocksToMarkdown(deleted))).toEqual([
      [1, "Child"],
      [2, "Grandchild"],
    ]);
  });

  it("does not rewrite a newly pasted list's authored numbering", () => {
    const source = "007. Alpha\n007. Beta";
    const blocks = markdownToBlocks(source);
    expect(blocksToMarkdown(reconcileListEdit([], blocks))).toBe(source);
  });

  it("continues numbering and preserves child depth across blank rows", () => {
    const source = "7. Parent\n\n   1. Child\n\n      1. Grandchild\n\n7. Sibling";
    const blocks = markdownToBlocks(source);
    expect(
      listLayout(blocks)
        .filter(Boolean)
        .map((p) => p?.number),
    ).toEqual([7, 1, 1, 8]);
    expect(blocks.filter((b) => b.type === "numbered").map((b) => b.indent || 0)).toEqual([
      0, 1, 2, 0,
    ]);
    expect(blocksToMarkdown(blocks)).toBe(source);
    expect(outline(source)).toEqual([
      [1, "Parent"],
      [2, "Child"],
      [3, "Grandchild"],
      [1, "Sibling"],
    ]);
  });

  it("moves descendant prefixes when a parent gains a digit after insertion", () => {
    const before = markdownToBlocks("9. Parent\n   1. Child\n      1. Grandchild");
    const after = reconcileListEdit(before, [item("New"), ...before]);
    const source = blocksToMarkdown(after);
    expect(source).toBe("9. New\n10. Parent\n    1. Child\n       1. Grandchild");
    expect(outline(source)).toEqual([
      [1, "New"],
      [1, "Parent"],
      [2, "Child"],
      [3, "Grandchild"],
    ]);
  });

  it("writes sibling counters independently at each depth, including grandchildren", () => {
    const blocks = [
      item("Parent"),
      item("Child", 1),
      item("Grandchild", 2),
      item("Child2", 1),
      item("Sibling"),
    ];
    const source = blocksToMarkdown(blocks);
    expect(source).toBe("1. Parent\n   1. Child\n      1. Grandchild\n   2. Child2\n2. Sibling");
    expect(outline(source)).toEqual([
      [1, "Parent"],
      [2, "Child"],
      [3, "Grandchild"],
      [2, "Child2"],
      [1, "Sibling"],
    ]);
    expect(markdownToBlocks(source).map((b) => b.indent || 0)).toEqual([0, 1, 2, 1, 0]);
    expect(blocksToMarkdown(markdownToBlocks(source))).toBe(source);
  });

  it("allows for a multi-digit parent's marker and mixes bullet children with numbered siblings", () => {
    const blocks = [
      ...Array.from({ length: 10 }, (_, i) => item(`Item${i + 1}`)),
      item("Detail", 1, "bullet"),
      item("Step", 2),
      item("End"),
    ];
    const source = blocksToMarkdown(blocks);
    expect(source).toContain("10. Item10\n    - Detail\n      1. Step\n11. End");
    expect(outline(source).slice(-4)).toEqual([
      [1, "Item10"],
      [2, "Detail"],
      [3, "Step"],
      [1, "End"],
    ]);
    expect(
      markdownToBlocks(source)
        .map((b) => b.indent || 0)
        .slice(-4),
    ).toEqual([0, 1, 2, 0]);
  });

  it.each([
    "007. Parent\n\t1. Child\n009. Sibling",
    "1. Parent\n    1. Child\n        1. Grandchild\n2. Sibling",
    "7. Alpha\n7. Beta\n9. Gamma",
  ])("preserves imported source during text-only edits: %s", (source) => {
    const before = markdownToBlocks(source);
    const after = before.map((b, i) => (i ? b : { ...b, text: `${b.text}!` }));
    expect(reconcileListEdit(before, after)).toBe(after);
    expect(blocksToMarkdown(after)).toBe(source.replace(before[0].text, `${before[0].text}!`));
  });

  it("renumbers a reordered imported sequence from its original start, leaving another list alone", () => {
    const before = markdownToBlocks("7. Alpha\n7. Beta\n9. Gamma\n\nOther\n\n003. Elsewhere");
    const after = reconcileListEdit(before, [before[1], before[0], ...before.slice(2)]);
    expect(blocksToMarkdown(after)).toBe("7. Beta\n8. Alpha\n9. Gamma\n\nOther\n\n003. Elsewhere");
    expect(
      listLayout(after)
        .filter(Boolean)
        .map((p) => p?.number),
    ).toEqual([7, 8, 9, 3]);
  });

  it("starts a newly indented sequence at one and continues the parent sequence", () => {
    const before = markdownToBlocks("7. Alpha\n8. Beta\n9. Gamma");
    const after = reconcileListEdit(before, [before[0], { ...before[1], indent: 1 }, before[2]]);
    expect(blocksToMarkdown(after)).toBe("7. Alpha\n   1. Beta\n8. Gamma");
  });

  it("renumbers after insertion and deletion without touching an unchanged child sequence", () => {
    const before = markdownToBlocks("1. Alpha\n   07. Child\n2. Beta");
    const inserted = reconcileListEdit(before, [before[0], before[1], item("New"), before[2]]);
    expect(blocksToMarkdown(inserted)).toBe("1. Alpha\n   07. Child\n2. New\n3. Beta");
    const deleted = reconcileListEdit(inserted, inserted.slice(0, -1));
    expect(blocksToMarkdown(deleted)).toBe("1. Alpha\n   07. Child\n2. New");
  });
});
