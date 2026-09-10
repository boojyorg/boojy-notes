/** @vitest-environment jsdom */
/**
 * One edit, one block root: the shape arithmetic behind the rule. Which
 * roots a range touches, what a native input type means across roots, what
 * the blocks become, and what a Delete or Backspace reaching into a
 * neighbour may do, across representative block types.
 */
import { describe, expect, it } from "vitest";
import type { Block } from "../../src/types/notes";
import {
  applyAcrossBlocks,
  intentOf,
  markdownAfter,
  markdownBefore,
  rangeScope,
  reachAcross,
} from "../../src/utils/crossBlockEdit";

const genId = () => "fresh";

const p = (id: string, text: string): Block => ({ id, type: "p", text });
const h1 = (id: string, text: string): Block => ({ id, type: "h1", text });
const bullet = (id: string, text: string, indent = 0): Block => ({
  id,
  type: "bullet",
  text,
  indent,
});
const checkbox = (id: string, text: string): Block => ({
  id,
  type: "checkbox",
  text,
  checked: true,
});
const quote = (id: string, text: string): Block => ({ id, type: "blockquote", text });
const code = (id: string): Block => ({ id, type: "code", text: "x = 1" });
const table = (id: string): Block => ({ id, type: "table", rows: [["a"]] });
const divider = (id: string): Block => ({ id, type: "spacer" });
const image = (id: string): Block => ({ id, type: "image", src: "a.png" });

describe("rangeScope: which block roots a range touches", () => {
  function editor(blocks: Block[]) {
    const editorEl = document.createElement("div");
    const refs: Record<string, HTMLElement> = {};
    for (const b of blocks) {
      const root = document.createElement("div");
      root.dataset.blockId = b.id;
      if (b.type === "table") {
        root.contentEditable = "false";
        const cell = document.createElement("td");
        cell.contentEditable = "true";
        cell.textContent = "cell";
        root.appendChild(cell);
      } else if (b.type === "code" || b.type === "spacer") {
        root.contentEditable = "false";
        root.textContent = b.type;
      } else {
        root.textContent = b.text ?? "";
        refs[b.id] = root;
      }
      editorEl.appendChild(root);
    }
    document.body.appendChild(editorEl);
    return { editorEl, refs, roots: Array.from(editorEl.children) as HTMLElement[] };
  }
  const point = (node: Node, offset: number) => ({ container: node, offset });
  const range = (
    s: { container: Node; offset: number },
    e: { container: Node; offset: number },
  ) => ({
    startContainer: s.container,
    startOffset: s.offset,
    endContainer: e.container,
    endOffset: e.offset,
  });

  it("both ends in one text block is that block", () => {
    const blocks = [p("a", "first"), p("b", "second")];
    const { editorEl, refs, roots } = editor(blocks);
    const t = roots[0].firstChild as Text;
    const scope = rangeScope(range(point(t, 1), point(t, 3)), editorEl, blocks, refs);
    expect(scope.kind).toBe("block");
    expect(scope.start?.blockIndex).toBe(0);
    expect(scope.start?.el).toBe(roots[0]);
  });

  it("a selection inside a table cell is the table block, with no element", () => {
    const blocks = [p("a", "first"), table("t")];
    const { editorEl, refs, roots } = editor(blocks);
    const cellText = roots[1].firstChild!.firstChild as Text;
    const scope = rangeScope(range(point(cellText, 0), point(cellText, 2)), editorEl, blocks, refs);
    expect(scope.kind).toBe("block");
    expect(scope.start?.blockIndex).toBe(1);
    expect(scope.start?.el).toBeUndefined();
  });

  it("ends in two roots is cross, for text, heading and list roots alike", () => {
    const blocks = [h1("a", "Title"), bullet("b", "item"), p("c", "para")];
    const { editorEl, refs, roots } = editor(blocks);
    const scope = rangeScope(
      range(point(roots[0].firstChild!, 2), point(roots[2].firstChild!, 1)),
      editorEl,
      blocks,
      refs,
    );
    expect(scope.kind).toBe("cross");
    expect([scope.start?.blockIndex, scope.end?.blockIndex]).toEqual([0, 2]);
  });

  it("a forward Delete's reach, ending at offset 0 of the next root, is cross", () => {
    const blocks = [p("a", "first"), p("b", "second")];
    const { editorEl, refs, roots } = editor(blocks);
    const scope = rangeScope(
      range(point(roots[0].firstChild!, 5), point(roots[1], 0)),
      editorEl,
      blocks,
      refs,
    );
    expect(scope.kind).toBe("cross");
  });

  it("a point on the editor element addresses the child at the offset (start) or before it (end)", () => {
    const blocks = [p("a", "first"), code("c"), p("d", "fourth")];
    const { editorEl, refs, roots } = editor(blocks);
    // From inside "first" to just after the code root: the end is the code block.
    const scope = rangeScope(
      range(point(roots[0].firstChild!, 2), point(editorEl, 2)),
      editorEl,
      blocks,
      refs,
    );
    expect(scope.kind).toBe("cross");
    expect(scope.end?.blockIndex).toBe(1);
    // A start on the editor element at index 1 is the code block too.
    const scope2 = rangeScope(
      range(point(editorEl, 1), point(roots[2].firstChild!, 1)),
      editorEl,
      blocks,
      refs,
    );
    expect(scope2.kind).toBe("cross");
    expect(scope2.start?.blockIndex).toBe(1);
  });

  it("an end in no root at all, or ends in the wrong order, is outside", () => {
    const blocks = [p("a", "first"), p("b", "second")];
    const { editorEl, refs, roots } = editor(blocks);
    const orphan = document.createTextNode("stray");
    editorEl.appendChild(orphan);
    expect(
      rangeScope(range(point(roots[0].firstChild!, 1), point(orphan, 2)), editorEl, blocks, refs)
        .kind,
    ).toBe("outside");
    // A collapsed point on the editor element itself: start is child k, end child k-1.
    expect(
      rangeScope(range(point(editorEl, 1), point(editorEl, 1)), editorEl, blocks, refs).kind,
    ).toBe("outside");
    expect(
      rangeScope(range(point(editorEl, 0), point(editorEl, 0)), editorEl, blocks, refs).kind,
    ).toBe("outside");
  });

  it("a root the model no longer knows is outside", () => {
    const blocks = [p("a", "first")];
    const { editorEl, refs, roots } = editor([p("a", "first"), p("gone", "stale")]);
    expect(
      rangeScope(
        range(point(roots[0].firstChild!, 1), point(roots[1].firstChild!, 1)),
        editorEl,
        blocks,
        refs,
      ).kind,
    ).toBe("outside");
  });
});

