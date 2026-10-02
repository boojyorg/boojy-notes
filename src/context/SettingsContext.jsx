import { createContext, useState, useEffect, useContext, useMemo, useCallback } from "react";
import { isElectron } from "../utils/platform";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // UI Scale state, driven by Settings and the Cmd+Plus/Minus/0 shortcuts.
  // It is the one size control; a stored `boojy-font-size` is never read.
  const [uiScale, setUiScale] = useState(() => {
    const saved = localStorage.getItem("boojy-ui-scale");
    return saved ? Number(saved) : 100;
  });

  // Apply zoom and persist when scale changes. `--ui-scale` goes on the same
  // element: `vw` and `vh` are *not* divided by `zoom` (a `100vh` box is twice
  // the window at 200%), so anything sized against the viewport has to divide
  // by the scale itself — `atScale()` in `utils/uiScale`.
  useEffect(() => {
    document.documentElement.style.zoom = `${uiScale}%`;
    document.documentElement.style.setProperty("--ui-scale", String(uiScale / 100));
    document.documentElement.style.minHeight = uiScale !== 100 ? `${10000 / uiScale}vh` : "";
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
      spelling,
      changeSpelling,
    }),
    [settingsOpen, uiScale, autoUpdateEnabled, updateStatus, spelling, changeSpelling],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
