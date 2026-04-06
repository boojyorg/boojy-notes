import { useTheme } from "../hooks/useTheme";

function renderSnippet(snippet, wikilinkMatch, highlightColor) {
  if (!wikilinkMatch || !snippet) return snippet || "";

  // Find the [[wikilinkMatch]] or [[wikilinkMatch|label]] in the snippet
  const wikiRe = new RegExp(
    `\\[\\[${wikilinkMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\|[^\\]]+)?\\]\\]`,
    "i",
  );
  const match = snippet.match(wikiRe);
  if (!match) return snippet;

  const idx = match.index;
  const before = snippet.slice(Math.max(0, idx - 50), idx);
  const after = snippet.slice(idx + match[0].length, idx + match[0].length + 50);
  const prefix = idx > 50 ? "\u2026" : "";
  const suffix = idx + match[0].length + 50 < snippet.length ? "\u2026" : "";

  return (
    <>
      {prefix}
      {before}
      <span style={{ color: highlightColor, fontWeight: 500 }}>{match[0]}</span>
      {after}
      {suffix}
    </>
  );
}

export default function BacklinksPanel({ backlinks, onOpenNote, accentColor }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  if (!backlinks || backlinks.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 32,
        padding: "16px 0",
        borderTop: `1px solid ${BG.divider}`,
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: TEXT.muted,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: 12,
        }}
      >
        Backlinks ({backlinks.length})
      </div>
      {backlinks.map((bl, i) => (
        <div
          key={`${bl.sourceNoteId}-${i}`}
          onClick={() => onOpenNote(bl.sourceNoteId)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            cursor: "pointer",
            transition: "background 0.12s",
            marginBottom: 4,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = BG.hover;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, color: accentColor || ACCENT.primary }}>
            {bl.sourceTitle}
          </div>
          <div
            style={{
              fontSize: 12,
              color: TEXT.muted,
              marginTop: 2,
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {renderSnippet(bl.snippet, bl.wikilinkMatch, accentColor || ACCENT.primary)}
          </div>
        </div>
      ))}
    </div>
  );
}
