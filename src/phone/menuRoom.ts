/**
 * Where a menu under the caret fits on the phone: between the note's header
 * and the bar above the keyboard, never over either, and never over the line
 * it belongs to. Below the line when that side has room for the whole cap (or
 * more room than above), else above it; as tall as its side allows, up to
 * `cap`. All values in the viewport's pixels.
 */
export function menuRoom({
  lineTop,
  lineBottom,
  bandTop,
  bandBottom,
  cap,
  gap = 4,
}: {
  lineTop: number;
  lineBottom: number;
  bandTop: number;
  bandBottom: number;
  cap: number;
  gap?: number;
}): { side: "below" | "above"; height: number } {
  const below = bandBottom - lineBottom - 2 * gap;
  const above = lineTop - bandTop - 2 * gap;
  const side = below >= cap || below >= above ? "below" : "above";
  return { side, height: Math.max(0, Math.min(cap, side === "below" ? below : above)) };
}
