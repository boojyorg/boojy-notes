/**
 * Centralized z-index scale for the entire app.
 * Always use these constants instead of hardcoded numbers.
 *
 * Scale overview (low → high):
 *   BASE → TOPBAR_INNER → ELEMENT_OVERLAY → BLOCK_HANDLE → FIND_BAR
 *   → TOOLBAR → WIKILINK_MENU → SIDEBAR_SCRIM → SIDEBAR_OVERLAY → MENU_BACKDROP
 *   → DROPDOWN → CONTEXT_BACKDROP → CONTEXT_MENU → SETTINGS → LIGHTBOX
 *   → OVERLAY → FAB → BOTTOM_SHEET_OVERLAY → BOTTOM_SHEET → CALLOUT_BACKDROP
 *   → TOAST → CONFIRM → ERROR_BOUNDARY
 */

export const Z = {
  BASE: 1,
  TOPBAR_INNER: 2,
  ELEMENT_OVERLAY: 5,
  /** The gutter grip. Above ELEMENT_OVERLAY because the table's invisible
   *  row strip (24px at `left: -24px`) sits on that layer exactly where the
   *  grip is drawn, and a press there selected a row instead of lifting the
   *  table (2026-09-10). */
  BLOCK_HANDLE: 6,
  FIND_BAR: 50,
  TOOLBAR: 100,
  WIKILINK_MENU: 110,
  /** Sidebar-as-overlay at narrow widths: over the editor, under every menu. */
  SIDEBAR_SCRIM: 140,
  SIDEBAR_OVERLAY: 150,
  MENU_BACKDROP: 199,
  DROPDOWN: 200,
  CONTEXT_BACKDROP: 250,
  CONTEXT_MENU: 300,
  SETTINGS: 400,
  SETTINGS_INNER: 401,
  LIGHTBOX: 1100,
  OVERLAY: 1200,
  FAB: 9000,
  BOTTOM_SHEET_OVERLAY: 9500,
  BOTTOM_SHEET: 9501,
  CALLOUT_BACKDROP: 9998,
  TOAST: 9999,
  CONFIRM: 10001,
  ERROR_BOUNDARY: 99999,
};