describe("intentOf: what a native input type means across roots", () => {
  it("every delete is a delete, except a drag's, which is refused", () => {
    for (const t of [
      "deleteContentBackward",
      "deleteContentForward",
      "deleteWordBackward",
      "deleteSoftLineForward",
      "deleteHardLineBackward",
      "deleteByCut",
      "deleteContent",
    ])
      expect(intentOf(t, null)).toEqual({ kind: "delete" });
    expect(intentOf("deleteByDrag", null)).toBeNull();
  });

  it("typed, replaced, transposed, pasted and yanked text is text", () => {
    expect(intentOf("insertText", "x")).toEqual({ kind: "insertText", text: "x" });
    expect(intentOf("insertReplacementText", "the")).toEqual({ kind: "insertText", text: "the" });
    expect(intentOf("insertFromPaste", "p")).toEqual({ kind: "insertText", text: "p" });
    expect(intentOf("insertFromYank", null)).toEqual({ kind: "insertText", text: "" });
  });

  it("Enter splits, Shift+Enter breaks a line", () => {
    expect(intentOf("insertParagraph", null)).toEqual({ kind: "insertParagraph" });
    expect(intentOf("insertLineBreak", null)).toEqual({ kind: "insertLineBreak" });
  });

  it("formatting, history, composition and drops are refused across roots", () => {
    for (const t of [
      "formatBold",
      "formatItalic",
      "formatStrikeThrough",
      "historyUndo",
      "historyRedo",
      "insertCompositionText",
      "insertFromDrop",
      "insertLink",
      "insertHorizontalRule",
    ])
      expect(intentOf(t, "x")).toBeNull();
  });
});

