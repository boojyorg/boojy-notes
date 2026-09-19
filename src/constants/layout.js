// @ts-check

/**
 * Sidebar sizing — the single source of truth.
 *
 * These used to live in two places that had no way to reach each other:
 * `SIDEBAR_MIN_W` in LayoutContext and a bare `200` literal in the drag clamp
 * in `usePanelResize`. LayoutContext imports usePanelResize, so neither file
 * could import the constant from the other without a cycle — hence this module.
 * It is also read by `electron/main.js`, so it imports nothing.
 */

// ── The chrome row ──────────────────────────────────────────────────────────
// The sidebar's header and the editor's top row share one control grammar.
// The numbers live here, not in EditorChrome, because the sidebar's minimum
// width is derived from them (below) and this module must stay importable
// from the main process, which reads WINDOW_MIN_W.

/** Control hit box in the chrome rows (the 18px navigation glyph sits in it). */
export const CHROME_BTN = 32;
/** The name field's hover pill: its side padding, pulled back out with a
 *  negative margin so the path centres on the letters. Shared with the
 *  stylesheet, which sizes the empty field to its placeholder plus this. */
export const LABEL_PAD_X = 5;
/** Between buttons of one group, and between the two groups. A group reads as
 *  a group only if the step out of it is bigger than the step within it. */
export const BTN_GAP = 2;
/**
 * Left inset that clears the macOS traffic lights: x:14, three 14px lights on
 * a 23px pitch on macOS 26 (they end at 75px), then breathing room. Shared by
 * the sidebar header's wordmark and the collapsed control group. Pairs with
 * trafficLightPosition in electron/main.js. Judge it at 100% only: the old 70
 * was settled in a dev window Chromium had zoomed to 131%, and at true size
 * the third light sat on the wordmark (measured 2026-09-05). 86 until
 * 2026-09-16, brought in 4px at Tyr's ask, to be judged live.
 */
export const MAC_TRAFFIC_INSET = 82;
/** Breathing room between the header's last control and the sidebar divider. */
export const HEADER_RIGHT_INSET = 6;
/** The wordmark's drawn height in the sidebar header (a label, not a headline:
 *  at 20 it out-shouted the note's H1), and its width at that height. The
 *  asset is 858×226, so 18px tall is 68.3px wide. */
export const WORDMARK_H = 18;
export const WORDMARK_W = 69;
/**
 * What the sidebar's header row holds on macOS, where it is widest: the
 * traffic-light inset, the wordmark, Search and the toggle at their gap, and
 * the right inset. Nothing in the row can shrink, so a narrower sidebar clips
 * the toggle (seen 2026-09-16, after Search joined the row: the minimum had
 * been sized for one button).
 */
export const SIDEBAR_HEADER_W =
  MAC_TRAFFIC_INSET + WORDMARK_W + 2 * CHROME_BTN + BTN_GAP + HEADER_RIGHT_INSET;
/** Air between the wordmark and Search's box when the sidebar is at its
 *  minimum (the glyph sits 7px inside the box, so the visible gap is 9).
 *  8 at first, then 4, then 2 the same day at Tyr's ask. */
export const HEADER_AIR = 2;

/**
 * Narrowest the sidebar can be dragged: the header row plus HEADER_AIR, so
 * every control in it stays whole. Derived, never a number of its own: add a
 * control to the row and the minimum follows.
 */
export const SIDEBAR_MIN_W = SIDEBAR_HEADER_W + HEADER_AIR;

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
/** The labelled New note row: a touch taller than a tree row, as the one
 *  action among a list of names. */
export const ACTION_ROW_H = 32;
/** Above a section header, and above the New note row that opens the column.
 *  One spacing rule for every section. */
export const SECTION_GAP = 12;
