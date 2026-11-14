import { useTheme } from "../hooks/useTheme";
import wordmarkLight from "/assets/boojy-notes-wordmark-light.png";
import wordmarkDark from "/assets/boojy-notes-wordmark-dark.png";

/**
 * The Notes wordmark, drawn in the theme's ink.
 *
 * The artwork is two parts: the teal N, which is the same in both themes (the
 * app icon's, `assets/boojy-notes-n.svg`), and "otes" in the theme's
 * `TEXT.primary`. One asset per theme is generated from the N and the black
 * master (`assets/boojy-notes-wordmark.png`) by `dev/wordmarks.sh`;
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
  litMark = false,
}: {
  height: number;
  markOnly?: boolean;
  /** Lay a second N over the artwork's own (`.wordmark-lit`), so CSS can
   *  brighten the N alone: one image cannot be filtered in part. */
  litMark?: boolean;
}) {
  const { isDark } = useTheme();
  const image = (testId?: string) => (
    <img
      src={isDark ? wordmarkDark : wordmarkLight}
      alt=""
      data-testid={testId}
      data-theme={isDark ? "dark" : "light"}
      style={{ height, display: "block", maxWidth: "none" }}
      draggable="false"
    />
  );
  const markWidth = Math.round(height * ASPECT * MARK_SHARE);
  if (markOnly) {
    // The N alone (the phone's Home): the same artwork, shown as far as the N goes.
    return (
      <span
        data-testid="wordmark-mark"
        style={{ display: "block", overflow: "hidden", height, width: markWidth }}
      >
        {image("wordmark")}
      </span>
    );
  }
  if (!litMark) return image("wordmark");
  return (
    <span style={{ position: "relative", display: "block" }}>
      {image("wordmark")}
      <span
        className="wordmark-lit"
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          overflow: "hidden",
          height,
          width: markWidth,
          pointerEvents: "none",
        }}
      >
        {image()}
      </span>
    </span>
  );
}
