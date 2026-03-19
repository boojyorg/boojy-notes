import { useTheme } from "../hooks/useTheme";

export default function TitleBar({ activeNote, noteData, chromeBg }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        height: 28,
        background: chromeBg,
        WebkitAppRegion: "drag",
        flexShrink: 0,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: theme.TEXT.secondary,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "40%",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {activeNote && noteData[activeNote]
          ? noteData[activeNote].title + " - Boojy Notes"
          : "Boojy Notes"}
      </span>
    </div>
  );
}
