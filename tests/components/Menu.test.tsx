/** @vitest-environment jsdom */
/**
 * The shared menu: one surface, one row grammar, one placement, one rule for
 * keys. Each menu built on it keeps its own tests; these are the shell's.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#6F6861" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC" },
      ACCENT: { primary: "#8FC1C6" },
      SEMANTIC: { error: "#B3261E" },
      modalShadow: "none",
    },
  }),
}));

import Menu, { type MenuItem } from "../../src/components/Menu";

afterEach(() => {
  cleanup();
  Object.defineProperty(document.documentElement, "currentCSSZoom", {
    value: 1,
    configurable: true,
  });
});

const anchor = { top: 100, bottom: 120, left: 200, right: 240 };

function setup(items: MenuItem[], onClose = vi.fn()) {
  const view = render(
    <div onKeyDown={(e) => e.defaultPrevented || outerKey(e.key)}>
      <Menu label="Test menu" idPrefix="t" anchor={anchor} onClose={onClose} items={items} />
    </div>,
  );
  return { ...view, onClose, menu: screen.getByRole("menu", { name: "Test menu" }) };
}
const outerKey = vi.fn();

describe("Menu", () => {
  it("portals to body, so the React parent's container holds nothing", () => {
    const { container, menu } = setup([{ label: "One", action: vi.fn() }]);
    expect(container.querySelector("[role=menu]")).toBeNull();
    expect(document.body.contains(menu)).toBe(true);
  });

  it("a press on the backdrop closes it, and so does a right-click", () => {
    const { menu, onClose } = setup([{ label: "One", action: vi.fn() }]);
    const backdrop = menu.previousSibling as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.contextMenu(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("takes its keys on its own element and stops them there", () => {
    outerKey.mockClear();
    const first = vi.fn();
    const { menu } = setup([
      { label: "One", action: first },
      { label: "Two", action: vi.fn() },
    ]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(menu).toHaveAttribute("aria-activedescendant", "t-0");
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(first).toHaveBeenCalled();
    // The React parent never saw either key.
    expect(outerKey).not.toHaveBeenCalled();
  });

  it("reads a key that lands before focus reaches it from the document", () => {
    const { onClose } = setup([{ label: "One", action: vi.fn() }]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("divides its placement by the UI scale", () => {
    Object.defineProperty(document.documentElement, "currentCSSZoom", {
      value: 2,
      configurable: true,
    });
    const { menu } = setup([{ label: "One", action: vi.fn() }]);
    expect(parseFloat(menu.style.left)).toBe(anchor.left / 2);
  });

  it("lights a row on movement, clears it on leave, and skips a disabled row", () => {
    const off = vi.fn();
    const { menu } = setup([
      { label: "On", action: vi.fn() },
      { label: "Off", action: off, disabled: true },
    ]);
    const [on, disabled] = screen.getAllByRole("menuitem");
    fireEvent.mouseMove(on);
    expect(menu).toHaveAttribute("aria-activedescendant", "t-0");
    fireEvent.mouseLeave(on);
    expect(menu).not.toHaveAttribute("aria-activedescendant");
    fireEvent.mouseMove(disabled);
    fireEvent.click(disabled);
    expect(menu).not.toHaveAttribute("aria-activedescendant");
    expect(off).not.toHaveBeenCalled();
    expect(disabled).toHaveAttribute("aria-disabled", "true");
  });

  it("ticks a checked radio, draws a rule above a group, never above the first row", () => {
    setup([
      { label: "A", role: "menuitemradio", checked: true, rule: true, action: vi.fn() },
      { label: "B", role: "menuitemradio", checked: false, rule: true, action: vi.fn() },
    ]);
    const [a, b] = screen.getAllByRole("menuitemradio");
    expect(a).toHaveAttribute("aria-checked", "true");
    expect(a.querySelector("svg")).not.toBeNull();
    expect(b.querySelector("svg")).toBeNull();
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });
});
