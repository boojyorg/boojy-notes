import { radius } from "../tokens/radius";
import { fontSize } from "../tokens/typography";
import { spacing } from "../tokens/spacing";

/**
 * Base input style — spread into any input or textarea's style prop.
 * Consumers should add their own `background`, `color`, and `border` colour.
 */
export const inputBase = {
  width: "100%",
  padding: `${spacing.sm - 1}px ${spacing.md - 2}px`,
  borderRadius: radius.sm,
  fontSize: fontSize.md,
  fontFamily: "inherit",
  outline: "none",
  lineHeight: 1.4,
  transition: "border-color 0.15s",
};
