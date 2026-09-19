/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });
  beforeEach(() => {
    vi.useFakeTimers();
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

  // Interface size: the Cmd+± scale, given a control. Every press applies at
  // once — it is the Settings pane that holds still while the app resizes
  // behind it (SettingsModal), not the scale that waits (judged live twice,
  // Tyr, 2026-09-19; a debounce moved the controls once per run and brought a
  // pending value that could land on top of a newer one).
  describe("Interface size", () => {
    const figure = () => screen.getByTestId("ui-scale-value");
    const larger = () => screen.getByRole("button", { name: "Larger" });
    const smaller = () => screen.getByRole("button", { name: "Smaller" });

    it("applies every press at once, with no timer behind it", () => {
      render(<AppearanceTab SectionHeader={() => null} />);
      expect(figure()).toHaveTextContent("100%");

      fireEvent.click(larger());
      expect(mocks.setUiScale).toHaveBeenCalledExactlyOnceWith(110);
      // Nothing is waiting to happen later.
      act(() => vi.advanceTimersByTime(2_000));
      expect(mocks.setUiScale).toHaveBeenCalledTimes(1);
    });

    it("steps through the presets and says so at the ends of the range", () => {
      mocks.uiScale = 200;
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      expect(larger()).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(larger());
      expect(mocks.setUiScale).not.toHaveBeenCalled();
      fireEvent.click(smaller());
      expect(mocks.setUiScale).toHaveBeenCalledWith(170);

      mocks.uiScale = 50;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      expect(smaller()).toHaveAttribute("aria-disabled", "true");
      expect(larger()).not.toHaveAttribute("aria-disabled");
    });

    it("Reset is offered only off the default, and goes back to it", () => {
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();

      mocks.uiScale = 133;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(mocks.setUiScale).toHaveBeenCalledExactlyOnceWith(100);
    });

    it("the figure takes a typed percentage, on Enter or on leaving the field", () => {
      mocks.uiScale = 120;
      render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(figure());

      const field = screen.getByTestId("ui-scale-input");
      expect(field).toHaveValue("120");
      fireEvent.change(field, { target: { value: "93" } });
      // Nothing while it is being typed: the field would resize under the caret.
      expect(mocks.setUiScale).not.toHaveBeenCalled();

      fireEvent.keyDown(field, { key: "Enter" });
      expect(mocks.setUiScale).toHaveBeenCalledWith(93);
      expect(screen.queryByTestId("ui-scale-input")).toBeNull();

      // Leaving the field commits it too, and a value outside the range is
      // held inside it rather than refused.
      fireEvent.click(figure());
      fireEvent.change(screen.getByTestId("ui-scale-input"), { target: { value: "900" } });
      fireEvent.blur(screen.getByTestId("ui-scale-input"));
      expect(mocks.setUiScale).toHaveBeenLastCalledWith(200);
    });

    it("Escape cancels the edit, and the blur it causes commits nothing", () => {
      render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(figure());
      const field = screen.getByTestId("ui-scale-input");
      fireEvent.change(field, { target: { value: "77" } });
      const notSwallowed = fireEvent.keyDown(field, { key: "Escape", cancelable: true });
      fireEvent.blur(field);
      expect(mocks.setUiScale).not.toHaveBeenCalled();
      expect(screen.queryByTestId("ui-scale-input")).toBeNull();
      // Prevented, so the dialog's own Escape handler stands down.
      expect(notSwallowed).toBe(false);
    });

    // An unfinished edit must never land on top of something newer: a shortcut
    // (which works while Settings is open) or Reset takes it with it.
    it("a scale from anywhere else cancels an unfinished edit", () => {
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(figure());
      fireEvent.change(screen.getByTestId("ui-scale-input"), { target: { value: "77" } });

      mocks.uiScale = 150;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      expect(screen.queryByTestId("ui-scale-input")).toBeNull();
      expect(figure()).toHaveTextContent("150%");
      expect(mocks.setUiScale).not.toHaveBeenCalled();
    });

    it("pressing Reset with the field open resets, and drops what was typed", () => {
      mocks.uiScale = 133;
      render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(figure());
      fireEvent.change(screen.getByTestId("ui-scale-input"), { target: { value: "77" } });
      const reset = screen.getByRole("button", { name: "Reset" });
      // The pointer press comes before the field's blur, and claims it.
      fireEvent.mouseDown(reset);
      fireEvent.blur(screen.getByTestId("ui-scale-input"));
      fireEvent.click(reset);
      expect(mocks.setUiScale).toHaveBeenCalledExactlyOnceWith(100);
    });
  });
});
