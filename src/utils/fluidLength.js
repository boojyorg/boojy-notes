// @ts-check

/**
 * CSS lengths that follow the available width.
 *
 * Kept out of the component it serves so it can be tested on its own — pulling
 * EditorArea into a unit test drags its whole import graph (slash menu, find
 * bar, backlinks, popovers) along with it.
 */

/**
 * A CSS length that ramps linearly between two `(width, value)` anchors and
 * clamps outside them, so it can be handed straight to an inline style.
 *
 * `width` is a parenthesised CSS expression for the space being measured — the
 * editor's available width, say — and the anchors are plain px numbers:
 *
 *     ramp("(100vw - 224px)", [400, 24], [800, 56])
 *
 * gives 24px at 400px and below, 56px at 800px and above, and eases between.
 *
 * @param {string} width parenthesised CSS expression, e.g. `"(100vw - 224px)"`
 * @param {[number, number]} from `[width, value]` anchor
 * @param {[number, number]} to `[width, value]` anchor
 * @returns {string} a `clamp()` expression
 */
export function ramp(width, [w0, v0], [w1, v1]) {
  const slope = (v1 - v0) / (w1 - w0);
  const intercept = v0 - slope * w0;
  const sign = intercept < 0 ? "-" : "+";
  const [lo, hi] = v0 < v1 ? [v0, v1] : [v1, v0];
  return `clamp(${lo}px, calc(${width} * ${slope} ${sign} ${Math.abs(intercept)}px), ${hi}px)`;
}
