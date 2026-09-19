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

  // Apply zoom and persist when scale changes. `--ui-scale` goes on the same
  // element: `vw` and `vh` are *not* divided by `zoom` (measured 2026-09-19: a
  // `100vh` box is 1520px tall in a 760px window at 200%), so anything sized
  // against the viewport has to divide by the scale itself — `atScale()` in
  // `utils/uiScale`. Settings sized `maxHeight: calc(100vh - 48px)` was twice
  // the window at 200% and its title and Close sat above the top edge.
  useEffect(() => {
    document.documentElement.style.zoom = `${uiScale}%`;
    document.documentElement.style.setProperty("--ui-scale", String(uiScale / 100));
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
