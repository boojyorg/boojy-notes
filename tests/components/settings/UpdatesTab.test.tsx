/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setAutoUpdateEnabled: vi.fn(),
  setAutoUpdate: vi.fn(),
  settings: {
    autoUpdateEnabled: true,
    updateStatus: { state: "idle" } as { state: string; version?: string },
  },
}));

vi.mock("../../../src/context/SettingsContext", () => ({
  useSettings: () => ({
    autoUpdateEnabled: mocks.settings.autoUpdateEnabled,
    setAutoUpdateEnabled: mocks.setAutoUpdateEnabled,
    updateStatus: mocks.settings.updateStatus,
  }),
}));

vi.mock("../../../src/context/LayoutContext", () => ({
  useLayout: () => ({ accentColor: "#2A737D" }),
}));

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      ACCENT: { primary: "#2A737D", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#D43030" },
      overlay: (alpha: number) => `rgba(0,0,0,${alpha})`,
    },
  }),
}));

import UpdatesTab from "../../../src/components/settings/UpdatesTab";

describe("UpdatesTab", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings.autoUpdateEnabled = true;
    mocks.settings.updateStatus = { state: "idle" };
    Object.assign(window.electronAPI, {
      setAutoUpdate: mocks.setAutoUpdate.mockResolvedValue({}),
    });
  });

  it("exposes auto-update as a keyboard-operable switch", () => {
    render(<UpdatesTab isDesktop SectionHeader={() => null} />);

    const toggle = screen.getByRole("switch", { name: "Auto-update" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    expect(mocks.setAutoUpdateEnabled).toHaveBeenCalledWith(false);
    expect(mocks.setAutoUpdate).toHaveBeenCalledWith(false);
  });

  // Review H11: "Restart & Update" and the switch knob were hardcoded white on
  // the accent fill, which Dark's pale accent made unreadable (about 1.7:1).
  // Anything on an accent fill takes the theme's own ink for it.
  it("draws the install button and the on-state knob in the accent's ink, never a fixed white", () => {
    mocks.settings.updateStatus = { state: "downloaded", version: "9.9.9" };
    render(<UpdatesTab isDesktop SectionHeader={() => null} />);

    const install = screen.getByRole("button", { name: "Restart & Update" });
    expect(install.style.color).toBe("rgb(255, 255, 255)");
    expect(install.style.background).toBe("rgb(42, 115, 125)");

    const knob = screen.getByRole("switch", { name: "Auto-update" })
      .firstElementChild as HTMLElement;
    expect(knob.style.background).toBe("rgb(255, 255, 255)");
  });

  it("gives the off-state knob a visible ink on the neutral track", () => {
    mocks.settings.autoUpdateEnabled = false;
    render(<UpdatesTab isDesktop SectionHeader={() => null} />);
    const knob = screen.getByRole("switch", { name: "Auto-update" })
      .firstElementChild as HTMLElement;
    // TEXT.secondary; a white knob on the 6% track was invisible in Light.
    expect(knob.style.background).toBe("rgb(71, 64, 58)");
  });
});
