/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useContext } from "react";
import { ThemeContext, ThemeProvider } from "../../src/context/ThemeContext";
import { NIGHT, DAY } from "../../src/constants/themes";

const LS_KEY = "boojy-theme";

function useThemeCtx() {
  return useContext(ThemeContext);
}

function renderTheme() {
  return renderHook(() => useThemeCtx(), { wrapper: ThemeProvider });
}

beforeEach(() => {
  localStorage.clear();
});

describe("ThemeContext", () => {
  describe("default theme", () => {
    it("defaults to night (dark) when matchMedia prefers-color-scheme is not dark", () => {
      // setup.js stubs matchMedia with matches: false, so "auto" + "system" would resolve to "day",
      // but the default themeMode is "night" (not "auto"), so it should be NIGHT.
      const { result } = renderTheme();
      expect(result.current.theme).toBe(NIGHT);
      expect(result.current.isDark).toBe(true);
      expect(result.current.themeMode).toBe("night");
    });

    it("uses saved themeMode from localStorage", () => {
      localStorage.setItem(LS_KEY, JSON.stringify({ themeMode: "day" }));
      const { result } = renderTheme();
      expect(result.current.theme).toBe(DAY);
      expect(result.current.isDark).toBe(false);
    });
  });

  describe("toggling theme", () => {
    it("switches from night to day", () => {
      const { result } = renderTheme();
      expect(result.current.theme).toBe(NIGHT);

      act(() => {
        result.current.setThemeMode("day");
      });

      expect(result.current.theme).toBe(DAY);
      expect(result.current.isDark).toBe(false);
    });

    it("switches from day to night", () => {
      localStorage.setItem(LS_KEY, JSON.stringify({ themeMode: "day" }));
      const { result } = renderTheme();
      expect(result.current.theme).toBe(DAY);

      act(() => {
        result.current.setThemeMode("night");
      });

      expect(result.current.theme).toBe(NIGHT);
      expect(result.current.isDark).toBe(true);
    });
  });

  describe("persistence", () => {
    it("saves themeMode to localStorage on change", () => {
      const { result } = renderTheme();

      act(() => {
        result.current.setThemeMode("day");
      });

      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      expect(saved.themeMode).toBe("day");
    });

    it("saves autoMethod to localStorage", () => {
      const { result } = renderTheme();

      act(() => {
        result.current.setAutoMethod("time");
      });

      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      expect(saved.autoMethod).toBe("time");
    });

    it("saves dayStartHour and dayEndHour to localStorage", () => {
      const { result } = renderTheme();

      act(() => {
        result.current.setDayStartHour(8);
        result.current.setDayEndHour(20);
      });

      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      expect(saved.dayStartHour).toBe(8);
      expect(saved.dayEndHour).toBe(20);
    });
  });

  describe("auto mode with system method", () => {
    it("resolves to day when matchMedia prefers-color-scheme is not dark", () => {
      // setup.js matchMedia returns matches: false (light preference)
      const { result } = renderTheme();

      act(() => {
        result.current.setThemeMode("auto");
      });

      expect(result.current.theme).toBe(DAY);
      expect(result.current.isDark).toBe(false);
    });
  });
});
