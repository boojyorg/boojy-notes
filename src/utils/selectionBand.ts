/**
 * The selection's one colour: the band on a block addressed as a whole (a
 * divider, a table, a run of text blocks) and the editor's text selection
 * alike, so "selected" looks the same however it was made. The one
 * sanctioned accent tint on the desktop: a transient state, closer to a focus
 * ring than a surface. Stronger by opacity, never saturation (a more
 * saturated teal reads blue); kept below the ==highlight==, which is the same
 * teal at 35–40%, so a selected word and a highlighted one stay apart.
 */
export const BAND_ALPHA = { day: 0.2, night: 0.26 } as const;

/** How far the band reaches past the text column on each side. */
export const BAND_REACH = 4;

/** `#rrggbb` at `alpha`, as rgba() so every stylesheet reader takes it. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The band's fill for a theme (`theme.name`: `day` or `night`). */
export function bandFill(accent: string, themeName: string | undefined): string {
  return withAlpha(accent, themeName === "night" ? BAND_ALPHA.night : BAND_ALPHA.day);
}

/**
 * An image's selection wash: the band's tint laid over the picture itself, a
 * step stronger because a picture is busier than an empty row (judged on the
 * prototype, 2026-09-23: the band's 10% vanished into a white picture).
 */
export const IMAGE_WASH_ALPHA = { day: 0.2, night: 0.26 } as const;

/** The wash over a selected image for a theme (`theme.name`: `day` or `night`). */
export function imageWashFill(accent: string, themeName: string | undefined): string {
  return withAlpha(accent, themeName === "night" ? IMAGE_WASH_ALPHA.night : IMAGE_WASH_ALPHA.day);
}
