/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  capturePlace,
  type NotePlace,
  resolveAnchor,
  resolveCaret,
} from "../../src/utils/notePlace";

const place = (over: Partial<NotePlace> = {}): NotePlace => ({
  atTop: false,
  anchor: { id: "b", before: "a", after: "c", top: 12 },
  caret: { id: "c", offset: 3 },
  ...over,
});

describe("resolveAnchor", () => {
  it("returns to the block that was at the top, at the height it stood", () => {
    expect(resolveAnchor(place(), new Set(["a", "b", "c"]))).toEqual({ id: "b", top: 12 });
  });

  // An edit made while away removed the block: its neighbour stands in, the
  // one after first (it moved up into the place), never an unrelated block.
  it("falls back to the next block, then the one before, when it is gone", () => {
    expect(resolveAnchor(place(), new Set(["a", "c", "z"]))).toEqual({ id: "c", top: 12 });
    expect(resolveAnchor(place(), new Set(["a", "z"]))).toEqual({ id: "a", top: 12 });
  });

  it("is nothing, so the note opens at its top, when no neighbour survives or it was at the top", () => {
    expect(resolveAnchor(place(), new Set(["x", "y"]))).toBeNull();
    expect(resolveAnchor(place({ atTop: true }), new Set(["a", "b", "c"]))).toBeNull();
    expect(resolveAnchor(place({ anchor: null }), new Set(["b"]))).toBeNull();
  });
});

describe("resolveCaret", () => {
  it("puts the caret back only in a block that still exists", () => {
    expect(resolveCaret(place(), new Set(["c"]))).toEqual({ id: "c", offset: 3 });
    expect(resolveCaret(place(), new Set(["a", "b"]))).toBeNull();
    expect(resolveCaret(place({ caret: null }), new Set(["c"]))).toBeNull();
  });
});

describe("capturePlace", () => {
  // A pane 100px tall from y=100; blocks 40px tall from y=60 (the first is
  // scrolled half out of view above).
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, left: 0, right: 100, height, width: 100 }) as DOMRect;
  const pane = (scrollTop = 50) =>
    ({ getBoundingClientRect: () => rect(100, 100), scrollTop }) as unknown as Element;
  const blocks = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
  const refs = Object.fromEntries(
    blocks.map((b, i) => [b.id, { getBoundingClientRect: () => rect(60 + i * 40, 40) } as Element]),
  );

  it("records the first block showing, its neighbours, and how far down the pane it stands", () => {
    const p = capturePlace(blocks, refs, pane(), () => null);
    // a spans 60–100: not showing; b spans 100–140.
    expect(p).toEqual({
      atTop: false,
      anchor: { id: "b", before: "a", after: "c", top: 0 },
      caret: null,
    });
  });

  // A caret scrolled out of view is not restored: typing there would be unseen.
  // Its own line decides, never its block: a tall block shows while the line
  // the caret is on has gone above (review 2026-10-31).
  it("keeps the caret only while its own line is on screen", () => {
    const at = (id: string, top: number) => () => ({ id, offset: 2, line: rect(top, 16) });
    expect(capturePlace(blocks, refs, pane(), at("c", 145))?.caret).toEqual({ id: "c", offset: 2 });
    expect(capturePlace(blocks, refs, pane(), at("a", 70))?.caret).toBeNull();
    // b shows (100–140), but a caret on a line at 80 is above the pane.
    expect(capturePlace(blocks, refs, pane(), at("b", 80))?.caret).toBeNull();
  });

  // Rects are viewport pixels; the place keeps CSS pixels (the UI scale).
  it("records how far down the anchor stands in CSS pixels", () => {
    const shifted = { ...refs, b: { getBoundingClientRect: () => rect(112, 40) } as Element };
    expect(capturePlace(blocks, shifted, pane(), () => null, 1.2)?.anchor?.top).toBeCloseTo(10);
  });

  it("says when the view was at the very top, and is nothing with no block on screen", () => {
    expect(capturePlace(blocks, refs, pane(0), () => null)?.atTop).toBe(true);
    expect(capturePlace([], {}, pane(), () => null)).toBeNull();
  });
});
