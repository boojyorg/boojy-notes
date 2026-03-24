import { useState, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useSettings } from "../../context/SettingsContext";
import { useLayout } from "../../context/LayoutContext";
import { PROVIDERS, getModelsForProvider } from "../../services/ai/models";
import { isElectron } from "../../utils/platform";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";

export default function AITab({ isDesktop, onAIKeyTest, SectionHeader }) {
  const { aiSettings, updateAISetting, saveAIKey } = useSettings();
  const { accentColor } = useLayout();

  const { theme } = useTheme();
  const { TEXT, SEMANTIC } = theme;

  const [aiKeyInput, setAiKeyInput] = useState(aiSettings?.apiKey || "");
  const [showAiKey, setShowAiKey] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState(null); // null | "testing" | "success" | "error"

  // Sync local key input when api key loads asynchronously
  useEffect(() => {
    if (aiSettings?.apiKey && !aiKeyInput) {
      setAiKeyInput(aiSettings.apiKey);
    }
  }, [aiSettings?.apiKey]);

  return (
    <div>
      <SectionHeader title="AI" />

      {/* Provider */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: TEXT.muted, display: "block", marginBottom: 5 }}>
          Provider
        </span>
        <select
          value={aiSettings?.provider || "anthropic"}
          onChange={(e) => {
            updateAISetting("provider", e.target.value);
            setAiKeyInput("");
            setAiTestStatus(null);
          }}
          style={{
            width: "100%",
            padding: "7px 10px",
            background: theme.overlay(0.04),
            border: `1px solid ${theme.overlay(0.08)}`,
            borderRadius: radius.default,
            color: TEXT.primary,
            fontSize: fontSize.md,
            fontFamily: "inherit",
            outline: "none",
            cursor: "pointer",
            appearance: "none",
            WebkitAppearance: "none",
          }}
        >
          {Object.values(PROVIDERS).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: TEXT.muted, display: "block", marginBottom: 5 }}>
          Model
        </span>
        {aiSettings?.provider === "local" ? (
          <input
            type="text"
            value={aiSettings?.model || ""}
            onChange={(e) => updateAISetting("model", e.target.value)}
            placeholder="e.g. llama3"
            style={{
              width: "100%",
              padding: "7px 10px",
              background: theme.overlay(0.04),
              border: `1px solid ${theme.overlay(0.08)}`,
              borderRadius: radius.default,
              color: TEXT.primary,
              fontSize: fontSize.md,
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        ) : (
          <select
            value={aiSettings?.model || ""}
            onChange={(e) => updateAISetting("model", e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px",
              background: theme.overlay(0.04),
              border: `1px solid ${theme.overlay(0.08)}`,
              borderRadius: radius.default,
              color: TEXT.primary,
              fontSize: fontSize.md,
              fontFamily: "inherit",
              outline: "none",
              cursor: "pointer",
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            {getModelsForProvider(aiSettings?.provider || "anthropic").map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* API Key */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: TEXT.muted, display: "block", marginBottom: 5 }}>
          API Key{aiSettings?.provider === "local" ? " (optional)" : ""}
        </span>
        {!isElectron && aiSettings?.provider !== "local" && (
          <span
            style={{
              fontSize: 11,
              color: SEMANTIC.warning,
              display: "block",
              marginBottom: 5,
            }}
          >
            Keys are stored in browser local storage (not encrypted).
          </span>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type={showAiKey ? "text" : "password"}
            value={aiKeyInput}
            onChange={(e) => {
              setAiKeyInput(e.target.value);
              setAiTestStatus(null);
            }}
            onBlur={() => {
              if (aiKeyInput !== (aiSettings?.apiKey || "")) {
                saveAIKey(aiKeyInput);
              }
            }}
            placeholder={
              aiSettings?.provider === "anthropic"
                ? "sk-ant-..."
                : aiSettings?.provider === "openai"
                  ? "sk-..."
                  : "API key"
            }
            style={{
              flex: 1,
              padding: "7px 10px",
              background: theme.overlay(0.04),
              border: `1px solid ${theme.overlay(0.08)}`,
              borderRadius: radius.default,
              color: TEXT.primary,
              fontSize: fontSize.md,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <button
            onClick={() => setShowAiKey((v) => !v)}
            style={{
              background: theme.overlay(0.04),
              border: `1px solid ${theme.overlay(0.08)}`,
              borderRadius: radius.default,
              padding: `0 ${spacing.sm}px`,
              cursor: "pointer",
              color: TEXT.muted,
              fontSize: fontSize.md,
              fontFamily: "inherit",
            }}
          >
            {showAiKey ? "Hide" : "Show"}
          </button>
          <button
            onClick={async () => {
              if (!aiKeyInput) return;
              setAiTestStatus("testing");
              // Save key first
              await saveAIKey(aiKeyInput);
              try {
                if (onAIKeyTest) {
                  await onAIKeyTest();
                }
                setAiTestStatus("success");
              } catch {
                setAiTestStatus("error");
              }
              setTimeout(() => setAiTestStatus(null), 3000);
            }}
            disabled={!aiKeyInput || aiTestStatus === "testing"}
            style={{
              background: theme.overlay(0.04),
              border: `1px solid ${theme.overlay(0.08)}`,
              borderRadius: radius.default,
              padding: `0 ${spacing.sm}px`,
              cursor: aiKeyInput ? "pointer" : "default",
              color:
                aiTestStatus === "success"
                  ? SEMANTIC?.success || "#4caf50"
                  : aiTestStatus === "error"
                    ? SEMANTIC?.error || "#f44"
                    : TEXT.muted,
              fontSize: fontSize.sm,
              fontFamily: "inherit",
              fontWeight: fontWeight.medium,
              opacity: aiKeyInput ? 1 : 0.5,
            }}
          >
            {aiTestStatus === "testing"
              ? "..."
              : aiTestStatus === "success"
                ? "OK"
                : aiTestStatus === "error"
                  ? "Fail"
                  : "Test"}
          </button>
        </div>
        <span style={{ fontSize: 11, color: TEXT.muted, marginTop: 4, display: "block" }}>
          {isDesktop
            ? "Stored securely on this device."
            : "Stored in browser storage on this device."}
        </span>
      </div>

      {/* Advanced section */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: spacing.xl,
          marginBottom: spacing.md,
        }}
      >
        <span
          style={{
            fontSize: fontSize.xs,
            fontWeight: fontWeight.semibold,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: TEXT.muted,
            whiteSpace: "nowrap",
          }}
        >
          Advanced
        </span>
        <div style={{ flex: 1, height: 1, background: theme.overlay(0.06) }} />
      </div>

      {/* Base URL */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: TEXT.muted, display: "block", marginBottom: 5 }}>
          Base URL (optional)
        </span>
        <input
          type="text"
          value={aiSettings?.baseUrl || ""}
          onChange={(e) => updateAISetting("baseUrl", e.target.value)}
          placeholder={
            PROVIDERS[aiSettings?.provider || "anthropic"]?.defaultBaseUrl ||
            "https://api.anthropic.com"
          }
          style={{
            width: "100%",
            padding: "7px 10px",
            background: theme.overlay(0.04),
            border: `1px solid ${theme.overlay(0.08)}`,
            borderRadius: radius.default,
            color: TEXT.primary,
            fontSize: fontSize.md,
            fontFamily: "inherit",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <span style={{ fontSize: 11, color: TEXT.muted, marginTop: 3, display: "block" }}>
          Override for proxies or local models
        </span>
      </div>

      {/* Send note as context toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "2px 0",
          marginBottom: 14,
        }}
      >
        <div>
          <span style={{ fontSize: 13, color: TEXT.muted }}>Send note as context</span>
          <div style={{ fontSize: 11, color: TEXT.muted, marginTop: 2 }}>
            AI reads your active note for relevance.
          </div>
        </div>
        <div
          onClick={() => updateAISetting("sendContext", !(aiSettings?.sendContext !== false))}
          style={{
            width: 36,
            height: 20,
            borderRadius: 10,
            background: aiSettings?.sendContext !== false ? accentColor : theme.overlay(0.06),
            border: aiSettings?.sendContext !== false ? "none" : `1px solid ${theme.overlay(0.08)}`,
            position: "relative",
            cursor: "pointer",
            transition: "background 0.15s",
            flexShrink: 0,
            marginLeft: spacing.md,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#fff",
              position: "absolute",
              top: 3,
              left: aiSettings?.sendContext !== false ? 19 : 3,
              transition: "left 0.15s",
            }}
          />
        </div>
      </div>

      {/* Max Tokens */}
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: TEXT.muted, display: "block", marginBottom: 5 }}>
          Max Tokens
        </span>
        <input
          type="number"
          value={aiSettings?.maxTokens || 4096}
          onChange={(e) => updateAISetting("maxTokens", parseInt(e.target.value, 10) || 4096)}
          min={256}
          max={128000}
          style={{
            width: 120,
            padding: "7px 10px",
            background: theme.overlay(0.04),
            border: `1px solid ${theme.overlay(0.08)}`,
            borderRadius: radius.default,
            color: TEXT.primary,
            fontSize: fontSize.md,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}
