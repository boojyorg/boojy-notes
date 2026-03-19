import { useTheme } from "../../hooks/useTheme";
import { inlineMarkdownToHtml } from "../../utils/inlineFormatting";

function EmbedBlock({ block, noteData, accentColor, onNavigate, depth = 0 }) {
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

  const targetNote = noteData
    ? Object.values(noteData).find((n) => n.title?.toLowerCase() === block.target?.toLowerCase())
    : null;

  if (!targetNote) {
    return (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 8,
          border: `1px dashed ${TEXT.muted}`,
          color: TEXT.muted,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>&quot;{block.target}&quot; not found</span>
        <button
          onClick={() => onNavigate && onNavigate(block.target, true)}
          style={{
            background: "none",
            border: `1px solid ${TEXT.muted}`,
            borderRadius: 4,
            color: TEXT.muted,
            fontSize: 11,
            padding: "2px 8px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Create note
        </button>
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
      onClick={() => onNavigate && onNavigate(targetNote.id)}
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
                <EmbedBlock
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

export default EmbedBlock;
