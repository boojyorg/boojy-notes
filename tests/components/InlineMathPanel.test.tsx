/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

const closeTypingGroup = vi.fn();
vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteDataActions: () => ({ closeTypingGroup }),
}));
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      name: "day",
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#B3261E" },
      button: { bg: "transparent", border: "#DCDCDC" },
      modalShadow: "none",
    },
  }),
}));
// Drawing is KaTeX's; here only that it is asked for.
vi.mock("../../src/utils/inlineMath", () => ({
  drawAtom: vi.fn(),
  katexNow: () => null,
  loadKatex: () => new Promise(() => {}),
}));

import InlineMathPanel from "../../src/components/InlineMathPanel";
import { inlineMarkdownToHtml, domNodeToMarkdown } from "../../src/utils/inlineFormatting";
import { getCaretOffset } from "../../src/utils/domHelpers";

let block: HTMLElement;
let editor: HTMLElement;

beforeEach(() => {
  editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  editor.setAttribute("data-editor", "");
  block = document.createElement("p");
  block.setAttribute("data-block-id", "b1");
  block.innerHTML = inlineMarkdownToHtml("ab $x$ cd");
  editor.appendChild(block);
  document.body.appendChild(editor);
});

afterEach(() => {
  cleanup();
  editor.remove();
});

function open() {
  const reRead = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <InlineMathPanel
      target={{ blockId: "b1", index: 0 }}
      blockRefs={{ current: { b1: block } }}
      syncGen={0}
      reRead={reRead}
      onClose={onClose}
    />,
  );
  const field = view.getByRole("textbox", { name: "Formula source" }) as HTMLTextAreaElement;
  return { reRead, onClose, field, view };
}

describe("InlineMathPanel", () => {
  it("opens on the formula's source, focused at its end, and marks it", () => {
    const { field } = open();
    expect(field.value).toBe("x");
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(1);
    expect(block.querySelector(".inline-math")?.hasAttribute("data-editing")).toBe(true);
  });

  it("writes each input to the formula and reads the block back", () => {
    const { field, reRead } = open();
    field.value = "x^2";
    fireEvent.input(field);
    expect(block.querySelector(".inline-math")?.getAttribute("data-math")).toBe("x^2");
    expect(domNodeToMarkdown(block)).toBe("ab $x^2$ cd");
    expect(reRead).toHaveBeenCalled();
  });

  it("does nothing on Enter; Shift+Enter finishes with the caret after the formula", () => {
    const { field, onClose } = open();
    const enter = fireEvent.keyDown(field, { key: "Enter" });
    expect(enter).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onClose).toHaveBeenCalled();
    expect(getCaretOffset(block)).toBe(4);
  });

  it("steps out before the formula on ← at its start, after it on → at its end", () => {
    const first = open();
    first.field.selectionStart = first.field.selectionEnd = 0;
    fireEvent.keyDown(first.field, { key: "ArrowLeft" });
    expect(getCaretOffset(block)).toBe(3);
    first.view.unmount();
    const second = open();
    fireEvent.keyDown(second.field, { key: "ArrowRight" });
    expect(getCaretOffset(block)).toBe(4);
  });

  it("leaves Cmd+Z to the note and keeps every other key", () => {
    const { field } = open();
    const seen: string[] = [];
    const listener = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener("keydown", listener);
    fireEvent.keyDown(field, { key: "z", metaKey: true });
    fireEvent.keyDown(field, { key: "b", metaKey: true });
    window.removeEventListener("keydown", listener);
    expect(seen).toEqual(["z"]);
  });

  it("an emptied formula goes when it finishes", () => {
    const { field, reRead } = open();
    field.value = "";
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(block.querySelector(".inline-math")).toBeNull();
    expect(domNodeToMarkdown(block)).toBe("ab  cd");
    expect(reRead).toHaveBeenCalledTimes(2);
  });

  it("closes when the formula is gone after a repaint", () => {
    const { view, onClose } = open();
    block.innerHTML = "ab cd";
    view.rerender(
      <InlineMathPanel
        target={{ blockId: "b1", index: 0 }}
        blockRefs={{ current: { b1: block } }}
        syncGen={1}
        reRead={vi.fn()}
        onClose={onClose}
      />,
    );
    expect(onClose).toHaveBeenCalled();
  });
});

describe("InlineMathPanel in a field of its own", () => {
  it("commits through the field's input, never by reading the block back", () => {
    block.innerHTML = "";
    const cell = document.createElement("div");
    cell.setAttribute("contenteditable", "true");
    cell.setAttribute("data-inline-field", "cell");
    cell.innerHTML = inlineMarkdownToHtml("$x$");
    block.appendChild(cell);
    const inputs = vi.fn();
    cell.addEventListener("input", inputs);
    const { field, reRead } = open();
    field.value = "x^2";
    fireEvent.input(field);
    expect(inputs).toHaveBeenCalledTimes(1);
    expect(reRead).not.toHaveBeenCalled();
    expect(domNodeToMarkdown(cell)).toBe("$x^2$");
  });
});

describe("the \\ menu in an inline formula's source", () => {
  it("inserts a command through the formula and closes the menu", () => {
    const { field, reRead } = open();
    field.value = "x\\alp";
    field.setSelectionRange(5, 5);
    fireEvent.input(field);
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field.value).toBe("x\\alpha");
    expect(block.querySelector(".inline-math")?.getAttribute("data-math")).toBe("x\\alpha");
    expect(reRead).toHaveBeenCalled();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
