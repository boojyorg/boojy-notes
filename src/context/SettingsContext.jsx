import { createContext, useState, useEffect, useContext, useMemo, useCallback } from "react";
import { settingsPageToOpen } from "../phone/reopenSettings";
import { isElectron } from "../utils/platform";
import { applyUiScale, drawnScale, initialUiScale } from "../utils/uiScale";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  // The phone starts in Settings after a storage location was opened from there.
  const [settingsOpen, setSettingsOpen] = useState(() => settingsPageToOpen() !== null);

  // UI Scale state, driven by Settings and the Cmd+Plus/Minus/0 shortcuts.
  // It is the one size control; a stored `boojy-font-size` is never read.
  const [uiScale, setUiScale] = useState(initialUiScale);

  useEffect(() => {
    applyUiScale(uiScale);
    // macOS draws the traffic lights itself, at one size: they follow the row.
    window.electronAPI?.setChromeScale?.(drawnScale(uiScale) / 100);
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

/**
 * The scale the app is drawn at, as a factor (1 is 100%), for layout that
 * must answer something the system draws at a fixed size (the traffic
 * lights). 1 outside a provider, so a component under test needs none.
 */
export function useDrawnScale() {
  const ctx = useContext(SettingsContext);
  return drawnScale(ctx?.uiScale ?? 100) / 100;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
