import { useLayoutEffect, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";

interface SpacerBlockProps {
  blockId: string;
  isSelected: boolean;
  accentColor: string;
  onSelect: () => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

/** The block's height at rest and selected: 8px above, the rule, 8px below. */
const HEIGHT = 17;

/**
 * The divider (`---`). A block with no text, addressed as a whole (see
 * `isSelectableBlock`): a click selects it and the rule turns accent at 2px,
 * Backspace or Delete removes it, Enter opens a paragraph under it, and the
 * arrow keys stop on it. No hover state, so the editor stays clean at rest;
 * accent is a marker here, never a surface. The thicker rule takes its extra
 * pixel from the padding below so the block never changes height.
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
  const { theme } = useTheme() as { theme: Record<string, Record<string, string>> };
  const { BG } = theme;
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    registerRef(blockId, rootRef.current);
    return () => registerRef(blockId, null);
  }, [blockId, registerRef]);

  const thickness = isSelected ? 2 : 1;

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
        padding: `8px 0 ${HEIGHT - 8 - thickness}px`,
        userSelect: "none",
        cursor: "default",
      }}
    >
      <hr
        style={{
          border: "none",
          borderTop: `${thickness}px solid ${isSelected ? accentColor : BG.divider}`,
          margin: 0,
        }}
      />
    </div>
  );
}
