import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";

/**
 * Renders a simple subset of markdown: bold, italic, code, code blocks, blockquotes.
 */
function renderMarkdown(text, theme) {
  const { TEXT, BG } = theme;
  const lines = text.split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={elements.length}
          style={{
            background: BG.darkest || BG.dark,
            border: `1px solid ${BG.divider}`,
            borderRadius: 6,
            padding: "10px 12px",
            margin: "6px 0",
            overflow: "auto",
            fontSize: 12,
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            lineHeight: 1.5,
            color: TEXT.primary,
          }}
        >
          {lang && (
            <div style={{ fontSize: 10, color: TEXT.muted, marginBottom: 4, userSelect: "none" }}>
              {lang}
            </div>
          )}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <div
          key={elements.length}
          style={{
            borderLeft: `3px solid ${TEXT.muted}`,
            paddingLeft: 10,
            margin: "4px 0",
            color: TEXT.secondary,
            fontStyle: "italic",
          }}
        >
          {renderInline(line.slice(2), theme)}
        </div>,
      );
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={elements.length} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <div key={elements.length} style={{ margin: "2px 0", lineHeight: 1.55 }}>
        {renderInline(line, theme)}
      </div>,
    );
    i++;
  }

  return elements;
}

function renderInline(text, theme) {
  const { BG } = theme;
  // Process: bold (**text**), italic (*text*), inline code (`code`)
  const parts = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      // Bold
      parts.push(
        <strong key={parts.length} style={{ fontWeight: 600 }}>
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // Italic
      parts.push(
        <em key={parts.length} style={{ fontStyle: "italic" }}>
          {match[3]}
        </em>,
      );
    } else if (match[4]) {
      // Inline code
      parts.push(
        <code
          key={parts.length}
          style={{
            background: BG.surface || BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: 3,
            padding: "1px 4px",
            fontSize: "0.9em",
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
          }}
        >
          {match[4]}
        </code>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function AIChatMessage({ message, accentColor }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const time = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        padding: "4px 12px",
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: 10,
          color: TEXT.muted,
          marginBottom: 3,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600 }}>{isUser ? "You" : "AI"}</span>
        {time && <span>{time}</span>}
      </div>

      {/* Bubble */}
      <div
        style={{
          background: isUser ? (accentColor || BG.surface) + "18" : BG.surface || BG.elevated,
          border: `1px solid ${isUser ? (accentColor || BG.divider) + "30" : BG.divider}`,
          borderRadius: 10,
          padding: "8px 12px",
          maxWidth: "95%",
          fontSize: 13,
          color: TEXT.primary,
          lineHeight: 1.5,
          position: "relative",
          wordBreak: "break-word",
        }}
      >
        {isUser ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
        ) : (
          <div>{message.content ? renderMarkdown(message.content, theme) : <StreamingDots />}</div>
        )}

        {/* Copy button for AI messages */}
        {!isUser && message.content && (
          <button
            onClick={handleCopy}
            style={{
              position: "absolute",
              bottom: 4,
              right: 4,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 10,
              color: TEXT.muted,
              padding: "2px 6px",
              borderRadius: 4,
              fontFamily: "inherit",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = BG.elevated;
              e.currentTarget.style.color = TEXT.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = TEXT.muted;
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}

function StreamingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.4,
            animation: `aiDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes aiDot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 0.8; transform: scale(1.1); }
        }
      `}</style>
    </span>
  );
}
