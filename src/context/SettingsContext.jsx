import { createContext, useState, useEffect, useContext, useMemo } from "react";
import { isElectron } from "../utils/platform";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // UI Scale state — no settings UI; driven by the Cmd+Plus/Minus/0 shortcuts.
  // It is the one size control: the editor font-size preference
  // (`boojy-font-size`, 10–24) was removed on 2026-09-05 and the stored key
  // is simply no longer read.
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
      settingsOpen,
      setSettingsOpen,
      uiScale,
      setUiScale,
      autoUpdateEnabled,
      setAutoUpdateEnabled,
      updateStatus,
      setUpdateStatus,
    }),
    [settingsOpen, uiScale, autoUpdateEnabled, updateStatus],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
