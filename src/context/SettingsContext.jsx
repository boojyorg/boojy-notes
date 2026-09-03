import { createContext, useState, useEffect, useContext, useMemo } from "react";
import { isElectron } from "../utils/platform";

const SettingsContext = createContext(null);

const FONT_SIZE_KEY = "boojy-font-size";
const FONT_SIZE_DEFAULT = 15;
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;

function readFontSize() {
  try {
    const saved = Number(localStorage.getItem(FONT_SIZE_KEY));
    if (Number.isInteger(saved) && saved >= FONT_SIZE_MIN && saved <= FONT_SIZE_MAX) return saved;
  } catch {}
  return FONT_SIZE_DEFAULT;
}

export function SettingsProvider({ children }) {
  // Editor font size (Settings → Appearance). Persisted like uiScale below;
  // until 2026-09 it was plain state and reset to 15 on every launch.
  const [settingsFontSize, setSettingsFontSize] = useState(readFontSize);
  useEffect(() => {
    try {
      localStorage.setItem(FONT_SIZE_KEY, String(settingsFontSize));
    } catch {}
  }, [settingsFontSize]);

  const [settingsOpen, setSettingsOpen] = useState(false);

  // UI Scale state — no settings UI; driven by the Cmd+Plus/Minus/0 shortcuts.
  const [uiScale, setUiScale] = useState(() => {
    const saved = localStorage.getItem("boojy-ui-scale");
    return saved ? Number(saved) : 100;
  });

  // Apply zoom and persist when scale changes
  useEffect(() => {
    document.documentElement.style.zoom = `${uiScale}%`;
    document.documentElement.style.minHeight = uiScale !== 100 ? `${10000 / uiScale}vh` : "";
    localStorage.setItem("boojy-ui-scale", String(uiScale));
  }, [uiScale]);

  // Spell check has no settings UI: the Electron main process applies the
  // stored preference at startup (electron/main.js) and defaults it on.

  // Auto-update state (desktop only)
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [updateStatus, setUpdateStatus] = useState({ state: "idle" });

  // Load auto-update settings and listen for update status events (desktop only)
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.getAutoUpdate) return;
    window.electronAPI.getAutoUpdate().then((enabled) => setAutoUpdateEnabled(enabled));
    const cleanup = window.electronAPI.onUpdateStatus?.((status) => setUpdateStatus(status));
    return () => cleanup?.();
  }, []);

  const value = useMemo(
    () => ({
      settingsFontSize,
      setSettingsFontSize,
      settingsOpen,
      setSettingsOpen,
      uiScale,
      setUiScale,
      autoUpdateEnabled,
      setAutoUpdateEnabled,
      updateStatus,
      setUpdateStatus,
    }),
    [settingsFontSize, settingsOpen, uiScale, autoUpdateEnabled, updateStatus],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
