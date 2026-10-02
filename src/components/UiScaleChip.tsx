import { useEffect, useRef } from "react";
import { useExitGhost } from "../hooks/useExitGhost";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { shortcutLabel } from "./Tooltip";

/** How long the readout stays after the last press: one beat, then gone. */
export const SCALE_HINT_MS = 1400;

export interface ScaleHint {
  /** When the press happened — a new object per press, so a repeat re-times it. */
  at: number;
  scale: number;
}

interface UiScaleChipProps {
  hint: ScaleHint | null;
  onHide: () => void;
  /** Where the editor pane starts, so the chip is centred on the note, not the window. */
  left: number;
}

/**
 * What the UI scale is now, said once, after a scale shortcut.
 *
 * The scale is otherwise invisible: `Cmd+±` changed the size of everything
 * with nothing to say what it had changed it to, and `Cmd+0` was the only way
 * back with nothing to say so. The chip is the tooltip's surface and grammar
 * (13px/500 in primary ink, the shortcut a step smaller on a grey pill), with
 * the menus' shadow, because it floats free over the sheet rather than
 * labelling a control beneath it. Below 100% or above it, it carries the reset
 * shortcut; at 100% there is nothing to reset to, so it is the figure alone.
 *
 * It never takes the pointer, and it is centred on the editor pane rather than
 * the window, for the reason the toast stack is.
 */
export default function UiScaleChip({ hint, onHide, left }: UiScaleChipProps) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const chipRef = useRef<HTMLDivElement>(null);
  useExitGhost(chipRef, !!hint);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(onHide, SCALE_HINT_MS);
    return () => clearTimeout(timer);
  }, [hint, onHide]);

  if (!hint) return null;
  const atDefault = hint.scale === 100;
  return (
    <div
      ref={chipRef}
      style={{
        position: "fixed",
        bottom: 24,
        left,
        right: 24,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: Z.TOAST,
      }}
    >
      <span
        className="motion-pop motion-from-center"
        role="status"
        aria-live="polite"
        data-testid="ui-scale-chip"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: atDefault ? "5px 10px" : "5px 6px 5px 10px",
          borderRadius: 8,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          boxShadow: theme.modalShadow,
          color: TEXT.primary,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: "18px",
          whiteSpace: "nowrap",
        }}
      >
        <span>{`Interface size ${hint.scale}%`}</span>
        {!atDefault && (
          // The pill holds the key and nothing else, as every shortcut pill in
          // the app does, so it reads as a key and never as prose; the word
          // that says what the key does sits beside it.
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                lineHeight: "14px",
                padding: "1px 5px",
                borderRadius: 5,
                background: BG.surface,
                color: TEXT.secondary,
              }}
            >
              {shortcutLabel({ key: "0" })}
            </span>
            <span style={{ fontSize: 12, fontWeight: 400, color: TEXT.secondary }}>resets</span>
          </span>
        )}
      </span>
    </div>
  );
}
