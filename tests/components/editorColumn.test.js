/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { ramp } from "../../src/components/EditorArea";

/**
 * The writing column's geometry. These anchors are a judged visual decision,
 * so the test pins the arithmetic rather than the look: a drift in slope or
 * intercept would move every gutter in the app without anyone noticing.
 */
const W = "(100vw - 224px)";

/** Evaluate the generated `clamp(min, calc(expr), max)` at a given width. */
function evaluate(css, editorWidth) {
  const m = css.match(
    /^clamp\((-?[\d.]+)px, calc\(\(100vw - (\d+)px\) \* (-?[\d.]+) ([+-]) ([\d.]+)px\), (-?[\d.]+)px\)$/,
  );
  if (!m) throw new Error(`unparseable: ${css}`);
  const [, lo, , slope, sign, intercept, hi] = m;
  // `editorWidth` is the net width the calc() resolves to, so the viewport
  // subtraction inside the expression is already accounted for.
  const value = editorWidth * Number(slope) + (sign === "-" ? -1 : 1) * Number(intercept);
  return Math.min(Math.max(value, Number(lo)), Number(hi));
}

describe("ramp", () => {
  it("holds the low value at and below the first anchor", () => {
    const css = ramp(W, [400, 24], [800, 56]);
    expect(evaluate(css, 400)).toBe(24);
    expect(evaluate(css, 200)).toBe(24);
  });

  it("holds the high value at and above the second anchor", () => {
    const css = ramp(W, [400, 24], [800, 56]);
    expect(evaluate(css, 800)).toBe(56);
    expect(evaluate(css, 2000)).toBe(56);
  });

  it("interpolates linearly between the anchors", () => {
    const css = ramp(W, [400, 24], [800, 56]);
    expect(evaluate(css, 600)).toBe(40);
  });

  it("clamps a ramp that starts at zero", () => {
    const css = ramp(W, [560, 0], [880, 40]);
    expect(evaluate(css, 560)).toBe(0);
    expect(evaluate(css, 500)).toBe(0);
    expect(evaluate(css, 720)).toBe(20);
    expect(evaluate(css, 880)).toBe(40);
  });

  it("spends the left offset exactly as the sidebar stops fitting", () => {
    // MIN_EDITOR_WIDTH is 560: at the width where the sidebar leaves the
    // layout, there is no decorative offset left to lose, so the handover
    // costs the prose nothing extra.
    const css = ramp(W, [560, 0], [880, 40]);
    expect(evaluate(css, 560)).toBe(0);
  });

  it("emits valid CSS with a positive intercept too", () => {
    const css = ramp(W, [400, 56], [800, 24]);
    expect(css).toContain("+");
    expect(evaluate(css, 400)).toBe(56);
    expect(evaluate(css, 800)).toBe(24);
  });
});
