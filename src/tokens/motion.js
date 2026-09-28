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
 *
 * 280, not the 200 most kits default to: a 240px panel is a bigger object
 * than a menu, and at 200 Tyr judged it "a bit too fast" live (2026-09-14).
 * macOS sidebars sit near 250 and Notion's near 300; past 300 it reads as
 * waiting.
 */
export const PANEL_MS = 280;
export const PANEL_EASE = "cubic-bezier(0.2, 0, 0, 1)";

/** How long the sidebar's contents take to fade, inside the panel's clock:
 *  half of it, so the panel is never a blank slab for long. */
export const PANEL_FADE_MS = PANEL_MS / 2;

/**
 * A `transition` value for the given properties on the panel's clock.
 * @param {...string} props CSS property names
 */
export const panelTransition = (...props) =>
  props.map((p) => `${p} ${PANEL_MS}ms ${PANEL_EASE}`).join(", ");

/**
 * How long a row the app has just made wears the sidebar's row pill (Duplicate
 * folder). Long enough to find the copy among its neighbours after the eye has
 * travelled to the tree, short enough that it is gone before it becomes a
 * state the user has to reason about; hovering the row takes it off at once.
 */
export const NEW_ROW_MS = 2400;

/**
 * The small clock, for everything that is not the panel: a popover, a
 * tooltip, a dialog, a toast, a press. Apple-Notes quick with a soft landing,
 * never a spring. Nothing here is over 160ms; past ~200 a small thing reads
 * as waiting (the panel earned its 280 by being big).
 *
 * Leaving is quicker than arriving: an arrival is watched, a departure is
 * only confirmed, and it is what makes macOS menus feel answered rather than
 * animated.
 *
 * The values reach CSS as variables on `:root` (`MOTION_VARS`, written by
 * GlobalStyles) so `?tweak` can move them live; a component reads the
 * variable, never these numbers, unless it needs a timer.
 */
export const MOTION_FAST_MS = 100;
export const MOTION_ENTER_MS = 140;
export const MOTION_EXIT_MS = 90;

/** Arriving decelerates into place; it is the panel's own curve. */
export const EASE_ENTER = PANEL_EASE;
/** Leaving accelerates away. */
export const EASE_EXIT = "cubic-bezier(0.4, 0, 1, 1)";

/** How far a control dips under a press (a button, a tick). */
export const PRESS_SCALE = 0.97;

export const MOTION_VARS = {
  "--motion-fast": `${MOTION_FAST_MS}ms`,
  "--motion-enter": `${MOTION_ENTER_MS}ms`,
  "--motion-exit": `${MOTION_EXIT_MS}ms`,
  "--ease-enter": EASE_ENTER,
  "--ease-exit": EASE_EXIT,
  "--press-scale": String(PRESS_SCALE),
};

/**
 * Whether the user has asked the system for less motion. Read where it is
 * used, not at import: the setting can change while the app runs.
 */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
