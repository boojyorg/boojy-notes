import { SCALE_OPTIONS } from "../constants/data";

/**
 * The UI scale as a number: the presets the menu offers, the ends a custom
 * value is held between, and the one rule for stepping.
 *
 * The scale is CSS `zoom` on `<html>`, so it is a whole percentage and it is
 * the app's own (`main.js` pins Chromium's page zoom at 0). The presets are
 * what `Cmd+±` walks; a custom value sits between two of them and the keys
 * take it to the nearest preset on the side they point.
 */

/** The smallest and largest the app may be drawn, custom values included. */
export const SCALE_MIN = SCALE_OPTIONS[0];
export const SCALE_MAX = SCALE_OPTIONS[SCALE_OPTIONS.length - 1];

/** The scale the app opens at, and what Reset goes back to. */
export const SCALE_DEFAULT = 100;

/** A whole percentage inside the range. */
export const clampScale = (n: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n)));

/** Whether the menu has a row for this scale. */
export const isPresetScale = (n: number) => SCALE_OPTIONS.includes(n);

/**
 * One step in `direction`: the nearest preset on that side, so a custom 93%
 * goes up to 100 and down to 90. At the end of the range the scale it is
 * already on, because the shortcut must still answer (`useAppKeyboard`).
 */
export function stepScale(scale: number, direction: number): number {
  const next =
    direction > 0
      ? SCALE_OPTIONS.find((s) => s > scale)
      : [...SCALE_OPTIONS].reverse().find((s) => s < scale);
  return next ?? scale;
}

/**
 * A scale typed into the custom field, or null for anything that is not a
 * number. `93%`, ` 93 ` and `93` are all 93; the value is then held inside the
 * range rather than refused, so a typed 500 is 200 and nothing has to explain
 * itself.
 */
export function parseScale(text: string): number | null {
  const n = Number.parseFloat(String(text).replace("%", "").trim());
  return Number.isFinite(n) ? clampScale(n) : null;
}

/**
 * A viewport-unit length in the app's own pixels. `vw` and `vh` ignore the CSS
 * `zoom` the scale is made of, so `100vh` is the window's height times the
 * scale; anything sized against the viewport divides by `--ui-scale`, which
 * `SettingsContext` writes beside the zoom.
 */
export const atScale = (expr: string) => `calc((${expr}) / var(--ui-scale, 1))`;
