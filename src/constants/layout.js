// @ts-check

/**
 * Sidebar sizing — the single source of truth.
 *
 * These used to live in two places that had no way to reach each other:
 * `SIDEBAR_MIN_W` in LayoutContext and a bare `200` literal in the drag clamp
 * in `usePanelResize`. LayoutContext imports usePanelResize, so neither file
 * could import the constant from the other without a cycle — hence this module.
 */

/** Narrowest the sidebar can be dragged. */
export const SIDEBAR_MIN_W = 200;

/** Widest the sidebar can be dragged. */
export const SIDEBAR_MAX_W = 400;

/** The drag handle between the sidebar and the editor. */
export const SIDEBAR_HANDLE_W = 4;

/**
 * Narrowest editor the sidebar is allowed to leave beside itself. Below this
 * the panel yields first, down to its own minimum, before the note loses
 * another pixel: 316px of editor is about 268px of text at the gutter floor,
 * some 34 characters a line, and it is the user's toggle, never the window,
 * that takes the note below it (2026-09-14).
 */
export const EDITOR_FLOOR_W = 316;

/**
 * The window's minimum width falls out of the two floors rather than being a
 * number of its own: the narrowest sidebar beside the narrowest editor.
 * `electron/main.js` reads it for `minWidth`.
 */
export const WINDOW_MIN_W = SIDEBAR_MIN_W + SIDEBAR_HANDLE_W + EDITOR_FLOOR_W;

/**
 * The width the sidebar is drawn at: the width the user dragged to, capped by
 * what the window can hold beside an editor at its floor, and never below the
 * sidebar's own minimum. The preference is untouched by a resize, so widening
 * the window gives the dragged width back.
 * @param {number} preference the dragged width
 * @param {number} windowWidth `window.innerWidth`
 */
export const sidebarWidthFor = (preference, windowWidth) =>
  Math.max(SIDEBAR_MIN_W, Math.min(preference, windowWidth - SIDEBAR_HANDLE_W - EDITOR_FLOOR_W));

/**
 * First-run width. Not persisted, so this is what every reload lands on —
 * which makes it directly observable when judging a candidate value.
 */
export const SIDEBAR_DEFAULT_W = 240;

// ── Tree rows ───────────────────────────────────────────────────────────────
// The sidebar's row grammar, shared with the path's folder popup (2026-09-16),
// which is that tree drawn small under a crumb: same spine, same label column,
// same row height, so the two read as one thing. Two columns: everything
// structural (folder glyphs, section labels) sits on SPINE, every label on
// TEXT_COL; root notes carry no glyph, so an empty gutter keeps their titles
// on the label column. That gutter is alignment, not a missing icon.

/** Structural spine: the left edge of folder glyphs and section labels. */
export const SPINE = 12;
/** Label column: where every text label in a tree starts. */
export const TEXT_COL = 34;
/** Rows are inset this much from the panel's edges so hover pills breathe. */
export const ROW_INSET = 4;
/** Folder-row glyph box on the spine (16px list tier). */
export const SPINE_ICON = 16;
/** Each level of nesting steps the row's contents this far right. */
export const TREE_INDENT = 20;
/** Tree rows are this tall, with a 2px rhythm gap. */
export const TREE_ROW_H = 28;
export const TREE_ROW_GAP = 2;
/** The pill radius of every tree and action row. */
export const ACTION_RADIUS = 12;
