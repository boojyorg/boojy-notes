import { useTheme } from "../hooks/useTheme";
import { ToastIcon } from "./Icons";
import { Z } from "../constants/zIndex";

export interface LinkDescription {
  /** The URL, or the note's name. */
  label: string;
  /** A note's folder, muted beside the name; `Notes` for the root. */
  sub?: string;
  /** A note, heading or block that is missing, or a name two notes share: the notice's glyph. */
  missing?: boolean;
}

interface LinkTooltipProps {
  description: LinkDescription | null;
  position: { top: number; left: number } | null;
}

/**
 * The destination chip: the tooltip chip's grammar (13px/500 in
 * the primary ink, the elevated ground, a hairline, radius 8, no shadow),
 * 4px under the link, after the same rest a control's chip takes. A web link
 * says its URL; a note link its name with the folder muted beside it; a link
 * that names no note, or two, or a heading or block the note lacks, says so
 * in the same inks, behind the notice's one glyph (the toast's rule: the
 * meaning is the mark, never coloured words), the toast its click shows.
 */
export default function LinkTooltip({ description, position }: LinkTooltipProps) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  if (!description || !position) return null;
  return (
    <div
      className="motion-fade"
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
        color: TEXT.primary,
        maxWidth: 360,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: Z.TOOLBAR,
      }}
    >
      {description.missing && (
        <span
          data-testid="link-tooltip-mark"
          style={{ color: ACCENT.text, display: "flex", alignSelf: "center" }}
        >
          <ToastIcon name="info" size={14} />
        </span>
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{description.label}</span>
      {description.sub && (
        <span
          style={{
            fontWeight: 400,
            color: TEXT.muted,
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
