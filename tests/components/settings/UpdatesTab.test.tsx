/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setAutoUpdateEnabled: vi.fn(),
  setAutoUpdate: vi.fn(),
}));

vi.mock("../../../src/context/SettingsContext", () => ({
  useSettings: () => ({
    autoUpdateEnabled: true,
    setAutoUpdateEnabled: mocks.setAutoUpdateEnabled,
    updateStatus: { state: "idle" },
  }),
}));

vi.mock("../../../src/context/LayoutContext", () => ({
  useLayout: () => ({ accentColor: "#2A737D" }),
}));

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      ACCENT: { primary: "#2A737D" },
      SEMANTIC: { error: "#D43030" },
      overlay: (alpha: number) => `rgba(0,0,0,${alpha})`,
    },
  }),
}));

import UpdatesTab from "../../../src/components/settings/UpdatesTab";

describe("UpdatesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
