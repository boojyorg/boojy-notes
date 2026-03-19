import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import { getModelsForProvider } from "../../services/ai/models";

export default function AIChatInput({
  onSend,
  isStreaming,
  onCancel,
  provider,
  model,
  onModelChange,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const models = getModelsForProvider(provider);

  return (
    <div
      style={{
        borderTop: `1px solid ${BG.divider}`,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your note..."
          rows={1}
          style={{
            flex: 1,
            background: BG.surface || BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            color: TEXT.primary,
            fontFamily: "inherit",
            resize: "none",
            outline: "none",
            lineHeight: 1.4,
            maxHeight: 96,
            overflow: "auto",
          }}
        />
        {isStreaming ? (
          <button
            onClick={onCancel}
            style={{
              background: BG.surface || BG.elevated,
              border: `1px solid ${BG.divider}`,
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: TEXT.secondary,
              cursor: "pointer",
              fontFamily: "inherit",
              flexShrink: 0,
              fontWeight: 500,
            }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!value.trim()}
            style={{
              background: value.trim() ? ACCENT.primary : BG.surface || BG.elevated,
              border: "none",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: value.trim() ? "#fff" : TEXT.muted,
              cursor: value.trim() ? "pointer" : "default",
              fontFamily: "inherit",
              flexShrink: 0,
              fontWeight: 500,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            Send
          </button>
        )}
      </div>

      {/* Model selector chip */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setModelPickerOpen((v) => !v)}
          style={{
            background: "transparent",
            border: `1px solid ${BG.divider}`,
            borderRadius: 12,
            padding: "2px 10px",
            fontSize: 11,
            color: TEXT.muted,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = TEXT.secondary)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = BG.divider)}
        >
          {model}
          <span style={{ fontSize: 8 }}>&#9660;</span>
        </button>

        {modelPickerOpen && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 99 }}
              onClick={() => setModelPickerOpen(false)}
            />
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: 4,
                background: BG.elevated,
                border: `1px solid ${BG.divider}`,
                borderRadius: 6,
                padding: "4px 0",
                zIndex: 100,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                minWidth: 160,
              }}
            >
              {models.map((m) => (
                <div
                  key={m.id}
                  onClick={() => {
                    onModelChange(m.id);
                    setModelPickerOpen(false);
                  }}
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    color: m.id === model ? ACCENT.primary : TEXT.primary,
                    cursor: "pointer",
                    fontWeight: m.id === model ? 600 : 400,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = BG.surface)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
