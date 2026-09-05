import { useLayoutEffect, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";

interface SpacerBlockProps {
  blockId: string;
  isSelected: boolean;
  accentColor: string;
  onSelect: () => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

/** How far the selection band reaches past the text column on each side. */
const BAND_REACH = 4;

/**
 * The selection band's tint, per theme. Light: accent at 10%, a whisper of
 * teal that still lets the rule read. Dark: the same alpha vanishes against the
 * near-black sheet, so 18%. The rule inside the band lifts to 40% so the tint
 * does not swallow it. Judged live 2026-09-05 against a recoloured 2px rule
 * (read as "a styled line", not "a selected object") and a neutral band (the
 * two greys were three steps apart and the rule disappeared).
 */
const BAND_ALPHA = { day: 0.1, night: 0.18 } as const;
const RULE_ALPHA = 0.4;

/** `#rrggbb` at `alpha`, as rgba() so every stylesheet reader takes it. */
function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * The divider (`---`). A block with no text, addressed as a whole (see
 * `isSelectableBlock`): a click selects it and a tinted band appears around
 * the rule, Backspace or Delete removes it, Enter opens a paragraph under it,
 * and the arrow keys stop on it. No hover state, so the editor stays clean at
 * rest; the band is the one sanctioned accent tint on the desktop, a transient
 * selection state and closer to a focus ring than a surface. The block never
 * changes height.
 *
 * The root registers itself in the block ref map so the gutter grip and drop
 * geometry can see it. It must not share EditableBlock's `elRef`: that ref's
 * repaint effect would replace the rule with a `<br>` (a parsed divider carries
 * `text: ""`).
 */
export default function SpacerBlock({
  blockId,
  isSelected,
  accentColor,
  onSelect,
  registerRef,
}: SpacerBlockProps) {
  const { theme } = useTheme() as {
    theme: { name?: string; BG: Record<string, string> };
  };
  const { BG } = theme;
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    registerRef(blockId, rootRef.current);
    return () => registerRef(blockId, null);
  }, [blockId, registerRef]);

  const bandAlpha = theme.name === "night" ? BAND_ALPHA.night : BAND_ALPHA.day;

  return (
    <div
      ref={rootRef}
      data-block-id={blockId}
      data-block-type="spacer"
      data-selected={isSelected ? "true" : undefined}
      contentEditable="false"
      suppressContentEditableWarning
      onClick={onSelect}
      style={{
        // The band reaches past the column; the negative margin keeps the rule
        // exactly where it sits at rest.
        margin: `0 -${BAND_REACH}px`,
        padding: `8px ${BAND_REACH}px`,
        borderRadius: 4,
        background: isSelected ? withAlpha(accentColor, bandAlpha) : "transparent",
        userSelect: "none",
        cursor: "default",
      }}
    >
      <hr
        style={{
          border: "none",
          borderTop: `1px solid ${isSelected ? withAlpha(accentColor, RULE_ALPHA) : BG.divider}`,
          margin: 0,
        }}
      />
    </div>
  );
}
