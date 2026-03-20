import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

interface LinkTooltipProps {
  url: string | null;
  position: { top: number; left: number } | null;
}

export default function LinkTooltip({ url, position }: LinkTooltipProps) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;

  if (!url || !position) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        color: TEXT.secondary,
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 4,
        maxWidth: 350,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: Z.TOOLBAR,
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {url}
    </div>
  );
}
