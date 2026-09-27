import { describe, expect, it } from "vitest";
import { COL_MAX, DEFAULT_COLUMN_FIT, columnGeometry } from "../../src/tokens/columnFit";

const fit = (over = {}) => ({ ...DEFAULT_COLUMN_FIT, ...over });

describe("columnGeometry", () => {
  it("fixed: one width, centred; no margin once the pane is narrower", () => {
    expect(columnGeometry(fit(), 1500)).toEqual({ maxWidth: COL_MAX, zoom: 1, marginLeft: 390 });
    expect(columnGeometry(fit(), 600).marginLeft).toBe(0);
  });

  it("scale: grows only past the start of the range, to 1.12, still centred", () => {
    expect(columnGeometry(fit({ fit: "scale" }), 900).zoom).toBe(1);
    const full = columnGeometry(fit({ fit: "scale" }), 1800);
    expect(full.zoom).toBeCloseTo(1.12);
    // Margin is in the column's zoomed pixels: outer margin ÷ zoom.
    expect(full.marginLeft * full.zoom).toBeCloseTo((1800 - COL_MAX * 1.12) / 2);
  });

  it("wider: the column alone grows, to its cap", () => {
    expect(columnGeometry(fit({ fit: "wider" }), 1200).maxWidth).toBeCloseTo(770);
    expect(columnGeometry(fit({ fit: "wider", wideCap: 950 }), 2000)).toMatchObject({
      maxWidth: 950,
      zoom: 1,
    });
  });

  it("left share: a third of the spare room goes left", () => {
    expect(columnGeometry(fit({ leftShare: 1 / 3 }), 1620).marginLeft).toBeCloseTo(300);
  });
});
