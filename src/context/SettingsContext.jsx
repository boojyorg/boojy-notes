import { createContext, useState, useEffect, useCallback, useContext, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import { readKey, storeKey } from "../services/ai/keyStorage";
import { getDefaultModel } from "../services/ai/models";
import { isElectron } from "../utils/platform";
import { getAPI } from "../services/apiProvider";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settingsFontSize, setSettingsFontSize] = useState(15);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");

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

  // AI Settings state
  const [aiSettings, setAISettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("boojy-ai-settings"));
      return {
        provider: saved?.provider || "anthropic",
        model: saved?.model || "claude-sonnet-4-6",
        baseUrl: saved?.baseUrl || "",
        maxTokens: saved?.maxTokens || 4096,
        sendContext: saved?.sendContext !== false,
        apiKey: "", // loaded async below
      };
    } catch {
      return {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        baseUrl: "",
        maxTokens: 4096,
        sendContext: true,
        apiKey: "",
      };
    }
  });

  // Load API key on mount and when provider changes
  useEffect(() => {
    readKey(aiSettings.provider).then((key) => {
      setAISettings((prev) => ({ ...prev, apiKey: key || "" }));
    });
  }, [aiSettings.provider]);

  // Persist non-secret AI settings
  useEffect(() => {
    const { apiKey: _apiKey, ...rest } = aiSettings;
    localStorage.setItem("boojy-ai-settings", JSON.stringify(rest));
  }, [aiSettings]);

  const updateAISetting = useCallback((key, value) => {
    setAISettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "provider") {
        next.model = getDefaultModel(value);
      }
      return next;
    });
  }, []);

  const saveAIKey = useCallback(
    async (key) => {
      await storeKey(aiSettings.provider, key);
      setAISettings((prev) => ({ ...prev, apiKey: key }));
    },
    [aiSettings.provider],
  );

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
      aiSettings,
      setAISettings,
      updateAISetting,
      saveAIKey,
    }),
    [
      settingsFontSize,
      settingsOpen,
      settingsTab,
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
      aiSettings,
      updateAISetting,
      saveAIKey,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
