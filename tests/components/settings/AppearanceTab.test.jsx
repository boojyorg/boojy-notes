/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setThemeMode: vi.fn(),
  themeMode: "day",
  setUiScale: vi.fn(),
  uiScale: 100,
}));

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { hover: "#ECECEC", surface: "#F4F4F5", divider: "#E9E9E9" },
      ACCENT: { primary: "#8FC1C6", onAccentText: "#14110F" },
      button: { bg: "transparent", border: "#E0E0E0" },
    },
    themeMode: mocks.themeMode,
    setThemeMode: mocks.setThemeMode,
  }),
}));

vi.mock("../../../src/context/SettingsContext", () => ({
  useSettings: () => ({ uiScale: mocks.uiScale, setUiScale: mocks.setUiScale }),
}));

import AppearanceTab from "../../../src/components/settings/AppearanceTab";

// Three pills with a glyph and a word; the chosen one on the row-hover
// ground in primary ink, never the accent (accent is never a desktop surface).
describe("AppearanceTab", () => {
  afterEach(cleanup);
  beforeEach(() => {
    mocks.setThemeMode.mockClear();
    mocks.setUiScale.mockClear();
    mocks.themeMode = "day";
    mocks.uiScale = 100;
  });

  it("is a radiogroup of Light, Dark and System with the saved mode checked", () => {
    render(<AppearanceTab SectionHeader={({ title }) => <h2>{title}</h2>} />);
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(group).toContainElement(radios[0]);
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[2]).toHaveAttribute("aria-checked", "false");
    // Selected: the neutral row ground, not the accent.
    expect(radios[0].style.background).toBe("rgb(236, 236, 236)");
    expect(radios[2].style.background).toBe("transparent");
  });

  it("stores the product's keys: System is 'auto'", () => {
    render(<AppearanceTab SectionHeader={() => null} />);
    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(mocks.setThemeMode).toHaveBeenCalledWith("auto");
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(mocks.setThemeMode).toHaveBeenCalledWith("night");
  });

  // Interface size: the Cmd+± scale, given a control. It is a menu rather than
  // a stepper because the scale redraws the whole app, Settings included, so a
  // control pressed repeatedly moved out from under the pointer (Tyr, live,
  // 2026-09-19).
  describe("Interface size", () => {
    const trigger = () => screen.getByTestId("ui-scale-value");
    const open = () => fireEvent.click(trigger());

    it("shows the scale on a button that opens the menu", () => {
      mocks.uiScale = 120;
      render(<AppearanceTab SectionHeader={() => null} />);
      expect(trigger()).toHaveTextContent("120%");
      expect(trigger()).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("menu")).toBeNull();

      open();
      expect(screen.getByRole("menu", { name: "Interface size" })).toBeInTheDocument();
      const sizes = screen.getAllByRole("menuitemradio").map((r) => r.textContent);
      expect(sizes[0]).toBe("50%");
      expect(sizes.at(-1)).toBe("200%");
      // The size the app opens at says so, and the one in use is checked.
      expect(sizes.find((t) => t?.startsWith("100%"))).toContain("Default");
      expect(screen.getByRole("menuitemradio", { checked: true })).toHaveTextContent("120%");
    });

    it("choosing a size applies it at once and closes the menu", () => {
      render(<AppearanceTab SectionHeader={() => null} />);
      open();
      fireEvent.click(screen.getByRole("menuitemradio", { name: /133%/ }));
      expect(mocks.setUiScale).toHaveBeenCalledWith(133);
      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("nothing is applied by pointing at a row: the app would resize under the menu", () => {
      render(<AppearanceTab SectionHeader={() => null} />);
      open();
      fireEvent.mouseEnter(screen.getByRole("menuitemradio", { name: /150%/ }));
      expect(mocks.setUiScale).not.toHaveBeenCalled();
    });

    it("Custom… takes a whole percentage, on Enter or Apply, never while typing", () => {
      mocks.uiScale = 120;
      render(<AppearanceTab SectionHeader={() => null} />);
      open();
      fireEvent.click(screen.getByRole("menuitem", { name: "Custom…" }));

      // The field opens on the scale in use, and typing changes nothing yet.
      const field = screen.getByTestId("ui-scale-input");
      expect(field).toHaveValue("120");
      fireEvent.change(field, { target: { value: "93" } });
      expect(mocks.setUiScale).not.toHaveBeenCalled();

      fireEvent.keyDown(field, { key: "Enter" });
      expect(mocks.setUiScale).toHaveBeenCalledWith(93);
      expect(screen.queryByTestId("ui-scale-input")).toBeNull();

      // Apply commits the same way.
      open();
      fireEvent.click(screen.getByRole("menuitem", { name: "Custom…" }));
      fireEvent.change(screen.getByTestId("ui-scale-input"), { target: { value: "145" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(mocks.setUiScale).toHaveBeenLastCalledWith(145);

      // Out of range is held inside it rather than refused.
      open();
      fireEvent.click(screen.getByRole("menuitem", { name: "Custom…" }));
      fireEvent.change(screen.getByTestId("ui-scale-input"), { target: { value: "900" } });
      fireEvent.keyDown(screen.getByTestId("ui-scale-input"), { key: "Enter" });
      expect(mocks.setUiScale).toHaveBeenLastCalledWith(200);
    });

    it("Escape in the field leaves the scale as it was, and Settings open", () => {
      render(<AppearanceTab SectionHeader={() => null} />);
      open();
      fireEvent.click(screen.getByRole("menuitem", { name: "Custom…" }));
      const field = screen.getByTestId("ui-scale-input");
      fireEvent.change(field, { target: { value: "77" } });
      const notSwallowed = fireEvent.keyDown(field, { key: "Escape", cancelable: true });
      expect(mocks.setUiScale).not.toHaveBeenCalled();
      expect(screen.queryByTestId("ui-scale-input")).toBeNull();
      // Prevented, so the dialog's own Escape handler stands down.
      expect(notSwallowed).toBe(false);
    });

    it("a custom scale checks Custom…, and Reset shows only off the default", () => {
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();

      mocks.uiScale = 93;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      expect(trigger()).toHaveTextContent("93%");
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(mocks.setUiScale).toHaveBeenCalledWith(100);

      open();
      expect(screen.queryByRole("menuitemradio", { checked: true })).toBeNull();
      expect(screen.getByTestId("scale-check").closest("button")).toHaveTextContent("Custom…");
    });
  });
});
