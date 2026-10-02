/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      ACCENT: { primary: "#2A737D", onAccent: "#FFFFFF", onAccentText: "#14110F", text: "#2A737D" },
      SEMANTIC: { error: "#D43030" },
      BG: { elevated: "#FFFFFF", hover: "#ECECEC", divider: "#E9E9E9", surface: "#F4F4F5" },
      button: { bg: "transparent", border: "#DCDCDC" },
      modalShadow: "none",
    },
  }),
}));

import SpellingSection, { languageName } from "../../../src/components/settings/SpellingSection";
import type { SpellingState } from "../../../src/types/global";

afterEach(cleanup);

const Title = ({ title }: { title: string }) => <div>{title}</div>;

async function mount(state: SpellingState) {
  const api = {
    getSpelling: vi.fn().mockResolvedValue(state),
    setSpelling: vi.fn(async (change: Partial<SpellingState>) => ({ ...state, ...change })),
    openKeyboardSettings: vi.fn(),
  };
  Object.assign(window.electronAPI, api);
  await act(async () => {
    render(<SpellingSection SectionHeader={Title} />);
  });
  return api;
}

describe("SpellingSection", () => {
  it("names a dictionary as a person says it", () => {
    expect(languageName("en-GB")).toBe("English (UK)");
    expect(languageName("es")).toBe("Spanish");
  });

  it("switches spelling off at once", async () => {
    const api = await mount({
      enabled: true,
      languages: ["en-GB"],
      available: ["en-GB"],
      setBySystem: false,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Check spelling" }));
    });
    expect(api.setSpelling).toHaveBeenCalledWith({ enabled: false });
    expect(screen.getByRole("switch", { name: "Check spelling" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("ticks languages in a menu, the ticked first; the last one cannot be unticked", async () => {
    const api = await mount({
      enabled: true,
      languages: ["en-GB"],
      available: ["fr", "en-GB", "es", "en-US"],
      setBySystem: false,
    });
    fireEvent.click(screen.getByRole("button", { name: /English \(UK\)/ }));
    const rows = screen.getAllByRole("menuitemcheckbox");
    expect(rows.map((r) => r.textContent)).toEqual([
      "English (UK)",
      "English (US)",
      "French",
      "Spanish",
    ]);
    expect(rows[0]).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      fireEvent.click(rows[3]);
    });
    expect(api.setSpelling).toHaveBeenCalledWith({ languages: ["en-GB", "es"] });
  });

  it("on a Mac, says the system sets the language and opens its settings", async () => {
    const api = await mount({ enabled: true, languages: [], available: [], setBySystem: true });
    expect(screen.getByText("Set by your Mac")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Keyboard Settings" }));
    expect(api.openKeyboardSettings).toHaveBeenCalled();
  });
});
