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

import AppearanceTab, { stepScale } from "../../../src/components/settings/AppearanceTab";

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

  // Interface size: the Cmd+± scale, given a control. Before 2026-09-19 it was
  // keyboard-only, so nothing in the app said it existed or what scale you
  // were on.
  describe("Interface size", () => {
    const value = () => screen.getByTestId("ui-scale-value").textContent;

    it("shows the scale and steps it through SCALE_OPTIONS", () => {
      mocks.uiScale = 110;
      render(<AppearanceTab SectionHeader={() => null} />);
      expect(value()).toBe("110%");
      fireEvent.click(screen.getByRole("button", { name: "Larger" }));
      expect(mocks.setUiScale).toHaveBeenCalledWith(120);
      fireEvent.click(screen.getByRole("button", { name: "Smaller" }));
      expect(mocks.setUiScale).toHaveBeenCalledWith(100);
    });

    it("offers Reset only off 100%, and it goes back to 100", () => {
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();

      mocks.uiScale = 133;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(mocks.setUiScale).toHaveBeenCalledWith(100);
    });

    it("says so at the ends of the range, and answers nothing there", () => {
      mocks.uiScale = 200;
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      const larger = screen.getByRole("button", { name: "Larger" });
      // aria-disabled, the chrome row's grammar: it keeps the pointer and focus.
      expect(larger).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("button", { name: "Smaller" })).not.toHaveAttribute("aria-disabled");
      fireEvent.click(larger);
      expect(mocks.setUiScale).not.toHaveBeenCalled();

      mocks.uiScale = 50;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      expect(screen.getByRole("button", { name: "Smaller" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("button", { name: "Larger" })).not.toHaveAttribute("aria-disabled");
    });

    it("stepScale stops at the ends rather than falling off them", () => {
      expect(stepScale(100, 1)).toBe(110);
      expect(stepScale(100, -1)).toBe(90);
      expect(stepScale(200, 1)).toBe(200);
      expect(stepScale(50, -1)).toBe(50);
    });
  });
});
