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
      ACCENT: { primary: "#2A737D", onAccent: "#FFFFFF", onAccentText: "#14110F", text: "#2A737D" },
      SEMANTIC: { error: "#D43030" },
      BG: { hover: "#ECECEC", divider: "#E9E9E9", surface: "#F4F4F5" },
      button: { bg: "transparent", border: "#DCDCDC" },
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

    const toggle = screen.getByRole("switch", { name: "Automatic updates" });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    expect(mocks.setAutoUpdateEnabled).toHaveBeenCalledWith(false);
    expect(mocks.setAutoUpdate).toHaveBeenCalledWith(false);
  });

  // One button and one status line (2026-09-17). The button says what it is
  // doing, the line what was found; only the ready state changes the button's
  // look. A label on the mark takes the dark ink (white is 2:1 on the teal);
  // the knob keeps the tick's white, being a shape.
  it("walks the states: idle, checking, up to date, downloading, ready, error", () => {
    const states: Array<[typeof mocks.settings.updateStatus, string, RegExp]> = [
      [{ state: "idle" }, "Check for updates", /Checks for updates when the app starts/],
      [{ state: "checking" }, "Checking…", /Checking for updates/],
      [{ state: "up-to-date" }, "Check for updates", /Up to date · v\d+\.\d+\.\d+ is the latest/],
      [{ state: "downloading", percent: 42 }, "Downloading…", /Downloading update · 42%/],
      [
        { state: "downloaded", version: "9.9.9" },
        "Restart to update",
        /v9\.9\.9 is ready to install/,
      ],
      [{ state: "error", message: "boom" }, "Try again", /Couldn’t check for updates/],
    ];
    for (const [status, button, line] of states) {
      mocks.settings.updateStatus = status;
      const view = render(<UpdatesTab isDesktop SectionHeader={() => null} />);
      const btn = screen.getByRole("button", { name: button });
      expect(screen.getByTestId("update-status")).toHaveTextContent(line);
      const disabled = status.state === "checking" || status.state === "downloading";
      if (disabled) expect(btn).toHaveAttribute("aria-disabled", "true");
      else expect(btn).not.toHaveAttribute("aria-disabled");
      view.unmount();
    }
  });

  it("checks on Check for updates and installs on Restart to update, in the mark's label ink", () => {
    const check = vi.fn();
    const install = vi.fn();
    Object.assign(window.electronAPI, { checkForUpdate: check, installUpdate: install });
    mocks.settings.updateStatus = { state: "idle" };
    const view = render(<UpdatesTab isDesktop SectionHeader={() => null} />);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(check).toHaveBeenCalledTimes(1);
    view.unmount();

    mocks.settings.updateStatus = { state: "downloaded", version: "9.9.9" };
    render(<UpdatesTab isDesktop SectionHeader={() => null} />);
    const restart = screen.getByRole("button", { name: "Restart to update" });
    expect(restart.style.color).toBe("rgb(20, 17, 15)");
    expect(restart.style.background).toBe("rgb(42, 115, 125)");
    fireEvent.click(restart);
    expect(install).toHaveBeenCalledTimes(1);

    const knob = screen.getByRole("switch", { name: "Automatic updates" })
      .firstElementChild as HTMLElement;
    expect(knob.style.background).toBe("rgb(255, 255, 255)");
  });

  it("gives the off-state knob a visible ink on the neutral track", () => {
    mocks.settings.autoUpdateEnabled = false;
    render(<UpdatesTab isDesktop SectionHeader={() => null} />);
    const knob = screen.getByRole("switch", { name: "Automatic updates" })
      .firstElementChild as HTMLElement;
    // TEXT.secondary; a white knob on the 6% track was invisible in Light.
    expect(knob.style.background).toBe("rgb(71, 64, 58)");
  });
});
