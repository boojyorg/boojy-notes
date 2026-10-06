import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";

/**
 * A segmented stepper, `[ − | 100% | + ]`: one outlined pill whose segments
 * are flat buttons, the hairline between them their divider. Settings'
 * Interface size and a viewed file's zoom are the same control, so they are
 * drawn by the same two pieces.
 */
export function SegmentGroup({
  children,
  style,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <div
      role="group"
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        height: 30,
        borderRadius: 8,
        border: `1px solid ${theme.button.border}`,
        background: theme.button.bg,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** One segment: flat inside the pill, the hairline its divider. */
export function Segment({
  divider,
  disabled,
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  divider?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  return (
    <button
      type="button"
      className="press"
      aria-disabled={disabled || undefined}
      {...rest}
      onClick={disabled ? undefined : rest.onClick}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = theme.BG.surface;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
      style={{
        height: "100%",
        padding: "0 9px",
        border: "none",
        borderLeft: divider ? `1px solid ${theme.button.border}` : "none",
        background: "transparent",
        color: disabled ? TEXT.muted : TEXT.primary,
        fontSize: 13,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background var(--motion-fast), color var(--motion-fast)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
