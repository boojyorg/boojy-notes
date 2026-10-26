/**
 * Centralized z-index scale for the entire app.
 * Always use these constants instead of hardcoded numbers.
 *
 * Scale overview (low → high):
 *   BASE → ELEMENT_OVERLAY → BLOCK_HANDLE → PATH_ROW → SIDEBAR_DIVIDER → FIND_BAR
 *   → TOOLBAR → WIKILINK_MENU → MENU_BACKDROP
 *   → DROPDOWN → CONTEXT_BACKDROP → CONTEXT_MENU → SETTINGS → SETTINGS_MENU → LIGHTBOX
 *   → OVERLAY → CALLOUT_BACKDROP
 *   → TOAST → CONFIRM → FIELD_MENU → TOOLTIP → ERROR_BOUNDARY
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
   *  find bar and the fixed chrome buttons. */
  PATH_ROW: 8,
  /** The sidebar's divider: its grab area reaches into the editor's margin,
   *  over the path band beside it. */
  SIDEBAR_DIVIDER: 9,
  FIND_BAR: 50,
  TOOLBAR: 100,
  WIKILINK_MENU: 110,
  MENU_BACKDROP: 199,
  DROPDOWN: 200,
  CONTEXT_BACKDROP: 250,
  CONTEXT_MENU: 300,
  SETTINGS: 400,
  SETTINGS_INNER: 401,
  /** A menu opened from inside Settings (a location's ···, Spelling's
   *  languages): its backdrop and surface, above the pane. */
  SETTINGS_MENU_BACKDROP: 402,
  SETTINGS_MENU: 403,
  LIGHTBOX: 1100,
  OVERLAY: 1200,
  CALLOUT_BACKDROP: 9998,
  TOAST: 9999,
  CONFIRM: 10001,
  /** A text field's Cut, Copy and Paste (`TextFieldMenu`): over every
   *  surface a field can sit on, the confirm dialog's included. */
  FIELD_MENU_BACKDROP: 10002,
  FIELD_MENU: 10003,
  /** A control's chip: over whatever surface holds the control under the pointer
   *  (a popover, Settings), and inert to the pointer. */
  TOOLTIP: 10004,
  ERROR_BOUNDARY: 99999,
};
