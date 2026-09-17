/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setThemeMode: vi.fn(), themeMode: "day" }));

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6" },
    },
    themeMode: mocks.themeMode,
    setThemeMode: mocks.setThemeMode,
  }),
}));

import AppearanceTab from "../../../src/components/settings/AppearanceTab";

// Three pills with a glyph and a word; the chosen one on the row-hover
// ground in primary ink, never the accent (accent is never a desktop surface).
describe("AppearanceTab", () => {
  afterEach(cleanup);
  beforeEach(() => {
    mocks.setThemeMode.mockClear();
    mocks.themeMode = "day";
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
});
