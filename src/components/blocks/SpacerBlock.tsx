import { useLayoutEffect, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { BAND_REACH, bandFill, withAlpha } from "../../utils/selectionBand";

interface SpacerBlockProps {
  blockId: string;
  isSelected: boolean;
  accentColor: string;
  onSelect: () => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

/**
 * The rule inside the selection band (`utils/selectionBand.ts`) lifts to 40%
 * so the tint does not swallow it.
 */
const RULE_ALPHA = 0.4;

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
        background: isSelected ? bandFill(accentColor, theme.name) : "transparent",
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
