import { describe, expect, it } from "vitest";
import { drawDiagram, shortError } from "../../src/utils/mermaid";

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
