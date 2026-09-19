/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCALE_SETTLE_MS } from "../../../src/utils/uiScale";

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

  // Interface size: the Cmd+± scale, given a control. One segmented stepper,
  // and a press moves the figure at once but the app a beat later — the scale
  // redraws Settings too, so applying per press moved the button out from
  // under the pointer between presses (judged live, Tyr, 2026-09-19).
  describe("Interface size", () => {
    const figure = () => screen.getByTestId("ui-scale-value");
    const larger = () => screen.getByRole("button", { name: "Larger" });
    const smaller = () => screen.getByRole("button", { name: "Smaller" });

    it("shows the scale, and a press moves the figure before it moves the app", () => {
      render(<AppearanceTab SectionHeader={() => null} />);
      expect(figure()).toHaveTextContent("100%");

      fireEvent.click(larger());
      // The figure is already there; the app has not been redrawn yet.
      expect(figure()).toHaveTextContent("110%");
      expect(mocks.setUiScale).not.toHaveBeenCalled();

      // A run of presses accumulates into one change at the end of it.
      fireEvent.click(larger());
      fireEvent.click(larger());
      expect(figure()).toHaveTextContent("133%");
      act(() => vi.advanceTimersByTime(SCALE_SETTLE_MS + 10));
      expect(mocks.setUiScale).toHaveBeenCalledTimes(1);
      expect(mocks.setUiScale).toHaveBeenCalledWith(133);
    });

    it("steps through the presets and says so at the ends of the range", () => {
      mocks.uiScale = 200;
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      expect(larger()).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(larger());
      act(() => vi.advanceTimersByTime(SCALE_SETTLE_MS + 10));
      expect(mocks.setUiScale).not.toHaveBeenCalled();

      fireEvent.click(smaller());
      expect(figure()).toHaveTextContent("170%");

      mocks.uiScale = 50;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      expect(smaller()).toHaveAttribute("aria-disabled", "true");
      expect(larger()).not.toHaveAttribute("aria-disabled");
    });

    it("a keyboard shortcut cancels a press that has not landed", () => {
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(larger());
      expect(figure()).toHaveTextContent("110%");

      // Cmd+0 elsewhere in the app: the scale changed without the row asking.
      mocks.uiScale = 150;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      expect(figure()).toHaveTextContent("150%");
      act(() => vi.advanceTimersByTime(SCALE_SETTLE_MS + 50));
      expect(mocks.setUiScale).not.toHaveBeenCalled();
    });

    it("Reset lands at once and takes a pending press with it", () => {
      mocks.uiScale = 133;
      render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(larger());
      expect(figure()).toHaveTextContent("150%");

      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(mocks.setUiScale).toHaveBeenCalledExactlyOnceWith(100);
      act(() => vi.advanceTimersByTime(SCALE_SETTLE_MS + 50));
      expect(mocks.setUiScale).toHaveBeenCalledTimes(1);
    });

    it("Reset is offered only off the default, where there is something to go back to", () => {
      const { rerender } = render(<AppearanceTab SectionHeader={() => null} />);
      expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
      // It follows the figure, so it appears with the press rather than after it.
      fireEvent.click(larger());
      expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();

      mocks.uiScale = 93;
      rerender(<AppearanceTab SectionHeader={() => null} />);
      expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    });

    it("the figure takes a typed percentage, on Enter or the tick, never while typing", () => {
      mocks.uiScale = 120;
      render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(figure());

      const field = screen.getByTestId("ui-scale-input");
      expect(field).toHaveValue("120");
      fireEvent.change(field, { target: { value: "93" } });
      act(() => vi.advanceTimersByTime(SCALE_SETTLE_MS + 50));
      expect(mocks.setUiScale).not.toHaveBeenCalled();
      // − stands down while the field is open; + is the tick that applies.
      expect(smaller()).toHaveAttribute("aria-disabled", "true");

      fireEvent.keyDown(field, { key: "Enter" });
      expect(mocks.setUiScale).toHaveBeenCalledWith(93);
      expect(screen.queryByTestId("ui-scale-input")).toBeNull();

      // The tick commits the same way, and a value outside the range is held
      // inside it rather than refused.
      fireEvent.click(figure());
      fireEvent.change(screen.getByTestId("ui-scale-input"), { target: { value: "900" } });
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      expect(mocks.setUiScale).toHaveBeenLastCalledWith(200);
    });

    it("a typed value takes a pending press with it", () => {
      render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(larger());
      fireEvent.click(figure());
      fireEvent.change(screen.getByTestId("ui-scale-input"), { target: { value: "93" } });
      fireEvent.keyDown(screen.getByTestId("ui-scale-input"), { key: "Enter" });
      act(() => vi.advanceTimersByTime(SCALE_SETTLE_MS + 50));
      expect(mocks.setUiScale).toHaveBeenCalledExactlyOnceWith(93);
    });

    it("Escape leaves the scale as it was, and Settings open", () => {
      render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(figure());
      const field = screen.getByTestId("ui-scale-input");
      fireEvent.change(field, { target: { value: "77" } });
      const notSwallowed = fireEvent.keyDown(field, { key: "Escape", cancelable: true });
      expect(mocks.setUiScale).not.toHaveBeenCalled();
      expect(screen.queryByTestId("ui-scale-input")).toBeNull();
      // Prevented, so the dialog's own Escape handler stands down.
      expect(notSwallowed).toBe(false);
    });

    it("closing Settings inside the wait applies what was asked for", () => {
      const { unmount } = render(<AppearanceTab SectionHeader={() => null} />);
      fireEvent.click(larger());
      expect(mocks.setUiScale).not.toHaveBeenCalled();
      unmount();
      expect(mocks.setUiScale).toHaveBeenCalledExactlyOnceWith(110);
    });
  });
});
