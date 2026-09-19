/**
 * Where a line of text sits inside its own box.
 *
 * A baseline is not the top of a line box nor its middle: it is half the
 * leading down, plus the font's ascent. Written out, the half-leading cancels
 * and only the difference between ascent and descent is left, so one constant
 * answers it for every size and line height the app uses.
 *
 * That constant is Inter's ascent minus its descent, as a fraction of the font
 * size, fitted to Chromium's own layout (measured 2026-09-19, probing a
 * zero-width inline-block on the baseline against the box's top):
 *
 * | size / line-height | measured | this model |
 * | --- | --- | --- |
 * | 15 / 1.7 (body) | 18.5 | 18.28 |
 * | 28 / 1.3 (H1) | 28.5 | 28.52 |
 * | 22 / 1.35 (H2) | 23.0 | 22.96 |
 * | 20 / 1.35 (H3) | 21.0 | 20.87 |
 * | 15 / 1.4 (H6) | 16.0 | 16.03 |
 * | 14 / 1.2 (a row label) | 13.5 | 13.56 |
 *
 * Chromium snaps a baseline to the half pixel, which is the whole of the
 * disagreement; the model is within a quarter of a pixel everywhere, and the
 * quantity that matters is a *difference* between two of these, where the
 * errors largely cancel.
 *
 * Re-measure this if the app's face changes. The probe: wrap the text node in a
 * span, append `<span style="display:inline-block;width:0;height:0;
 * vertical-align:baseline">`, and read its top. A canvas `fontBoundingBoxAscent`
 * is NOT this number and was wrong by 5.75px on the sidebar's own row.
 */
export const BASELINE_K = 0.737;

/**
 * How far below a text block's top edge its first baseline falls.
 * @param fontSize in px
 * @param lineHeight as a ratio of the font size
 */
export function baselineFromTop(fontSize: number, lineHeight: number): number {
  return (fontSize * (lineHeight + BASELINE_K)) / 2;
}

/**
 * How far below a row's top edge the baseline of a label centred in it falls.
 * @param rowHeight in px
 * @param fontSize in px
 * @param lineHeight as a ratio of the font size
 */
export function baselineInRow(rowHeight: number, fontSize: number, lineHeight: number): number {
  return (rowHeight - fontSize * lineHeight) / 2 + baselineFromTop(fontSize, lineHeight);
}
