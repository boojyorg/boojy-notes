import { describe, expect, it } from "vitest";
import {
  barModeAfterSelection,
  headingCommand,
  keyboardUp,
  kindCommand,
  litFormats,
  promise,
} from "../../src/phone/keyBar";

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

describe("a heading level", () => {
  it("makes the line that level", () => {
    expect(headingCommand(2, "p")).toBe("h2");
    expect(headingCommand(5, "h1")).toBe("h5");
  });

  it("turns a line already at that level back into text", () => {
    expect(headingCommand(3, "h3")).toBe("body");
  });
});

describe("bold turned on with nothing selected", () => {
  const text = document.createTextNode("Hello");
  const here = { node: text, offset: 5, collapsed: true };

  it("is lit while the caret stays where it was turned on", () => {
    const pending = promise(null, here, "bold", true);
    expect(litFormats(new Set(), pending, here).formats.has("bold")).toBe(true);
  });

  it("goes out once the caret moves, as the browser's promise does", () => {
    const pending = promise(null, here, "bold", true);
    const moved = litFormats(new Set(), pending, { ...here, offset: 2 });
    expect(moved.formats.has("bold")).toBe(false);
    expect(moved.pending).toBeNull();
  });

  it("turned off inside bold text, is unlit until the caret moves", () => {
    const pending = promise(null, here, "bold", false);
    expect(litFormats(new Set(["bold"]), pending, here).formats.has("bold")).toBe(false);
    expect(litFormats(new Set(["bold"]), pending, { ...here, offset: 1 }).formats.has("bold")).toBe(
      true,
    );
  });

  it("keeps bold and italic both promised at one spot", () => {
    const both = promise(promise(null, here, "bold", true), here, "italic", true);
    expect([...litFormats(new Set(), both, here).formats].sort()).toEqual(["bold", "italic"]);
  });
});

describe("the keyboard is up", () => {
  it("when the window is well below its tallest at this width", () => {
    const tallest = new Map<number, number>();
    expect(keyboardUp(tallest, 412, 845)).toBe(false);
    expect(keyboardUp(tallest, 412, 532)).toBe(true);
    expect(keyboardUp(tallest, 412, 845)).toBe(false);
  });

  it("never because the phone was turned on its side", () => {
    // Landscape is far shorter than portrait: with one tallest for both,
    // the bar showed with no keyboard and stayed after it closed.
    const tallest = new Map<number, number>();
    keyboardUp(tallest, 412, 845);
    expect(keyboardUp(tallest, 845, 412)).toBe(false);
    expect(keyboardUp(tallest, 845, 200)).toBe(true);
    expect(keyboardUp(tallest, 412, 845)).toBe(false);
  });
});
