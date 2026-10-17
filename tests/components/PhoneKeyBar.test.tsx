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
const props = { onTable: vi.fn(), onSlash: vi.fn() };
const mount = () => render(<PhoneKeyBar editorRef={{ current: editor }} {...props} />);
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const lit = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const bar = () => screen.queryByRole("toolbar");

beforeEach(() => {
  sent.length = 0;
  props.onTable.mockClear();
  props.onSlash.mockClear();
  editor = document.createElement("div");
  editor.innerHTML =
    '<p data-block-type="p">Hello world</p><h2 data-block-type="h2">Title</h2><p data-block-type="bullet"><b>Bold</b></p>';
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

  it("sends each block button's command, a lit one turning the line back to text", () => {
    mount();
    size(412, 532);
    caret(2);
    press("Bulleted list");
    press("Task");
    press("Undo");
    press("Redo");
    expect(sent).toEqual(["bullet", "todo", "undo", "redo"]);
    caret(1, 1, 2);
    expect(lit("Bulleted list")).toBe("true");
    press("Bulleted list");
    expect(sent.at(-1)).toBe("body");
  });

  it("hands table and / to the editor", () => {
    mount();
    size(412, 532);
    caret(2);
    press("Table");
    press("More blocks");
    expect(props.onTable).toHaveBeenCalled();
    expect(props.onSlash).toHaveBeenCalled();
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
    expect(screen.getByRole("button", { name: "Table" })).toBeInTheDocument();
  });

  it("lights the style the caret sits in", () => {
    mount();
    size(412, 532);
    caret(1, 1, 2);
    press("Text style");
    expect(lit("Bold")).toBe("true");
    expect(lit("Italic")).toBeNull();
  });

  it("picks a heading level, the line's own level making it text again", () => {
    mount();
    size(412, 532);
    caret(1, 1, 1);
    press("Heading");
    expect(lit("Heading 2")).toBe("true");
    press("Heading 2");
    expect(sent).toEqual(["body"]);
    press("Heading");
    press("Heading 4");
    expect(sent.at(-1)).toBe("h4");
  });
});
