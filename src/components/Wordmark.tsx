import { useTheme } from "../hooks/useTheme";
import wordmarkLight from "/assets/boojy-notes-wordmark-light.png";
import wordmarkDark from "/assets/boojy-notes-wordmark-dark.png";

/**
 * The Notes wordmark, drawn in the theme's ink.
 *
 * The artwork is two colours: the cyan N, which is the same in both themes, and
 * "otes" in the theme's `TEXT.primary`. One asset per theme is generated from
 * the black master (`assets/boojy-notes-wordmark.png`) by the command in the UI
 * rule; the master itself is never drawn. Before this the black master was
 * drawn in both themes, and in Dark "otes" sat near-black on the dark ground.
 * The asset is chosen by theme rather than filtered in CSS because an
 * `invert()` would also turn the N into its complement.
 */
export default function Wordmark({ height }: { height: number }) {
  const { isDark } = useTheme();
  return (
    <img
      src={isDark ? wordmarkDark : wordmarkLight}
      alt=""
      data-testid="wordmark"
      data-theme={isDark ? "dark" : "light"}
      style={{ height, display: "block" }}
      draggable="false"
    />
  );
}
