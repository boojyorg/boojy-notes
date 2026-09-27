/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#B3261E" },
      modalShadow: "none",
    },
    isDark: false,
  }),
}));

import BlockMenu, { kindLabel, TURN_INTO } from "../../src/components/BlockMenu";

const anchor = { top: 100, bottom: 124, left: 300, right: 320 };

function mount(types = ["p"]) {
  const props = {
    onTurnInto: vi.fn(),
    onDuplicate: vi.fn(),
    onCopy: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };
  render(<BlockMenu anchor={anchor} types={types} {...props} />);
  const menu = document.body.querySelector('[aria-label="Block options"]') as HTMLElement;
  return { menu, ...props };
}

const key = (k: string, extra: Partial<KeyboardEventInit> = {}) =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));
  });
const kinds = () => document.body.querySelector('[aria-label="Turn into"]') as HTMLElement | null;

afterEach(cleanup);

describe("BlockMenu", () => {
  it("names what is selected, then Turn into, Duplicate, Copy and Delete", () => {
    const { menu } = mount(["bullet"]);
    expect(menu.textContent).toContain("Bullet list");
    const rows = [...menu.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent);
    expect(rows[0]).toBe("Turn into");
    expect(rows.slice(1).map((r) => r?.replace(/[⌘⌫].*$/, "").replace(/Ctrl.*$/, ""))).toEqual([
      "Duplicate",
      "Copy",
      "Delete",
    ]);
  });

  it("says how many blocks a run holds, and offers no Turn into for a table", () => {
    const { menu } = mount(["table", "spacer"]);
    expect(menu.textContent).toContain("2 blocks");
    expect(menu.textContent).not.toContain("Turn into");
  });

  it("the arrows reach Turn into; → opens the kinds on the current one and Enter turns it", () => {
    const { onTurnInto } = mount(["h2"]);
    key("ArrowDown");
    key("ArrowRight");
    const panel = kinds();
    expect(panel).not.toBeNull();
    const current = panel?.querySelector('[aria-checked="true"]');
    expect(current?.textContent).toBe("Heading 2");
    key("ArrowDown");
    key("Enter");
    expect(onTurnInto).toHaveBeenCalledWith("h3");
  });

  it("← and Escape step back out of the kinds; Escape again closes", () => {
    const { onClose } = mount();
    key("ArrowDown");
    key("ArrowRight");
    key("ArrowLeft");
    expect(kinds()).toBeNull();
    key("ArrowRight");
    key("Escape");
    expect(kinds()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    key("Escape");
    expect(onClose).toHaveBeenCalled();
  });

  it("hovering Turn into opens the kinds, a click on one turns; another row closes them", () => {
    const { menu, onTurnInto } = mount();
    const [turn, duplicate] = [...menu.querySelectorAll('[role="menuitem"]')];
    fireEvent.mouseMove(turn);
    expect(kinds()).not.toBeNull();
    fireEvent.mouseMove(duplicate);
    expect(kinds()).toBeNull();
    fireEvent.mouseMove(turn);
    const quote = [...(kinds()?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Quote",
    );
    fireEvent.click(quote as HTMLElement);
    expect(onTurnInto).toHaveBeenCalledWith("blockquote");
  });

  it("the keys it shows work while it is open", () => {
    const { onDuplicate, onCopy, onDelete } = mount();
    key("d", { code: "KeyD", metaKey: true });
    key("c", { code: "KeyC", metaKey: true });
    key("Backspace");
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("a row's click runs it; a press on the backdrop closes", () => {
    const { menu, onCopy, onClose } = mount();
    const copy = [...menu.querySelectorAll('[role="menuitem"]')].find((b) =>
      b.textContent?.startsWith("Copy"),
    );
    fireEvent.click(copy as HTMLElement);
    expect(onCopy).toHaveBeenCalled();
    const backdrop = menu.previousElementSibling as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("kindLabel / TURN_INTO", () => {
  it("names a kind as the / menu does, a paragraph Text", () => {
    expect(kindLabel("p")).toBe("Text");
    expect(kindLabel("checkbox")).toBe("To-do list");
    expect(kindLabel("nonsense")).toBe("Block");
    expect(TURN_INTO.map((k) => k.type)).toEqual([
      "p",
      "h1",
      "h2",
      "h3",
      "bullet",
      "numbered",
      "checkbox",
      "blockquote",
    ]);
  });
});
