import { useTheme } from "../hooks/useTheme";
import wordmarkLight from "/assets/boojy-notes-wordmark-light.png";
import wordmarkDark from "/assets/boojy-notes-wordmark-dark.png";

/**
 * The Notes wordmark, drawn in the theme's ink.
 *
 * The artwork is two colours: the cyan N, which is the same in both themes, and
 * "otes" in the theme's `TEXT.primary`. One asset per theme is generated from
 * the black master (`assets/boojy-notes-wordmark.png`) by `dev/wordmarks.sh`;
 * the master itself is never drawn (in Dark its "otes" would be near-black).
 * The asset is chosen by theme rather than filtered in CSS because an
 * `invert()` would also turn the N into its complement.
 */
/** The N's share of the artwork's width, and the artwork's shape (858 × 226; the N ends at 171). */
const MARK_SHARE = 171 / 858;
const ASPECT = 858 / 226;

export default function Wordmark({
  height,
  markOnly = false,
}: {
  height: number;
  markOnly?: boolean;
}) {
  const { isDark } = useTheme();
  const img = (
    <img
      src={isDark ? wordmarkDark : wordmarkLight}
      alt=""
      data-testid="wordmark"
      data-theme={isDark ? "dark" : "light"}
      style={{ height, display: "block", maxWidth: "none" }}
      draggable="false"
    />
  );
  if (!markOnly) return img;
  // The N alone (the phone's Home): the same artwork, shown as far as the N goes.
  return (
    <span
      data-testid="wordmark-mark"
      style={{
        display: "block",
        overflow: "hidden",
        height,
        width: Math.round(height * ASPECT * MARK_SHARE),
      }}
    >
      {img}
    </span>
  );
}
