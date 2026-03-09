import { createContext, useState, useEffect, useMemo, useCallback } from "react";
import { NIGHT, DAY } from "../constants/themes";

export const ThemeContext = createContext(null);

const LS_KEY = "boojy-theme";

function loadThemeSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveThemeSettings(settings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {}
}

export function ThemeProvider({ children }) {
  const saved = useMemo(loadThemeSettings, []);

  const [themeMode, setThemeModeRaw] = useState(saved.themeMode || "night");
  const [autoMethod, setAutoMethodRaw] = useState(saved.autoMethod || "system");
  const [dayStartHour, setDayStartHourRaw] = useState(saved.dayStartHour ?? 7);
  const [dayEndHour, setDayEndHourRaw] = useState(saved.dayEndHour ?? 19);
  const [resolvedMode, setResolvedMode] = useState(() => {
    if (themeMode !== "auto") return themeMode;
    if (saved.autoMethod === "time") {
      const h = new Date().getHours();
      return h >= (saved.dayStartHour ?? 7) && h < (saved.dayEndHour ?? 19) ? "day" : "night";
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
    }
    return "night";
  });

  // Persist settings
  useEffect(() => {
    saveThemeSettings({ themeMode, autoMethod, dayStartHour, dayEndHour });
  }, [themeMode, autoMethod, dayStartHour, dayEndHour]);

  // Resolve auto mode
  useEffect(() => {
    if (themeMode !== "auto") {
      setResolvedMode(themeMode);
      return;
    }

    if (autoMethod === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e) => setResolvedMode(e.matches ? "night" : "day");
      setResolvedMode(mq.matches ? "night" : "day");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    // Time-based
    const check = () => {
      const h = new Date().getHours();
      setResolvedMode(h >= dayStartHour && h < dayEndHour ? "day" : "night");
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [themeMode, autoMethod, dayStartHour, dayEndHour]);

  // Smooth crossfade when theme changes
  const isFirstRender = useMemo(() => ({ current: true }), []);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const ms = 400;
    const id = "boojy-theme-transition";
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = `*, *::before, *::after { transition: background-color ${ms}ms ease, color ${ms}ms ease, border-color ${ms}ms ease, box-shadow ${ms}ms ease, fill ${ms}ms ease !important; }`;
    const timer = setTimeout(() => { style.textContent = ""; }, ms + 50);
    return () => clearTimeout(timer);
  }, [resolvedMode]);

  const theme = resolvedMode === "day" ? DAY : NIGHT;
  const isDark = resolvedMode === "night";

  const setThemeMode = useCallback((v) => setThemeModeRaw(v), []);
  const setAutoMethod = useCallback((v) => setAutoMethodRaw(v), []);
  const setDayStartHour = useCallback((v) => setDayStartHourRaw(v), []);
  const setDayEndHour = useCallback((v) => setDayEndHourRaw(v), []);

  const value = useMemo(
    () => ({
      theme,
      themeMode,
      setThemeMode,
      autoMethod,
      setAutoMethod,
      isDark,
      dayStartHour,
      setDayStartHour,
      dayEndHour,
      setDayEndHour,
    }),
    [theme, themeMode, autoMethod, isDark, dayStartHour, dayEndHour, setThemeMode, setAutoMethod, setDayStartHour, setDayEndHour],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
