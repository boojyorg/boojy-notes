import { createContext, useState, useEffect, useContext, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import { isElectron } from "../utils/platform";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settingsFontSize, setSettingsFontSize] = useState(15);
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

  // Auth is kept wired (recoverable sync work) even though the sign-in surface
  // is unmounted until local-first Boojy Notes is stable.
  const {
    user,
    profile,
    signInWithEmail,
    signUpWithEmail,
    signInWithOAuth,
    signOut,
    resendVerification,
  } = useAuth();

  // OAuth hash detection
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (hash.includes("access_token") || params.has("code")) {
      setSettingsOpen(true);
    }
  }, []);

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
      user,
      profile,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signOut,
      resendVerification,
      autoUpdateEnabled,
      setAutoUpdateEnabled,
      updateStatus,
      setUpdateStatus,
    }),
    [
      settingsFontSize,
      settingsOpen,
      uiScale,
      user,
      profile,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signOut,
      resendVerification,
      autoUpdateEnabled,
      updateStatus,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
