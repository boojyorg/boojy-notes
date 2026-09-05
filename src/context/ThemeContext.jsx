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

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function ThemeProvider({ children }) {
  const saved = useMemo(loadThemeSettings, []);

  // Stored keys stay "day" / "night" / "auto" so every saved preference keeps
  // working; the product words are Light / Dark / System. "auto" follows the OS
  // appearance and nothing else (the time-of-day schedule was removed 2026-09;
  // a saved `autoMethod` is simply ignored).
  const [themeMode, setThemeModeRaw] = useState(saved.themeMode || "day");
  const [resolvedMode, setResolvedMode] = useState(() =>
    themeMode !== "auto" ? themeMode : systemPrefersDark() ? "night" : "day",
  );

  // Persist settings
  useEffect(() => {
    saveThemeSettings({ themeMode });
  }, [themeMode]);

  // Resolve System mode against the OS and follow it live.
  useEffect(() => {
    if (themeMode !== "auto") {
      setResolvedMode(themeMode);
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setResolvedMode(e.matches ? "night" : "day");
    setResolvedMode(mq.matches ? "night" : "day");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeMode]);

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
    const timer = setTimeout(() => {
      style.textContent = "";
    }, ms + 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isFirstRender is a stable ref-like object created with useMemo
  }, [resolvedMode]);

  const theme = resolvedMode === "day" ? DAY : NIGHT;
  const isDark = resolvedMode === "night";

  const setThemeMode = useCallback((v) => setThemeModeRaw(v), []);

  const value = useMemo(
    () => ({ theme, themeMode, setThemeMode, isDark }),
    [theme, themeMode, isDark, setThemeMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
