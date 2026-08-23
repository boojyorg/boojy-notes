// @ts-check

/**
 * Sidebar sizing — the single source of truth.
 *
 * These used to live in two places that had no way to reach each other:
 * `SIDEBAR_MIN_W` in LayoutContext (which computes `overlayWidth` from it) and a
 * bare `200` literal in the drag clamp in `usePanelResize`. LayoutContext imports
 * usePanelResize, so neither file could import the constant from the other without
 * a cycle — hence this module. Change a number here and both the drag floor and
 * the overlay floor move together; that is the whole point of the file.
 */

/** Narrowest the sidebar can be dragged, and the floor the overlay width clamps to. */
export const SIDEBAR_MIN_W = 200;

/** Widest the sidebar can be dragged. */
export const SIDEBAR_MAX_W = 400;

/**
 * First-run width. Not persisted, so this is what every reload lands on —
 * which makes it directly observable when judging a candidate value.
 */
export const SIDEBAR_DEFAULT_W = 240;
