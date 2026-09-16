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
// TEXT_COL. The exception is the sidebar's note rows (2026-09-16): a note
// carries no glyph and its title starts on the glyph column of its depth
// (SPINE + depth × TREE_INDENT), so notes and folders at one depth share a
// left edge. The popup's note rows keep TEXT_COL.

/** Structural spine: the left edge of folder glyphs and section labels. */
export const SPINE = 12;
/**
 * The sidebar's own column (New note, the Notes row, the tree and its indent
 * guides) sits this much further in than SPINE, judged live 2026-09-16 in 2px
 * steps up to 6; every x in it is SPINE + this, so nesting and the
 * glyph-to-name gap are unchanged.
 * Sidebar only: the folder popup draws its tree on the bare SPINE, and the
 * wordmark row keeps its own inset.
 */
export const SIDEBAR_TREE_INSET = 6;
/** Label column: where every text label in a tree starts. */
export const TEXT_COL = 34;
/** Rows are inset this much from the panel's edges so hover pills breathe. */
export const ROW_INSET = 4;
/** Folder-row glyph box on the spine (16px list tier). */
export const SPINE_ICON = 16;
/**
 * Each level of nesting steps the row's contents this far right. It is the
 * name's own offset from its glyph, never a number of its own (2026-09-16): a
 * child's contents, glyph or text, then start exactly under its parent's name.
 * At 20 they sat 2px short of it at every depth, hidden by the glyph's inner
 * whitespace and given away by a note's text.
 */
export const TREE_INDENT = TEXT_COL - SPINE;
/** Tree rows are this tall, with a 2px rhythm gap. */
export const TREE_ROW_H = 28;
export const TREE_ROW_GAP = 2;
/** The pill radius of every tree and action row. */
export const ACTION_RADIUS = 12;
