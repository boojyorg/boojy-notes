import { describe, expect, it } from "vitest";
import { barModeAfterSelection, kindCommand } from "../../src/phone/keyBar";

describe("the bar above the keyboard follows the selection", () => {
  it("shows the text styles while text is selected, from any row", () => {
    expect(barModeAfterSelection("blocks", true, false)).toBe("format");
    expect(barModeAfterSelection("heading", true, false)).toBe("format");
  });

  it("goes back to the block buttons when a selection collapses", () => {
    expect(barModeAfterSelection("format", false, false)).toBe("blocks");
  });

  it("keeps the text styles Aa opened, so bold can be turned on before typing", () => {
    expect(barModeAfterSelection("format", false, true)).toBe("format");
  });

  it("leaves the heading row to its own choices while the caret moves", () => {
    expect(barModeAfterSelection("heading", false, false)).toBe("heading");
  });
});

describe("a list or task button", () => {
  it("makes the line that kind", () => {
    expect(kindCommand("bullet", "p")).toBe("bullet");
    expect(kindCommand("numbered", "h2")).toBe("numbered");
    expect(kindCommand("checkbox", "p")).toBe("todo");
  });

  it("turns a line already of that kind back into text", () => {
    expect(kindCommand("bullet", "bullet")).toBe("body");
    expect(kindCommand("checkbox", "checkbox")).toBe("body");
  });
});
