/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
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
    it("defaults to day (light) when no preference has been saved", () => {
      const { result } = renderTheme();
      expect(result.current.theme).toBe(DAY);
      expect(result.current.isDark).toBe(false);
      expect(result.current.themeMode).toBe("day");
    });

    it("uses saved themeMode from localStorage", () => {
      localStorage.setItem(LS_KEY, JSON.stringify({ themeMode: "day" }));
      const { result } = renderTheme();
      expect(result.current.theme).toBe(DAY);
      expect(result.current.isDark).toBe(false);
    });

    it("retains a saved night preference", () => {
      localStorage.setItem(LS_KEY, JSON.stringify({ themeMode: "night" }));
      const { result } = renderTheme();
      expect(result.current.theme).toBe(NIGHT);
      expect(result.current.themeMode).toBe("night");
    });

    it("retains a saved System preference (stored as auto) and ignores a legacy autoMethod", () => {
      // Older builds offered a time-of-day schedule under Auto; that saved
      // method is now ignored and "auto" always follows the OS appearance.
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ themeMode: "auto", autoMethod: "time", dayStartHour: 0, dayEndHour: 0 }),
      );
      const { result } = renderTheme();
      expect(result.current.themeMode).toBe("auto");
      expect(result.current.theme).toBe(DAY);
    });
  });

  describe("toggling theme", () => {
    it("switches from night to day", () => {
      localStorage.setItem(LS_KEY, JSON.stringify({ themeMode: "night" }));
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

    it("no longer writes the retired schedule keys", () => {
      localStorage.setItem(LS_KEY, JSON.stringify({ themeMode: "auto", autoMethod: "time" }));
      const { result } = renderTheme();

      act(() => {
        result.current.setThemeMode("night");
      });

      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      expect(saved).toEqual({ themeMode: "night" });
    });
  });

  describe("System mode", () => {
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
