import { createContext, useState, useEffect, useContext, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import { isElectron } from "../utils/platform";
import { getAPI } from "../services/apiProvider";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settingsFontSize, setSettingsFontSize] = useState(15);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");

  // UI Scale state
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
      setSettingsTab("profile");
    }
  }, []);

  // Spell check state
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);
  const [spellCheckLanguages, setSpellCheckLanguages] = useState(["en-US"]);

  // Auto-update state (desktop only)
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
  const [updateStatus, setUpdateStatus] = useState({ state: "idle" });

  // Load settings on mount (spell check, etc.)
  useEffect(() => {
    const api = getAPI();
    if (!api?.getSettings) return;
    api.getSettings().then((s) => {
      if (s.spellCheckEnabled !== undefined) setSpellCheckEnabled(s.spellCheckEnabled !== false);
      if (s.spellCheckLanguages) setSpellCheckLanguages(s.spellCheckLanguages);
    });
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
      settingsFontSize,
      setSettingsFontSize,
      settingsOpen,
      setSettingsOpen,
      settingsTab,
      setSettingsTab,
      uiScale,
      setUiScale,
      user,
      profile,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signOut,
      resendVerification,
      spellCheckEnabled,
      setSpellCheckEnabled,
      spellCheckLanguages,
      setSpellCheckLanguages,
      autoUpdateEnabled,
      setAutoUpdateEnabled,
      updateStatus,
      setUpdateStatus,
    }),
    [
      settingsFontSize,
      settingsOpen,
      settingsTab,
      uiScale,
      user,
      profile,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signOut,
      resendVerification,
      spellCheckEnabled,
      spellCheckLanguages,
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
