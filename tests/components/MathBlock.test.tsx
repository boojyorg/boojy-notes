/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

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
