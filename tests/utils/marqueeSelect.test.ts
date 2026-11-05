/** Which blocks a box drawn from the margin selects: what its height touches. */
import { describe, expect, it } from "vitest";
import { autoScrollStep, marqueeRun } from "../../src/utils/marqueeSelect";

const spans = [
  { id: "a", top: 0, bottom: 30 },
  { id: "b", top: 40, bottom: 400 },
  { id: "c", top: 410, bottom: 440 },
];

describe("marqueeRun", () => {
  it("selects every block the box's height overlaps, anchored where it started", () => {
    expect(marqueeRun(spans, 10, 420)).toEqual({ anchor: "a", head: "c" });
    expect(marqueeRun(spans, 420, 10)).toEqual({ anchor: "c", head: "a" });
  });

  it("touches a tall block by any part of it", () => {
    expect(marqueeRun(spans, 200, 210)).toEqual({ anchor: "b", head: "b" });
  });

  it("selects nothing in a gap between blocks", () => {
    expect(marqueeRun(spans, 32, 38)).toBeNull();
  });
});

describe("autoScrollStep", () => {
  it("scrolls only near the pane's edges, faster the further in", () => {
    expect(autoScrollStep(300, 0, 600)).toBe(0);
    expect(autoScrollStep(10, 0, 600)).toBeLessThan(0);
    expect(autoScrollStep(598, 0, 600)).toBeGreaterThan(autoScrollStep(560, 0, 600));
  });
});
