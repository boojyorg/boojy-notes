import { describe, expect, it } from "vitest";
import { COL_MAX, columnGeometry } from "../../src/tokens/columnFit";

describe("columnGeometry", () => {
  it("fixed: one width, centred; no margin once the pane is narrower", () => {
    expect(columnGeometry("fixed", 1500)).toEqual({ maxWidth: COL_MAX, zoom: 1, marginLeft: 390 });
    expect(columnGeometry("fixed", 600).marginLeft).toBe(0);
  });

  it("scale: grows only past the start of the range, to 1.12, still centred", () => {
    expect(columnGeometry("scale", 900).zoom).toBe(1);
    const full = columnGeometry("scale", 1800);
    expect(full.zoom).toBeCloseTo(1.12);
    // Margin is in the column's zoomed pixels: outer margin ÷ zoom.
    expect(full.marginLeft * full.zoom).toBeCloseTo((1800 - COL_MAX * 1.12) / 2);
  });

  it("wider: the column alone grows, to 820", () => {
    expect(columnGeometry("wider", 1200).maxWidth).toBeCloseTo(770);
    expect(columnGeometry("wider", 2000)).toMatchObject({ maxWidth: 820, zoom: 1 });
  });
});
