/**
 * Centralized z-index scale for the entire app.
 * Always use these constants instead of hardcoded numbers.
 *
 * Scale overview (low → high):
 *   BASE → ELEMENT_OVERLAY → BLOCK_HANDLE → PATH_ROW → FIND_BAR
 *   → TOOLBAR → WIKILINK_MENU → MENU_BACKDROP
 *   → DROPDOWN → CONTEXT_BACKDROP → CONTEXT_MENU → SETTINGS → LIGHTBOX
 *   → OVERLAY → CALLOUT_BACKDROP
 *   → TOAST → CONFIRM → ERROR_BOUNDARY
 */

export const Z = {
  BASE: 1,
  ELEMENT_OVERLAY: 5,
  /** The gutter grip. Above ELEMENT_OVERLAY because the table's margin
   *  (24px at `left: -24px`, where a row's grip shows from) sits on that
   *  layer near where the grip is drawn, and a press there must lift the
   *  table. */
  BLOCK_HANDLE: 6,
  /** The chrome row's path band, sticky at the top of the editor scroller:
   *  above the blocks and the grip the note scrolls under it with, below the
   *  find bar and the fixed chrome buttons (2026-09-15). */
  PATH_ROW: 8,
  FIND_BAR: 50,
  TOOLBAR: 100,
  WIKILINK_MENU: 110,
  MENU_BACKDROP: 199,
  DROPDOWN: 200,
  CONTEXT_BACKDROP: 250,
  CONTEXT_MENU: 300,
  SETTINGS: 400,
  SETTINGS_INNER: 401,
  LIGHTBOX: 1100,
  OVERLAY: 1200,
  CALLOUT_BACKDROP: 9998,
  TOAST: 9999,
  CONFIRM: 10001,
  ERROR_BOUNDARY: 99999,
};
