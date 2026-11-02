import { useTheme } from "../hooks/useTheme";

/** The one tick box's size, a to-do's and a property's alike. */
export const TICK_BOX_SIZE = 16;

/**
 * The drawn box: the accent filled behind a white tick that draws itself
 * (GlobalStyles: `.checkbox-box`, `.checkbox-tick`). Presentation only; its
 * hit area is the caller's (`.checkbox-hit`), which the press squeezes it in.
 */
export default function TickBox({ checked, accentColor }) {
  const { theme } = useTheme();
  const { TEXT, ACCENT } = theme;
  const accent = accentColor ?? ACCENT.primary;
  return (
    <div
      className="checkbox-box"
      aria-hidden="true"
      style={{
        width: TICK_BOX_SIZE,
        height: TICK_BOX_SIZE,
        borderRadius: 3.5,
        boxSizing: "border-box",
        flexShrink: 0,
        border: checked ? `1.5px solid ${accent}` : `1.5px solid ${TEXT.muted}`,
        background: checked ? accent : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        {/* Drawn, not faded: the stroke's dash offset runs (GlobalStyles). */}
        <path
          className="checkbox-tick"
          data-checked={checked ? "true" : "false"}
          pathLength="1"
          d="M2 5L4.2 7.2L8 3"
          stroke={ACCENT.onAccent}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
