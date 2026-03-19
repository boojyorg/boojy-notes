import { radius } from "../tokens/radius";
import { fontSize, fontWeight } from "../tokens/typography";
import { spacing } from "../tokens/spacing";

/**
 * Base button style — spread into any button's style prop.
 * Consumers should add their own `background` and `color`.
 */
export const buttonBase = {
  border: "none",
  borderRadius: radius.md,
  padding: `${spacing.sm}px ${spacing.lg}px`,
  fontSize: fontSize.md,
  fontWeight: fontWeight.medium,
  fontFamily: "inherit",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  transition: "background 0.15s, opacity 0.15s",
};