describe("applyAcrossBlocks: what the blocks become", () => {
  const three = () => [p("a", "first"), p("b", "second"), p("c", "third")];

  it("delete keeps the start block's text before and the end block's after, and drops the run between", () => {
    const r = applyAcrossBlocks(
      [...three(), p("d", "fourth")],
      0,
      2,
      "fi",
      "ird",
      { kind: "delete" },
      genId,
    );
    expect(r?.blocks.map((b) => b.text)).toEqual(["fiird", "fourth"]);
    expect(r?.blocks.map((b) => b.id)).toEqual(["a", "d"]);
    expect([r?.focusId, r?.focusPos]).toEqual(["a", 2]);
  });

  it("the start block keeps its type: a heading merged with a paragraph stays a heading, a list item a list item", () => {
    const r = applyAcrossBlocks(
      [h1("a", "Title"), p("b", "body")],
      0,
      1,
      "Ti",
      "dy",
      { kind: "delete" },
      genId,
    );
    expect(r?.blocks).toEqual([h1("a", "Tidy")]);
    const r2 = applyAcrossBlocks(
      [bullet("a", "item", 1), h1("b", "Head")],
      0,
      1,
      "it",
      "ad",
      { kind: "delete" },
      genId,
    );
    expect(r2?.blocks).toEqual([bullet("a", "itad", 1)]);
  });

  it("a divider, image or code block strictly inside the run goes with it", () => {
    const blocks = [p("a", "first"), divider("s"), image("i"), code("k"), p("b", "second")];
    const r = applyAcrossBlocks(blocks, 0, 4, "fi", "ond", { kind: "delete" }, genId);
    expect(r?.blocks).toEqual([p("a", "fiond")]);
  });

  it("text lands between the two halves, caret after it", () => {
    const r = applyAcrossBlocks(
      three(),
      0,
      1,
      "fi",
      "ond",
      { kind: "insertText", text: "XY" },
      genId,
    );
    expect(r?.blocks.map((b) => b.text)).toEqual(["fiXYond", "third"]);
    expect([r?.focusId, r?.focusPos]).toEqual(["a", 4]);
  });

  it("a paragraph split makes a paragraph after a paragraph or heading, and another item after a list item", () => {
    const r = applyAcrossBlocks(three(), 0, 1, "fi", "ond", { kind: "insertParagraph" }, genId);
    expect(r?.blocks).toEqual([p("a", "fi"), p("fresh", "ond"), p("c", "third")]);
    expect([r?.focusId, r?.focusPos]).toEqual(["fresh", 0]);

    const h = applyAcrossBlocks(
      [h1("a", "Title"), p("b", "body")],
      0,
      1,
      "Ti",
      "dy",
      { kind: "insertParagraph" },
      genId,
    );
    expect(h?.blocks).toEqual([h1("a", "Ti"), p("fresh", "dy")]);

    const l = applyAcrossBlocks(
      [bullet("a", "one", 2), bullet("b", "two", 2)],
      0,
      1,
      "o",
      "o",
      { kind: "insertParagraph" },
      genId,
    );
    expect(l?.blocks).toEqual([bullet("a", "o", 2), bullet("fresh", "o", 2)]);

    const c = applyAcrossBlocks(
      [checkbox("a", "done"), p("b", "next")],
      0,
      1,
      "do",
      "xt",
      { kind: "insertParagraph" },
      genId,
    );
    expect(c?.blocks).toEqual([
      checkbox("a", "do"),
      { id: "fresh", type: "checkbox", text: "xt", checked: false },
    ]);

    const q = applyAcrossBlocks(
      [quote("a", "said"), p("b", "then")],
      0,
      1,
      "sa",
      "en",
      { kind: "insertParagraph" },
      genId,
    );
    expect(q?.blocks).toEqual([quote("a", "sa"), quote("fresh", "en")]);
  });

  it("a line break is a newline inside a paragraph, list item or quote, and a split after a heading", () => {
    const r = applyAcrossBlocks(three(), 0, 1, "fi", "ond", { kind: "insertLineBreak" }, genId);
    expect(r?.blocks.map((b) => b.text)).toEqual(["fi\nond", "third"]);
    expect([r?.focusId, r?.focusPos]).toEqual(["a", 3]);
    const q = applyAcrossBlocks(
      [quote("a", "said"), p("b", "then")],
      0,
      1,
      "sa",
      "en",
      { kind: "insertLineBreak" },
      genId,
    );
    expect(q?.blocks).toEqual([quote("a", "sa\nen")]);
    const h = applyAcrossBlocks(
      [h1("a", "Title"), p("b", "body")],
      0,
      1,
      "Ti",
      "dy",
      { kind: "insertLineBreak" },
      genId,
    );
    expect(h?.blocks).toEqual([h1("a", "Ti"), p("fresh", "dy")]);
  });

  it("refuses when either end is not a text block", () => {
    expect(
      applyAcrossBlocks([p("a", "x"), table("t")], 0, 1, "x", "", { kind: "delete" }, genId),
    ).toBeNull();
    expect(
      applyAcrossBlocks(
        [code("k"), p("a", "x")],
        0,
        1,
        "",
        "x",
        { kind: "insertText", text: "y" },
        genId,
      ),
    ).toBeNull();
    expect(
      applyAcrossBlocks(
        [p("a", "x"), divider("s")],
        0,
        1,
        "x",
        "",
        { kind: "insertParagraph" },
        genId,
      ),
    ).toBeNull();
  });

  it("works within one block too, for the cut path", () => {
    const r = applyAcrossBlocks(three(), 1, 1, "se", "nd", { kind: "delete" }, genId);
    expect(r?.blocks.map((b) => b.text)).toEqual(["first", "send", "third"]);
    expect([r?.focusId, r?.focusPos]).toEqual(["b", 2]);
  });
});

