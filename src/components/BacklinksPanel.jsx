import { BG, TEXT, ACCENT } from "../constants/colors";

export default function BacklinksPanel({ backlinks, onOpenNote, accentColor }) {
  if (!backlinks || backlinks.length === 0) return null;

  return (
    <div style={{
      marginTop: 32,
      padding: "16px 0",
      borderTop: `1px solid ${BG.divider}`,
    }}>
      <div style={{
        fontSize: 12,
        fontWeight: 600,
        color: TEXT.muted,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        marginBottom: 12,
      }}>
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
          onMouseEnter={(e) => { e.currentTarget.style.background = BG.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, color: accentColor || ACCENT.primary }}>
            {bl.sourceTitle}
          </div>
          <div style={{
            fontSize: 12,
            color: TEXT.muted,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {bl.snippet}
          </div>
        </div>
      ))}
    </div>
  );
}
