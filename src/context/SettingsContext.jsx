import { createContext, useState, useEffect, useContext, useMemo, useCallback } from "react";
import { isElectron } from "../utils/platform";
import { applyUiScale, initialUiScale } from "../utils/uiScale";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // UI Scale state, driven by Settings and the Cmd+Plus/Minus/0 shortcuts.
  // It is the one size control; a stored `boojy-font-size` is never read.
  const [uiScale, setUiScale] = useState(initialUiScale);

  useEffect(() => {
    applyUiScale(uiScale);
    localStorage.setItem("boojy-ui-scale", String(uiScale));
  }, [uiScale]);

  // Spelling (Settings → Spelling, electron/spelling.ts): null until the main
  // process answers, and on the web, which has no checker. The editor's
  // underline and the Settings section both read it here.
  const [spelling, setSpelling] = useState(null);
  useEffect(() => {
    window.electronAPI?.getSpelling?.().then(setSpelling);
  }, []);
  const changeSpelling = useCallback(
    (change) => window.electronAPI?.setSpelling?.(change).then(setSpelling),
    [],
  );

  // Auto-update state (desktop only)
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [updateStatus, setUpdateStatus] = useState({ state: "idle" });
  // The switch's one owner, as `changeSpelling` is: main's setting and this state together.
  const changeAutoUpdate = useCallback((enabled) => {
    setAutoUpdateEnabled(enabled);
    window.electronAPI?.setAutoUpdate?.(enabled);
  }, []);

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
      changeAutoUpdate,
      updateStatus,
      spelling,
      changeSpelling,
    }),
    [
      settingsOpen,
      uiScale,
      autoUpdateEnabled,
      changeAutoUpdate,
      updateStatus,
      spelling,
      changeSpelling,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
