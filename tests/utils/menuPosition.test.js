import { describe, it, expect } from "vitest";
import { positionMenu } from "../../src/utils/menuPosition.js";

const viewport = { width: 1000, height: 600 };
const size = { width: 200, height: 300 };

// A point anchor, e.g. a right-click position or a button corner.
const point = (x, y) => ({ top: y, bottom: y, left: x, right: x });

describe("positionMenu", () => {
  it("honours the anchor when there is room", () => {
    expect(positionMenu(point(100, 100), size, { viewport })).toEqual({ left: 100, top: 100 });
  });

  it("applies gapY below the anchor", () => {
    expect(positionMenu(point(100, 100), size, { viewport, gapY: 4 })).toEqual({
      left: 100,
      top: 104,
    });
  });

  it("flips horizontally off the right edge (the ··· menu case)", () => {
    // Anchor at the button's right edge near the viewport's right edge:
    // the menu right-aligns to the anchor instead of overflowing.
    const anchor = point(990, 40);
    expect(positionMenu(anchor, size, { viewport })).toEqual({ left: 790, top: 40 });
  });

  it("flips vertically above a rect anchor near the bottom (the slash menu case)", () => {
    const blockRect = { top: 500, bottom: 520, left: 100, right: 400 };
    const pos = positionMenu(blockRect, size, { viewport, gapY: 4 });
    // Above the block: top = 500 - 4 - 300
    expect(pos).toEqual({ left: 100, top: 196 });
  });

  it("clamps when neither side fits", () => {
    const tall = { width: 200, height: 700 };
    const pos = positionMenu(point(100, 500), tall, { viewport });
    expect(pos.top).toBe(8);
    expect(pos.left).toBe(100);
  });

  it("keeps the margin from every edge", () => {
    const pos = positionMenu(point(-50, -50), size, { viewport });
    expect(pos).toEqual({ left: 8, top: 8 });
  });

  it("respects a custom margin", () => {
    const pos = positionMenu(point(995, 595), size, { viewport, margin: 16 });
    expect(pos).toEqual({ left: 1000 - 200 - 16, top: 600 - 300 - 16 });
  });
});