describe("reachAcross: a Delete or Backspace with a collapsed caret reaching into a neighbour", () => {
  it("merges with an adjacent text block, whichever side", () => {
    const blocks = [p("a", "first"), p("b", "second"), h1("c", "third")];
    expect(reachAcross(blocks, 0, 1)).toEqual({ kind: "merge", startIdx: 0, endIdx: 1 });
    expect(reachAcross(blocks, 1, 0)).toEqual({ kind: "merge", startIdx: 0, endIdx: 1 });
    expect(reachAcross(blocks, 1, 2)).toEqual({ kind: "merge", startIdx: 1, endIdx: 2 });
  });

  it("selects an adjacent divider, image or table instead of merging past it", () => {
    expect(reachAcross([p("a", "x"), divider("s"), p("b", "y")], 0, 2)).toEqual({
      kind: "select",
      blockId: "s",
    });
    expect(reachAcross([p("a", "x"), image("i"), p("b", "y")], 2, 0)).toEqual({
      kind: "select",
      blockId: "i",
    });
    // A table is addressed as a whole too (2026-09-10): forward Delete from
    // above and Backspace from below select it; before this both were refused
    // and the table could not be removed from the keyboard at all.
    expect(reachAcross([p("a", "x"), table("t"), p("b", "y")], 0, 2)).toEqual({
      kind: "select",
      blockId: "t",
    });
    expect(reachAcross([p("a", "x"), table("t"), p("b", "y")], 2, 0)).toEqual({
      kind: "select",
      blockId: "t",
    });
  });

  it("refuses beside a code block or any other block that owns itself, even when Chromium's reach skips it", () => {
    expect(reachAcross([p("a", "x"), code("k"), p("b", "y")], 0, 2)).toBeNull();
    expect(reachAcross([code("k"), p("b", "y")], 1, 0)).toBeNull();
  });

  it("refuses with nothing beside the caret, or a reach that is not the neighbour", () => {
    expect(reachAcross([p("a", "x")], 0, 0)).toBeNull();
    expect(reachAcross([p("a", "x"), p("b", "y")], 1, 2)).toBeNull();
    expect(reachAcross([p("a", "x"), p("b", "y"), p("c", "z")], 0, 2)).toBeNull();
  });
});

describe("markdownBefore / markdownAfter", () => {
  it("read the Markdown either side of a point, formatting kept", () => {
    const el = document.createElement("p");
    el.innerHTML = "one <strong>two</strong> three";
    const t = el.lastChild as Text;
    expect(markdownBefore(el, t, 1)).toBe("one **two** ");
    expect(markdownAfter(el, t, 1)).toBe("three");
  });
});
