/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { SettingsProvider, useSettings } from "../../src/context/SettingsContext";

const wrapper = ({ children }) => <SettingsProvider>{children}</SettingsProvider>;

describe("SettingsContext — font size", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to 15 and persists changes", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settingsFontSize).toBe(15);

    act(() => result.current.setSettingsFontSize(17));
    expect(result.current.settingsFontSize).toBe(17);
    expect(localStorage.getItem("boojy-font-size")).toBe("17");
  });

  it("restores the saved size on the next launch", () => {
    localStorage.setItem("boojy-font-size", "19");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settingsFontSize).toBe(19);
  });

  it("ignores a stored value outside the 10–24 range", () => {
    localStorage.setItem("boojy-font-size", "99");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settingsFontSize).toBe(15);
  });
});
