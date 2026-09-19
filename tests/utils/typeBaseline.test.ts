import { describe, expect, it } from "vitest";
import { baselineFromTop, baselineInRow } from "../../src/utils/typeBaseline";

/**
 * The model against Chromium's own layout, probed live on 2026-09-19 with a
 * zero-width inline-block on the baseline. Chromium snaps a baseline to the
 * half pixel, which is the whole of the disagreement; a quarter of a pixel is
 * the tolerance the alignment is judged at.
 */
const MEASURED: [size: number, lineHeight: number, baseline: number][] = [
  [15, 1.7, 18.5], // body
  [28, 1.3, 28.5], // H1
  [22, 1.35, 23], // H2
  [20, 1.35, 21], // H3
  [18, 1.35, 18.5], // H4
  [16.5, 1.35, 17], // H5
  [15, 1.4, 16], // H6
  [14, 1.2, 13.5], // a row label
];

describe("baselineFromTop", () => {
  it.each(MEASURED)("matches Chromium for %ipx / %f", (size, lineHeight, measured) => {
    expect(baselineFromTop(size, lineHeight)).toBeCloseTo(measured, 0);
    expect(Math.abs(baselineFromTop(size, lineHeight) - measured)).toBeLessThan(0.3);
  });

  it("grows with both the size and the line height, since a baseline is leading plus ascent", () => {
    expect(baselineFromTop(28, 1.3)).toBeGreaterThan(baselineFromTop(15, 1.3));
    expect(baselineFromTop(15, 1.7)).toBeGreaterThan(baselineFromTop(15, 1.3));
  });

  // What the note's first line is actually set by: the difference between two
  // of these. An H1 opening a note reaches up by this much.
  it("puts an H1's first baseline 10px below a paragraph's", () => {
    expect(baselineFromTop(28, 1.3) - baselineFromTop(15, 1.7)).toBeCloseTo(10.2, 1);
  });
});

describe("baselineInRow", () => {
  // The New note row: a 14px label centred in 32px. Measured: 21.25.
  it("places a label's baseline inside the row it is centred in", () => {
    expect(baselineInRow(32, 14, 1.2)).toBeCloseTo(21.25, 0);
  });

  it("is the line's own baseline once the row is no taller than the line", () => {
    expect(baselineInRow(14 * 1.2, 14, 1.2)).toBeCloseTo(baselineFromTop(14, 1.2), 5);
  });
});
