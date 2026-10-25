import { SCALE_OPTIONS } from "../constants/data";
import { PHONE_UI_SCALE } from "../constants/layout";
import { isPhone } from "./platform";

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

/** The scale saved by the last session, else the device's default. */
export function initialUiScale(): number {
  const saved = localStorage.getItem("boojy-ui-scale");
  return saved ? Number(saved) : isPhone ? PHONE_UI_SCALE : SCALE_DEFAULT;
}

/**
 * Draw the app at `scale`. `--ui-scale` goes beside the zoom because `vw` and
 * `vh` are not divided by `zoom` (a `100vh` box is twice the window at 200%):
 * anything sized against the viewport divides by it (`atScale`).
 */
export function applyUiScale(scale: number) {
  const root = document.documentElement.style;
  root.zoom = `${scale}%`;
  root.setProperty("--ui-scale", String(scale / 100));
  root.minHeight = scale !== 100 ? `${10000 / scale}vh` : "";
}

/** A whole percentage inside the range. */
export const clampScale = (n: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n)));

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
 * `applyUiScale` writes beside the zoom.
 */
export const atScale = (expr: string) => `calc((${expr}) / var(--ui-scale, 1))`;

/**
 * The air the status bar's inset already leaves below its icons, which the
 * app's top row (with air of its own) may stand in.
 */
const STATUS_BAR_AIR = 6;

/**
 * The room Android's gesture or button bar takes at the bottom of the phone's
 * screen, in the app's own pixels: a list scrolls its last row clear of it.
 * 0 wherever there is no such bar.
 */
export const NAV_BAR_H = atScale("env(safe-area-inset-bottom, 0px)");

/**
 * The room Android's status bar takes at the top of the phone's screen, in
 * the app's own pixels: the app draws under the bar (Capacitor leaves the
 * room to the page on a current WebView), so whatever stands at the top
 * stands below this. 0 wherever there is no such bar.
 */
export const STATUS_BAR_H = `max(0px, ${atScale("env(safe-area-inset-top, 0px)")} - ${STATUS_BAR_AIR}px)`;
