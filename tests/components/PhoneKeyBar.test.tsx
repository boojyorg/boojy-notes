/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { secondary: "#47403A" },
      BG: { standard: "#F9F9F9", divider: "#E9E9E9" },
      ACCENT: { text: "#2A737D" },
    },
  }),
}));
const sent = vi.hoisted(() => [] as string[]);
vi.mock("../../src/phone/commands", () => ({ sendCommand: (id: string) => sent.push(id) }));

import PhoneKeyBar from "../../src/components/PhoneKeyBar";
import { TYPING_STYLE_MOVED } from "../../src/utils/inlineFormatCommands";

let editor: HTMLDivElement;
const size = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
};
/** The caret in the note's text: at `offset` in its first line, or over `[from, to)`. */
const caret = (from: number, to = from, line = 0) => {
  const text = editor.children[line].firstChild as Text;
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  act(() => {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
};
const props = { onInsert: vi.fn(), canIndent: vi.fn((_: 1 | -1) => true) };
const mount = () => render(<PhoneKeyBar editorRef={{ current: editor }} {...props} />);
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const lit = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const bar = () => screen.queryByRole("toolbar");
const row = () => screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
const MAIN = ["Undo", "Redo", "Heading", "Lists", "Text style", "More blocks"];
const MORE = ["Undo", "Redo", "Table", "Quote", "Code block", "Divider", "Close"];
const LIST = [
  "Undo",
  "Redo",
  "Bulleted list",
  "Numbered list",
  "Task",
  "Outdent",
  "Indent",
  "Close",
];

beforeEach(() => {
  sent.length = 0;
  props.onInsert.mockClear();
  props.canIndent.mockReset();
  props.canIndent.mockReturnValue(true);
  editor = document.createElement("div");
  editor.innerHTML =
    '<p data-block-type="p">Hello world</p><h2 data-block-type="h2">Title</h2><p data-block-type="bullet"><b>Bold</b></p><p data-block-type="bullet">Item</p>';
  document.body.append(editor);
  size(412, 845);
});
afterEach(() => {
  cleanup();
  editor.remove();
});

describe("the bar above the keyboard", () => {
  it("shows only while the keyboard is up with the caret in the note", () => {
    mount();
    caret(2);
    expect(bar()).toBeNull();
    size(412, 532);
    expect(bar()).not.toBeNull();
    size(412, 845);
    expect(bar()).toBeNull();
  });

  it("never shows for a phone turned on its side", () => {
    mount();
    caret(2);
    size(845, 412);
    expect(bar()).toBeNull();
  });

  it("shows the block buttons in text, the slash menu last", () => {
    mount();
    size(412, 532);
    caret(2);
    expect(row()).toEqual(MAIN);
  });

  it("gives every button in every row the same slot, so none moves between rows", () => {
    mount();
    size(412, 532);
    caret(2);
    const slots = new Set<string>();
    const read = () => {
      for (const b of screen.getAllByRole("button")) slots.add(b.style.flex);
    };
    read();
    press("Heading");
    read();
    press("Close");
    press("Text style");
    read();
    press("Close");
    press("More blocks");
    read();
    press("Close");
    caret(1, 1, 3);
    read();
    expect(slots.size).toBe(1);
    expect([...slots][0]).toMatch(/^0 0 /);
  });

  it("sends each list button's command, a lit one turning the line back to text", () => {
    mount();
    size(412, 532);
    caret(2);
    press("Lists");
    expect(row()).toEqual(LIST);
    press("Task");
    press("Undo");
    press("Redo");
    expect(sent).toEqual(["todo", "undo", "redo"]);
    caret(1, 1, 2);
    expect(lit("Bulleted list")).toBe("true");
    press("Bulleted list");
    expect(sent.at(-1)).toBe("body");
  });

  it("shows the list row by itself in a list item, with indent and outdent", () => {
    mount();
    size(412, 532);
    caret(1, 1, 3);
    expect(row()).toEqual(LIST);
    press("Indent");
    press("Outdent");
    expect(sent).toEqual(["indent", "outdent"]);
  });

  it("greys indent and outdent where Tab would move nothing, and a press sends nothing", () => {
    props.canIndent.mockImplementation((delta) => delta === 1);
    mount();
    size(412, 532);
    caret(1, 1, 3);
    const outdent = screen.getByRole("button", { name: "Outdent" });
    expect(outdent).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Indent" })).not.toHaveAttribute("aria-disabled");
    fireEvent.click(outdent);
    expect(sent).toEqual([]);
  });

  it("keeps the list row put away after its ✕ until the caret leaves the list", () => {
    mount();
    size(412, 532);
    caret(1, 1, 3);
    press("Close");
    expect(row()).toEqual(MAIN);
    expect(lit("Lists")).toBe("true");
    caret(2, 2, 3);
    expect(row()).toEqual(MAIN);
    // A selection in the list, let go, is not leaving it.
    caret(0, 3, 3);
    caret(3, 3, 3);
    expect(row()).toEqual(MAIN);
    caret(2);
    caret(1, 1, 3);
    expect(row()).toEqual(LIST);
  });

  it("hands the list row opened by hand to the list it makes", () => {
    mount();
    size(412, 532);
    caret(2);
    press("Lists");
    caret(4);
    expect(row()).toEqual(LIST);
    press("Bulleted list");
    expect(sent).toEqual(["bullet"]);
    editor.children[0].setAttribute("data-block-type", "bullet");
    caret(4);
    expect(row()).toEqual(LIST);
    // Into text: the main row, as for any list.
    caret(2, 2, 1);
    expect(row()).toEqual(MAIN);
  });

  it("opens the blocks the other rows lack, each choice closing the row", () => {
    mount();
    size(412, 532);
    caret(2);
    press("More blocks");
    expect(row()).toEqual(MORE);
    press("Code block");
    expect(props.onInsert).toHaveBeenLastCalledWith("code");
    expect(row()).toEqual(MAIN);
    press("More blocks");
    press("Table");
    press("More blocks");
    press("Divider");
    expect(props.onInsert.mock.calls.map(([c]) => c)).toEqual(["code", "table", "divider"]);
  });

  it("turns the line into a quote, a quote's own button making it text again", () => {
    editor.children[0].setAttribute("data-block-type", "blockquote");
    mount();
    size(412, 532);
    caret(2, 2, 1);
    press("More blocks");
    expect(lit("Quote")).toBeNull();
    press("Quote");
    expect(sent).toEqual(["quote"]);
    expect(row()).toEqual(MAIN);
    caret(2);
    press("More blocks");
    expect(lit("Quote")).toBe("true");
    press("Quote");
    expect(sent.at(-1)).toBe("body");
  });

  it("opens the text styles on Aa and closes them on ✕, undo staying first", () => {
    mount();
    size(412, 532);
    caret(2);
    press("Text style");
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([
      "Undo",
      "Redo",
      "Bold",
      "Italic",
      "Strikethrough",
      "Highlight",
      "Inline code",
      "Link",
      "Close",
    ]);
    press("Italic");
    expect(sent).toEqual(["italic"]);
    press("Close");
    expect(screen.getByRole("button", { name: "Text style" })).toBeInTheDocument();
  });

  it("opens the text styles for a selection and gives way when it collapses", () => {
    mount();
    size(412, 532);
    caret(0, 5);
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
    caret(2);
    expect(row()).toEqual(MAIN);
  });

  it("lights the style the caret sits in", () => {
    mount();
    size(412, 532);
    caret(1, 1, 2);
    // A list item's row stands over Aa: its ✕ first.
    press("Close");
    press("Text style");
    expect(lit("Bold")).toBe("true");
    expect(lit("Italic")).toBeNull();
  });

  it("keeps a promised bold lit where the editor moves it, and drops it on a tap", async () => {
    mount();
    size(412, 532);
    caret(5);
    press("Text style");
    press("Bold");
    await act(() => new Promise((r) => requestAnimationFrame(r)));
    expect(lit("Bold")).toBe("true");
    // A space typed first goes before the bold, and the caret with it.
    act(() => {
      window.getSelection()?.collapse(editor.children[0].firstChild, 6);
      document.dispatchEvent(new Event(TYPING_STYLE_MOVED));
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(lit("Bold")).toBe("true");
    caret(2);
    expect(lit("Bold")).toBeNull();
  });

  it("picks a heading level, the line's own level making it text again", () => {
    mount();
    size(412, 532);
    caret(1, 1, 1);
    press("Heading");
    expect(row()).toEqual([
      "Undo",
      "Redo",
      ...[1, 2, 3, 4, 5, 6].map((n) => `Heading ${n}`),
      "Close",
    ]);
    expect(lit("Heading 2")).toBe("true");
    press("Heading 2");
    expect(sent).toEqual(["body"]);
    press("Heading");
    press("Heading 6");
    expect(sent.at(-1)).toBe("h6");
    expect(row()).toEqual(MAIN);
  });

  it("shows without the keyboard when told to (the web build's ?keybar)", () => {
    render(<PhoneKeyBar editorRef={{ current: editor }} {...props} always />);
    caret(2);
    expect(bar()).not.toBeNull();
  });
});
