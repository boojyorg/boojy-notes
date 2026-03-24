import { useTheme } from "../../hooks/useTheme";

interface SpacerBlockProps {
  blockId: string;
}

export default function SpacerBlock({ blockId }: SpacerBlockProps) {
  const { theme } = useTheme() as { theme: Record<string, Record<string, string>> };
  const { BG } = theme;

  return (
    <div
      data-block-id={blockId}
      contentEditable="false"
      suppressContentEditableWarning
      style={{ padding: "8px 0", userSelect: "none" }}
    >
      <hr style={{ border: "none", borderTop: `1px solid ${BG.divider}`, margin: 0 }} />
    </div>
  );
}
