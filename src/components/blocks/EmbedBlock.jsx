import { useNoteData } from "../../context/NoteDataContext";
import { useTheme } from "../../hooks/useTheme";
import { inlineMarkdownToHtml } from "../../utils/inlineFormatting";
import { wikilinkStatus } from "../../utils/wikilinkTarget";

/**
 * `![[Note]]`: the note's first blocks, read from the vault's live note data,
 * so the embed follows edits to its note (a snapshot handed down at render
 * kept the old text until the editor repainted).
 */
function EmbedBlock(props) {
  const { noteData } = useNoteData();
  return <EmbedView {...props} noteData={noteData} />;
}

function EmbedView({ block, noteData, accentColor, onNavigate, depth = 0 }) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  if (depth >= 3) {
    return (
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px dashed ${TEXT.muted}`,
          color: TEXT.muted,
          fontSize: 12,
        }}
      >
        Embed depth limit reached
      </div>
    );
  }

  // The note the target names, as a click on `[[target]]` resolves it
  // (utils/wikilinkTarget): a folder path is the path, and a name two notes
  // share is shown as such, never guessed.
  const status = wikilinkStatus(block.target ?? "", noteData);
  const targetNote = status.kind === "note" ? noteData[status.id] : null;

  if (!targetNote) {
    return (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 8,
          border: `1px dashed ${TEXT.muted}`,
          color: TEXT.muted,
          fontSize: 13,
        }}
      >
        {status.kind === "ambiguous"
          ? `"${block.target}" names ${status.ids.length} notes`
          : `"${block.target}" not found`}
      </div>
    );
  }

  let blocks = targetNote.content?.blocks || [];
  if (block.heading) {
    const idx = blocks.findIndex(
      (b) =>
        ["h1", "h2", "h3"].includes(b.type) &&
        (b.text || "").replace(/\*\*/g, "").replace(/\*/g, "").trim().toLowerCase() ===
          block.heading.toLowerCase(),
    );
    if (idx >= 0) {
      const level = { h1: 1, h2: 2, h3: 3 }[blocks[idx].type];
      let end = blocks.length;
      for (let i = idx + 1; i < blocks.length; i++) {
        const bl = { h1: 1, h2: 2, h3: 3 }[blocks[i].type];
        if (bl && bl <= level) {
          end = i;
          break;
        }
      }
      blocks = blocks.slice(idx, end);
    }
  }

  return (
    <div
      style={{
        borderLeft: `3px solid ${accentColor}`,
        background: `${accentColor}08`,
        borderRadius: 6,
        padding: "12px 16px",
        cursor: "pointer",
      }}
      onClick={() => onNavigate?.(targetNote.id)}
    >
      <div
        style={{
          fontSize: 12,
          color: TEXT.secondary,
          marginBottom: 8,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {targetNote.title}
          {block.heading ? ` > ${block.heading}` : ""}
        </span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>open &rarr;</span>
      </div>
      <div style={{ fontSize: 13, color: TEXT.primary, pointerEvents: "none" }}>
        {blocks.slice(0, 10).map((b) => {
          if (b.type === "embed") {
            return (
              <div
                key={b.id}
                style={{
                  paddingLeft: 8,
                  borderLeft: `2px solid ${accentColor}40`,
                  margin: "4px 0",
                }}
              >
                <EmbedView
                  block={b}
                  noteData={noteData}
                  accentColor={accentColor}
                  depth={depth + 1}
                />
              </div>
            );
          }
          return (
            <div
              key={b.id}
              dangerouslySetInnerHTML={{
                __html: inlineMarkdownToHtml(b.text || "", new Set()),
              }}
              style={{ margin: "2px 0" }}
            />
          );
        })}
      </div>
    </div>
  );
}

export { EmbedView };
export default EmbedBlock;
