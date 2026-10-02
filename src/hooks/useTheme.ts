import { useContext } from "react";
import type { NIGHT } from "../constants/themes";
import { ThemeContext } from "../context/ThemeContext";

/** Both palettes have one shape (`themeContrast.test.js` reads them side by side). */
export type Theme = typeof NIGHT;

export interface ThemeValue {
  theme: Theme;
  /** Stored key: `day`, `night` or `auto` (Light, Dark, System). */
  themeMode: string;
  setThemeMode: (mode: string) => void;
  isDark: boolean;
  setThemeOverrides: (overrides: Record<string, unknown> | null) => void;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext) as ThemeValue | null;
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
