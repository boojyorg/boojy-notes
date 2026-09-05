/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SettingsProvider, useSettings } from "../../src/context/SettingsContext";

const wrapper = ({ children }) => <SettingsProvider>{children}</SettingsProvider>;

describe("SettingsContext — UI scale", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to 100% and persists changes", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.uiScale).toBe(100);

    act(() => result.current.setUiScale(110));
    expect(result.current.uiScale).toBe(110);
    expect(localStorage.getItem("boojy-ui-scale")).toBe("110");
    expect(document.documentElement.style.zoom).toBe("110%");
  });

  it("restores the saved scale on the next launch", () => {
    localStorage.setItem("boojy-ui-scale", "90");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.uiScale).toBe(90);
  });

  it("no longer exposes the retired font-size preference", () => {
    localStorage.setItem("boojy-font-size", "19");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current).not.toHaveProperty("settingsFontSize");
  });
});

describe("SettingsContext — settings pane", () => {
  it("opens and closes", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settingsOpen).toBe(false);
    act(() => result.current.setSettingsOpen(true));
    expect(result.current.settingsOpen).toBe(true);
  });
});
