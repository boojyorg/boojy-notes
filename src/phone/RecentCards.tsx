import { useMemo } from "react";
import { useTheme } from "../hooks/useTheme";
import type { NoteData } from "../types/notes";
import { cardPreview, cardTime, recentlyEdited } from "../utils/recentCards";
import { recencyOf } from "../utils/noteSort";

/** A card's height: the name, three lines of the note, and where and when. */
const CARD_H = 124;

/**
 * Home's recent notes on the phone: the notes edited last, up to four, as a
 * 2 × 2 grid of cards (name, first lines, folder and time), each a way to
 * its note. Fewer notes, fewer cards; none, nothing. No heading: the list's
 * name stands over the cards and the list alike, and a card's time says why
 * it is here. The same whichever way the list is sorted.
 */
export default function RecentCards({
  noteData,
  editedAt,
  onOpen,
  inset,
  now = Date.now(),
}: {
  noteData: NoteData;
  editedAt: Record<string, number>;
  onOpen: (id: string, event: React.MouseEvent) => void;
  /** The list's left edge, which the heading and the grid keep. */
  inset: number;
  now?: number;
}) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  const ids = useMemo(() => recentlyEdited(noteData, editedAt), [noteData, editedAt]);
  if (ids.length === 0) return null;
  return (
    <section
      aria-label="Recent"
      data-testid="recent-cards"
      style={{ padding: `4px ${inset}px 16px` }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {ids.map((id) => {
          const note = noteData[id];
          const lines = cardPreview(note);
          // The folder it is in, not the path to it: the time must fit beside it.
          const where = [
            note.folder?.split("/").pop(),
            cardTime(recencyOf(id, noteData, editedAt), now),
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <button
              key={id}
              type="button"
              className="press"
              data-testid="recent-card"
              onClick={(e) => onOpen(id, e)}
              style={{
                display: "flex",
                flexDirection: "column",
                height: CARD_H,
                minWidth: 0,
                boxSizing: "border-box",
                padding: "12px 12px 10px",
                border: `1px solid ${BG.divider}`,
                borderRadius: 14,
                background: BG.editor,
                color: TEXT.primary,
                font: "inherit",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: "20px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                  color: note.title ? TEXT.primary : TEXT.muted,
                }}
              >
                {note.title || "Untitled"}
              </span>
              <span
                style={{
                  flexGrow: 1,
                  minHeight: 0,
                  marginTop: 4,
                  fontSize: 13,
                  lineHeight: "18px",
                  color: TEXT.secondary,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitBoxOrient: "vertical",
                  WebkitLineClamp: 3,
                  // A line per block, as the note has them.
                  whiteSpace: "pre-line",
                  overflowWrap: "anywhere",
                }}
              >
                {lines.join("\n") || " "}
              </span>
              <span
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  lineHeight: "16px",
                  color: TEXT.muted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}
              >
                {where}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
