// @ts-check

/**
 * The panel's one clock (2026-09-14). Everything that moves when the sidebar
 * is shown or hidden — the sidebar's slide, the wrapper's width, the editor
 * column's breath, the chrome row's history pair, the note label's step —
 * runs on this duration and this curve, so they arrive together. Before this
 * `0.2s ease` was written in five places and the chrome row did not move at
 * all: it snapped while the panel eased.
 *
 * Ease-out, not the symmetric `ease`: the panel decelerates into place, which
 * reads as settling rather than gliding.
 */
export const PANEL_MS = 200;
export const PANEL_EASE = "cubic-bezier(0.2, 0, 0, 1)";

/** How long the sidebar's contents take to fade, inside the panel's clock. */
export const PANEL_FADE_MS = 100;

/**
 * A `transition` value for the given properties on the panel's clock.
 * @param {...string} props CSS property names
 */
export const panelTransition = (...props) =>
  props.map((p) => `${p} ${PANEL_MS}ms ${PANEL_EASE}`).join(", ");
