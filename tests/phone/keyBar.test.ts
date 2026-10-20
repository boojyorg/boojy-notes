import { describe, expect, it } from "vitest";
import {
  barModeAfterSelection,
  barReach,
  SELECT_FIRST,
  styleBlocked,
  headingCommand,
  isListKind,
  keyboardUp,
  kindCommand,
  litFormats,
  promise,
  shownRow,
} from "../../src/phone/keyBar";

describe("the bar above the keyboard follows the selection", () => {
  it("shows the text styles while text is selected, from any row", () => {
    expect(barModeAfterSelection("blocks", true, false, false)).toBe("format");
    expect(barModeAfterSelection("heading", true, false, false)).toBe("format");
    expect(barModeAfterSelection("list", true, false, true)).toBe("format");
  });

  it("goes back to the block buttons when a selection collapses", () => {
    expect(barModeAfterSelection("format", false, false, false)).toBe("blocks");
  });

  it("keeps the text styles Aa opened, so bold can be turned on before typing", () => {
    expect(barModeAfterSelection("format", false, true, false)).toBe("format");
  });

  it("leaves the heading row to its own choices while the caret moves", () => {
    expect(barModeAfterSelection("heading", false, false, false)).toBe("heading");
  });

  it("keeps the list row opened by hand until the caret is in a list, then hands it to the list", () => {
    expect(barModeAfterSelection("list", false, false, false)).toBe("list");
    expect(barModeAfterSelection("list", false, false, true)).toBe("blocks");
  });
});

describe("the row on screen", () => {
  it("is the list's while the caret is in a list item", () => {
    expect(shownRow("blocks", true, false)).toBe("list");
    expect(shownRow("blocks", false, false)).toBe("blocks");
  });

  it("is the block buttons in a list whose row was put away", () => {
    expect(shownRow("blocks", true, true)).toBe("blocks");
  });

  it("is a row opened by hand, in a list or not", () => {
    expect(shownRow("heading", true, false)).toBe("heading");
    expect(shownRow("format", true, false)).toBe("format");
    expect(shownRow("list", false, false)).toBe("list");
  });
});

describe("a list item", () => {
  it("is a bullet, a numbered item or a task", () => {
    expect(["bullet", "numbered", "checkbox"].every(isListKind)).toBe(true);
    expect(["p", "h2", "blockquote", null].some(isListKind)).toBe(false);
  });
});

describe("a list, task or quote button", () => {
  it("makes the line that kind", () => {
    expect(kindCommand("bullet", "p")).toBe("bullet");
    expect(kindCommand("numbered", "h2")).toBe("numbered");
    expect(kindCommand("checkbox", "p")).toBe("todo");
    expect(kindCommand("blockquote", "p")).toBe("quote");
  });

  it("turns a line already of that kind back into text", () => {
    expect(kindCommand("bullet", "bullet")).toBe("body");
    expect(kindCommand("checkbox", "checkbox")).toBe("body");
    expect(kindCommand("blockquote", "blockquote")).toBe("body");
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

describe("in a block with its own field, what cannot act there greys", () => {
  it("acts everywhere in a text block", () => {
    expect(barReach("p", false)).toEqual({ kinds: true, styles: true, link: true });
    expect(barReach("bullet", false)).toEqual({ kinds: true, styles: true, link: true });
  });

  it("keeps a table cell's or callout body's text styles, but not its kind or a link", () => {
    expect(barReach("table", true)).toEqual({ kinds: false, styles: true, link: false });
    expect(barReach("callout", true)).toEqual({ kinds: false, styles: true, link: false });
  });

  it("acts on nothing but inserts and undo in code or a callout's title", () => {
    expect(barReach("code", false)).toEqual({ kinds: false, styles: false, link: false });
    expect(barReach("callout", false)).toEqual({ kinds: false, styles: false, link: false });
  });
});

describe("a text style with nothing selected", () => {
  const at = (kind: string, inField: boolean, collapsed = true) => ({
    kind,
    inField,
    collapsed,
    reach: barReach(kind, inField),
  });

  it("promises bold and italic to the next letters in text; the rest wait for a selection", () => {
    expect(styleBlocked("bold", at("p", false))).toBeNull();
    expect(styleBlocked("italic", at("p", false))).toBeNull();
    for (const f of ["strikethrough", "highlight", "code"]) {
      expect(styleBlocked(f, at("p", false))).toBe(SELECT_FIRST);
      expect(styleBlocked(f, at("p", false, false))).toBeNull();
    }
  });

  it("promises nothing in a field, which formats only what it holds", () => {
    expect(styleBlocked("bold", at("table", true))).toBe(SELECT_FIRST);
    expect(styleBlocked("bold", at("table", true, false))).toBeNull();
  });

  it("says the field first where styles cannot act at all", () => {
    expect(styleBlocked("bold", at("code", false, false))).toBe("Not in a code block");
    expect(styleBlocked("link", at("table", true, false))).toBe("Not in a table");
    expect(styleBlocked("link", at("p", false))).toBeNull();
  });
});
