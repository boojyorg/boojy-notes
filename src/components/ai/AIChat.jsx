import { useRef, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import AIChatMessage from "./AIChatMessage";
import AIChatInput from "./AIChatInput";

export default function AIChat({
  tabId,
  messages,
  isStreaming,
  error,
  onSend,
  onCancel,
  aiSettings,
  onModelChange,
  onOpenSettings,
  noteContext: _noteContext,
  sendContext,
  onToggleContext,
  accentColor,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const scrollRef = useRef(null);

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const hasApiKey = !!aiSettings?.apiKey;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: `1px solid ${BG.divider}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: TEXT.primary }}>
            <span style={{ opacity: 0.7, marginRight: 3 }}>&#10022;</span>
            AI
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Context toggle */}
          <button
            onClick={onToggleContext}
            title={sendContext ? "Context: on — sending note content" : "Context: off"}
            style={{
              background: "transparent",
              border: `1px solid ${sendContext ? ACCENT.primary + "50" : BG.divider}`,
              borderRadius: 10,
              padding: "1px 8px",
              fontSize: 10,
              color: sendContext ? ACCENT.primary : TEXT.muted,
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 500,
              transition: "all 0.15s",
            }}
          >
            ctx: {sendContext ? "on" : "off"}
          </button>
          {/* Settings gear */}
          <button
            onClick={onOpenSettings}
            title="AI Settings"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: TEXT.muted,
              padding: 2,
              display: "flex",
              alignItems: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = TEXT.primary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = TEXT.muted)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 10a2 2 0 100-4 2 2 0 000 4z" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M13.4 8.8a1.2 1.2 0 000-1.6l-.4-.4a1.2 1.2 0 01-.2-1.3l.2-.4a1.2 1.2 0 00-.5-1.5l-.5-.3a1.2 1.2 0 01-.6-1.1V1.8a1.2 1.2 0 00-1.2-1h-.6a1.2 1.2 0 01-1.1-.6L8.2.8a1.2 1.2 0 00-1.5.5l-.3.5a1.2 1.2 0 01-1.1.6H4.8a1.2 1.2 0 00-1 1.2v.6a1.2 1.2 0 01-.6 1.1l-.4.2a1.2 1.2 0 00-.5 1.5l.3.5a1.2 1.2 0 010 1.3l-.3.5a1.2 1.2 0 00.5 1.5l.4.2a1.2 1.2 0 01.6 1.1v.6a1.2 1.2 0 001 1.2h.6a1.2 1.2 0 011.1.6l.2.4a1.2 1.2 0 001.5.5l.5-.3a1.2 1.2 0 011.3 0l.5.3a1.2 1.2 0 001.5-.5l.2-.4a1.2 1.2 0 011.1-.6h.6a1.2 1.2 0 001-1.2v-.6a1.2 1.2 0 01.6-1.1l.4-.2z"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: "auto",
          padding: "8px 0",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {!hasApiKey && messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: TEXT.muted,
              fontSize: 12,
              padding: 20,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 20, opacity: 0.5 }}>&#10022;</span>
            <span>No API key configured.</span>
            <button
              onClick={onOpenSettings}
              style={{
                background: "transparent",
                border: `1px solid ${BG.divider}`,
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                color: ACCENT.primary,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Open AI Settings
            </button>
          </div>
        )}

        {hasApiKey && messages.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: TEXT.muted,
              fontSize: 12,
              gap: 4,
            }}
          >
            <span style={{ fontSize: 20, opacity: 0.5 }}>&#10022;</span>
            <span>Ask anything about your note</span>
          </div>
        )}

        {messages.map((msg, i) => (
          <AIChatMessage key={i} message={msg} accentColor={accentColor} />
        ))}

        {error && (
          <div
            style={{
              padding: "6px 12px",
              fontSize: 12,
              color: theme.SEMANTIC?.error || "#f44",
            }}
          >
            Error: {error}
          </div>
        )}
      </div>

      {/* Input area */}
      <AIChatInput
        onSend={(text) => onSend(tabId, text)}
        isStreaming={isStreaming}
        onCancel={() => onCancel(tabId)}
        provider={aiSettings?.provider || "anthropic"}
        model={aiSettings?.model || ""}
        onModelChange={onModelChange}
      />
    </div>
  );
}
