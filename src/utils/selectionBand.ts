/**
 * The whole-block selection band, shared by every block that is addressed as
 * a whole (a divider, a table; see `isSelectableBlock`). The one sanctioned
 * accent tint on the desktop: a transient selection state, closer to a focus
 * ring than a surface.
 *
 * Light: accent at 10%, a whisper of teal that still lets the content read.
 * Dark: the same alpha vanishes against the near-black sheet, so 18%. Judged
 * live 2026-09-05 on the divider against a recoloured rule (read as "a styled
 * line", not "a selected object") and a neutral band (two greys three steps
 * apart, and the rule disappeared).
 */
export const BAND_ALPHA = { day: 0.1, night: 0.18 } as const;

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
