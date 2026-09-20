import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

export interface LinkDescription {
  /** The URL, or the note's name. */
  label: string;
  /** A note's folder, muted beside the name; `Notes` for the root. */
  sub?: string;
  /** A note that is missing or ambiguous: the chip in the error ink. */
  missing?: boolean;
}

interface LinkTooltipProps {
  description: LinkDescription | null;
  position: { top: number; left: number } | null;
}

/**
 * The destination chip (2026-09-20): the tooltip chip's grammar (13px/500 in
 * the primary ink, the elevated ground, a hairline, radius 8, no shadow),
 * 4px under the link, after the same rest a control's chip takes. A web link
 * says its URL; a note link its name with the folder muted beside it; a link
 * that names no note, or two, says so in the error ink.
 */
export default function LinkTooltip({ description, position }: LinkTooltipProps) {
  const { theme } = useTheme() as { theme: Record<string, Record<string, string>> };
  const { BG, TEXT, SEMANTIC } = theme;

  if (!description || !position) return null;
  const ink = description.missing ? SEMANTIC.error : TEXT.primary;
  return (
    <div
      role="tooltip"
      data-testid="link-tooltip"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        display: "flex",
        alignItems: "baseline",
        gap: 6,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 8,
        padding: "5px 10px",
        fontSize: 13,
        fontWeight: 500,
        lineHeight: "18px",
        color: ink,
        maxWidth: 360,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: Z.TOOLBAR,
        animation: "fadeIn 0.1s ease-out",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{description.label}</span>
      {description.sub && (
        <span
          style={{
            fontWeight: 400,
            color: description.missing ? ink : TEXT.muted,
            opacity: description.missing ? 0.8 : 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {description.sub}
        </span>
      )}
    </div>
  );
}
