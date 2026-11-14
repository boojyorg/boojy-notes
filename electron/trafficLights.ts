/**
 * Where macOS draws the traffic lights, for the interface size in use.
 *
 * The lights are the system's: a fixed size at a fixed place, while the row
 * they share (the sidebar header: wordmark, Search, toggle) is drawn at the
 * app's own scale. Left where 100% puts them, they stood under a small row
 * and over a large one. So their middle follows the row's, and the row keeps
 * its distance from them by dividing its inset by the scale (`trafficInset`
 * in `src/constants/layout.js`), which leaves `x` alone.
 */

/** The row's middle at 100%, from the window's top (the wordmark's centre). */
const ROW_MIDDLE = 25;
/** macOS 26 draws each light 14px across. */
const LIGHT = 14;
/** Pairs with MAC_TRAFFIC_INSET: move one, re-judge the other. */
const LIGHTS_X = 14;

/** The scales the app can be drawn at, as factors (`SCALE_MIN`/`SCALE_MAX`). */
const MIN = 0.5;
const MAX = 2;

/**
 * The lights' top-left corner at `scale` (1 is 100%). Anything that is not a
 * scale the app can draw is read as 100%: the argument crosses IPC.
 */
export function trafficLightsAt(scale: unknown = 1): { x: number; y: number } {
  const given = typeof scale === "number" && Number.isFinite(scale) ? scale : 1;
  const factor = Math.min(MAX, Math.max(MIN, given));
  return { x: LIGHTS_X, y: Math.round(ROW_MIDDLE * factor - LIGHT / 2) };
}
