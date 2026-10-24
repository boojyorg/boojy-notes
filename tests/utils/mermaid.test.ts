import { describe, expect, it } from "vitest";
import { drawDiagram, shortError, shrinkMarkers } from "../../src/utils/mermaid";

describe("shortError", () => {
  it("keeps a parse error's first and last lines, cut to one line", () => {
    const err = new Error("Parse error on line 3:\n...A -->\n------^\nExpecting 'NODE', got 'EOF'");
    expect(shortError(err)).toBe("Parse error on line 3: Expecting 'NODE', got 'EOF'");
    expect(shortError("x".repeat(300)).length).toBe(168);
    expect(shortError("")).toBe("This diagram can't be read");
  });
});

describe("drawDiagram", () => {
  it("answers an empty source without loading Mermaid", async () => {
    const colours = { dark: false, ground: "", box: "", border: "", line: "", ink: "" };
    expect(await drawDiagram("  \n", colours)).toEqual({ empty: true });
  });
});

describe("shrinkMarkers", () => {
  it("shrinks an arrowhead with a viewBox to 70%", () => {
    expect(shrinkMarkers('<marker viewBox="0 0 10 10" markerWidth="8" markerHeight="8">')).toBe(
      '<marker viewBox="0 0 10 10" markerWidth="5.6" markerHeight="5.6">',
    );
  });

  it("gives one without a viewBox its own size as one, so it scales rather than being cut off", () => {
    expect(shrinkMarkers('<marker id="a" refX="19" markerWidth="20" markerHeight="14">')).toBe(
      '<marker viewBox="0 0 20 14" id="a" refX="19" markerWidth="14.0" markerHeight="9.8">',
    );
  });
});
