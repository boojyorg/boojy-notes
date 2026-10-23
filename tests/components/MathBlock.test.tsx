/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

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

import MathBlock from "../../src/components/MathBlock";
import { openMathSource } from "../../src/utils/mathOpen";

afterEach(cleanup);

function mount(text: string) {
  const props = {
    block: { id: "m1", type: "math" as const, text },
    noteId: "n1",
    blockIndex: 2,
    syncGen: 0,
    noteDataRef: { current: { n1: { content: { blocks: [{ id: "m1", type: "math", text }] } } } },
    isSelected: false,
    accentColor: "#8FC1C6",
    onUpdateText: vi.fn(),
    onBlockNav: vi.fn(),
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  };
  render(
    <div data-editor="" tabIndex={-1}>
      <MathBlock {...props} />
    </div>,
  );
  return props;
}
const field = () => screen.getByRole("textbox", { name: "Formula source" }) as HTMLTextAreaElement;

describe("MathBlock", () => {
  it("draws the formula, and invites when empty", () => {
    mount("x^2");
    expect(document.querySelector(".katex")).not.toBeNull();
    cleanup();
    mount("");
    expect(screen.getByText("Add a LaTeX formula")).toBeTruthy();
  });

  it("opens on a click, commits each input, and finishes on Shift+Enter leaving the block selected", () => {
    const p = mount("x");
    fireEvent.click(screen.getByRole("button", { name: "Edit formula" }));
    expect(field().value).toBe("x");
    fireEvent.change(field(), { target: { value: "x+1" } });
    expect(p.onUpdateText).toHaveBeenCalledWith("n1", 2, "x+1");
    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    expect(p.onSelect).toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Formula source" })).toBeNull();
  });

  it("keeps the last drawing and says why while the source can't be drawn", () => {
    mount("x");
    fireEvent.click(screen.getByRole("button", { name: "Edit formula" }));
    fireEvent.change(field(), { target: { value: "\\frac{" } });
    expect(screen.getByRole("status").textContent).toMatch(/last version that worked/);
  });

  it("walks out on the arrows at its edges, deletes when emptied, and opens when asked", () => {
    const p = mount("a");
    act(() => openMathSource("m1"));
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(p.onBlockNav).toHaveBeenCalledWith(2, "next");
    act(() => openMathSource("m1"));
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.keyDown(field(), { key: "Backspace" });
    expect(p.onDelete).toHaveBeenCalledWith(2);
  });
});

describe("the \\ menu in a formula's source", () => {
  /** Type into the source as the browser would: the value, the caret, the input. */
  const typeInto = (text: string) => {
    const ta = field();
    const value = ta.value.slice(0, ta.selectionStart) + text + ta.value.slice(ta.selectionEnd);
    const caret = ta.selectionStart + text.length;
    fireEvent.change(ta, { target: { value } });
    ta.setSelectionRange(caret, caret);
    fireEvent.select(ta);
  };
  const menu = () => screen.queryByRole("listbox", { name: "LaTeX commands" });

  it("offers commands for \\fr and inserts \\frac{}{} as its own undo step, caret in the numerator", () => {
    const p = mount("x = ");
    fireEvent.click(screen.getByRole("button", { name: "Edit formula" }));
    closeTypingGroup.mockClear();
    typeInto("\\fr");
    expect(screen.getAllByRole("option")[0].textContent).toContain("\\frac");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("x = \\frac{}{}");
    expect(field().selectionStart).toBe("x = \\frac{".length);
    expect(p.onUpdateText).toHaveBeenLastCalledWith("n1", 2, "x = \\frac{}{}");
    expect(closeTypingGroup).toHaveBeenCalledTimes(2);
    expect(menu()).toBeNull();
  });

  it("finds a command by a plain word, and Tab chooses too", () => {
    mount("");
    fireEvent.click(screen.getByRole("button", { name: "Edit formula" }));
    typeInto("\\less");
    fireEvent.keyDown(field(), { key: "Tab" });
    expect(field().value).toBe("\\le");
    expect(menu()).toBeNull();
  });

  it("Escape closes the menu, not the source; Shift+Enter still finishes", () => {
    const p = mount("");
    fireEvent.click(screen.getByRole("button", { name: "Edit formula" }));
    typeInto("\\al");
    expect(menu()).not.toBeNull();
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(menu()).toBeNull();
    expect(field().value).toBe("\\al");
    typeInto("p");
    expect(menu()).toBeNull();
    fireEvent.keyDown(field(), { key: "Enter", shiftKey: true });
    expect(p.onSelect).toHaveBeenCalled();
  });

  it("offers nothing after \\\\ or with the caret mid-word", () => {
    mount("");
    fireEvent.click(screen.getByRole("button", { name: "Edit formula" }));
    typeInto("a \\\\");
    expect(menu()).toBeNull();
    typeInto("\\frac");
    field().setSelectionRange(4, 4);
    fireEvent.select(field());
    expect(menu()).toBeNull();
  });
});
