import { useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import {
  SidebarToggleIcon,
  MoreHorizontalIcon,
  SearchIcon,
  NewNoteIcon,
  SourceViewIcon,
} from "./Icons";
import { isElectronMac } from "../utils/platform";
import { BTN_GAP, CHROME_BTN, MAC_TRAFFIC_INSET } from "../constants/layout";
import { PANEL_MS } from "../tokens/motion";
import { Tooltip, shortcutLabel, useTooltip } from "./Tooltip";
import { tagPillGround } from "../styles/tagPill";

/**
 * The editor's own chrome: two fixed corners, no horizontal strip.
 *
 * Left, only while the sidebar is not showing: the panel toggle, New note and
 * Search. When the sidebar IS showing those three live in it (see
 * Sidebar.jsx), so exactly one of each exists at any moment and it always
 * means the same thing. The trio fades in at the corner as the panel finishes
 * leaving (tokens/motion.js). Undo and Redo sat beside it until 2026-09-24;
 * they are the menu bar's Edit → Undo and Redo now (electron/appMenu.ts).
 *
 * Right, the note's ··· menu — the active note's actions, and Settings under a
 * separator. It is rendered with no active note too, carrying Settings alone:
 * app settings must never need a note to reach. While the Markdown view is on,
 * a lit `</>` stands left of it: the mode's one mark on screen, and its way
 * back (2026-09-24). It is not there at rest; the ··· menu, View and ⌘/ open
 * the view.
 *
 * Between the two, centred on the pane, the note's path and name (NotePath,
 * rendered by EditorArea at the top of its scroller so the note scrolls under
 * it); the band it sits in starts `chromePathInset` from the editor's left
 * edge and stops `CHROME_PATH_RIGHT_INSET` short of its right, so it never
 * reaches a control in either sidebar state, and it is the window's drag
 * region on macOS.
 *
 * On macOS Electron the native traffic lights render over our chrome
 * (hiddenInset, no title bar): expanded, they share the sidebar header, which
 * doubles as the window drag region; collapsed, they sit alone at the top-left
 * and the left group shifts right of them (MAC_TRAFFIC_INSET), with the path
 * band keeping the window draggable. In full screen macOS takes the lights
 * away (and nothing can be dragged), so the inset falls back to the ordinary
 * one (`trafficLightsShown`).
 */

export const CHROME_INSET = 10;
/** Top of the chrome row's buttons; centres them on the traffic lights
 *  (main.js trafficLightPosition.y = CHROME_TOP + CHROME_BTN / 2). */
export const CHROME_TOP = 7;
export {
  CHROME_BTN,
  BTN_GAP,
  MAC_TRAFFIC_INSET,
  SIDEBAR_HANDLE_W,
} from "../constants/layout";
/** Air between the path's band and the control groups either side of it. */
export const PATH_AIR = 12;
/**
 * Whether the traffic lights are on screen to be cleared: macOS Electron, and
 * not in full screen, where macOS hides them and the inset would be dead space
 * in front of the wordmark and the collapsed group. `fullScreen` is
 * LayoutContext's; every inset that keys off the lights asks this, never
 * `isElectronMac` alone.
 */
export const trafficLightsShown = (fullScreen = false) => isElectronMac && !fullScreen;
const groupWidth = (n) => n * CHROME_BTN + (n - 1) * BTN_GAP;
/** The collapsed trio's fade-in, timed to end with the panel's slide. */
const TRIO_FADE_MS = PANEL_MS / 2;

/**
 * Where the left-hand controls begin, measured from the EDITOR's left edge.
 * Collapsed that edge is the viewport's, and on macOS the group starts right
 * of the traffic lights (unless full screen has hidden them); expanded the
 * sidebar holds the corner and the group takes the editor's own inset.
 */
export const chromeControlsLeft = (collapsed, fullScreen = false) =>
  collapsed && trafficLightsShown(fullScreen) ? MAC_TRAFFIC_INSET : CHROME_INSET;

/**
 * Where the path's band begins, measured from the editor's left edge: past
 * the whole visible control group, not just the toggle, plus its air. Counted
 * from CHROME_INSET alone, the reserve left the collapsed toggle sitting on
 * the first letters of the note's name at every window width on macOS
 * (2026-09-07); counted from the toggle alone it would now put four more
 * buttons there. Keep this beside the group it measures — the two must move
 * together.
 */
export const chromePathInset = (collapsed, fullScreen = false) =>
  chromeControlsLeft(collapsed, fullScreen) + (collapsed ? groupWidth(3) : 0) + PATH_AIR;

/**
 * Where the path's band ends, measured from the editor's right edge: the ···,
 * the room the Markdown view's `</>` takes beside it, and the air. Reserved
 * whether the view is on or not, so switching never moves the path: a band
 * that widened and narrowed with the mode re-centred the name and, for a
 * frame, dropped its folders (2026-09-24).
 */
export const CHROME_PATH_RIGHT_INSET = CHROME_INSET + groupWidth(2) + PATH_AIR;

/**
 * The shell's shortcuts as the chips show them: the map in useAppKeyboard
 * and the menu's accelerators (electron/appMenu.ts), and the three must agree.
 */
export const SHORTCUTS = {
  newNote: shortcutLabel({ key: "N" }),
  newFolder: shortcutLabel({ key: "N", shift: true }),
  search: shortcutLabel({ key: "P" }),
  settings: shortcutLabel({ key: "," }),
  toggleSidebar: shortcutLabel({ key: "\\" }),
  sourceView: shortcutLabel({ key: "/" }),
};

/**
 * A 32px chrome control. Its name is a chip under it (Tooltip), never a
 * native `title`: `label` is the chip and the accessible name, `shortcut` the
 * pill beside it. Disabled is `aria-disabled`, not the attribute, so a greyed
 * Undo still takes the pointer and keyboard focus and still says `Undo ⌘Z`
 * (a natively disabled button shows nothing); the click is dropped here.
 */
export function ChromeButton({
  onClick,
  label,
  shortcut,
  ariaLabel,
  disabled,
  keepSelection,
  // Held in the hover state (surface and primary ink) while whatever it opened
  // is open, so the pointer leaving for the popup does not drop it.
  active,
  // A mode that is on (the Markdown view): the glyph in the accent ink on the
  // tag pill's teal wash, a step stronger under the pointer. Never the grey
  // of hover, which it was first and read as a hovered button (2026-09-24).
  lit,
  children,
  style,
  ...rest
}) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const tip = useTooltip();
  const restBg = lit ? tagPillGround(theme) : active ? BG.surface : "none";
  const restInk = lit ? ACCENT.text : active ? TEXT.primary : TEXT.muted;
  const ref = useRef(null);
  return (
    <button
      type="button"
      {...rest}
      ref={ref}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      // A press on a history button must not take the editor's selection with
      // it: preventing the mousedown default leaves the caret and any selected
      // run exactly where they were, so typing continues after the undo.
      // Keyboard focus and Enter/Space are untouched by this.
      onMouseDown={(e) => {
        if (keepSelection) e.preventDefault();
        tip.handlers.onMouseDown();
      }}
      onMouseUp={tip.handlers.onMouseUp}
      onFocus={tip.handlers.onFocus}
      onBlur={tip.handlers.onBlur}
      onKeyDown={(e) => {
        tip.handlers.onKeyDown(e);
        if (disabled && (e.key === "Enter" || e.key === " ")) e.preventDefault();
      }}
      aria-label={ariaLabel || label}
      style={{
        position: "relative",
        width: CHROME_BTN,
        height: CHROME_BTN,
        background: restBg,
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        color: restInk,
        // Disabled reads as inactive ink, never as a second colour: the glyph
        // is the same one, just further back.
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.12s, color 0.12s, opacity 0.12s",
        // Chrome buttons can sit inside window drag regions (sidebar header,
        // collapsed strip) — keep them clickable there. Harmless on web.
        WebkitAppRegion: "no-drag",
        ...style,
      }}
      onMouseEnter={(e) => {
        tip.handlers.onMouseEnter();
        if (disabled) return;
        e.currentTarget.style.background = lit ? tagPillGround(theme, true) : BG.surface;
        e.currentTarget.style.color = lit ? ACCENT.text : TEXT.primary;
      }}
      onMouseLeave={(e) => {
        tip.handlers.onMouseLeave();
        if (disabled || active) return;
        e.currentTarget.style.background = lit ? restBg : "transparent";
        e.currentTarget.style.color = restInk;
      }}
    >
      {children}
      {tip.shown && (
        <Tooltip
          label={label}
          shortcut={shortcut}
          anchor={ref.current}
          placement="below"
          testId="chrome-tooltip"
        />
      )}
    </button>
  );
}

export default function EditorChrome({
  activeNote,
  onNoteActions,
  onNewNote,
  onOpenSearch,
  onToggleSourceView,
}) {
  const { sidebarVisible, fullScreen, toggleSidebar, sourceView } = useLayout();
  const collapsed = !sidebarVisible;

  // The left controls belong to the editor, so they start at its left edge,
  // which collapsed is the viewport's. Undo and Redo left this row on
  // 2026-09-24 for the menu bar's Edit menu, so an expanded sidebar leaves
  // the editor's side of the row empty.
  const trioLeft = chromeControlsLeft(true, fullScreen);

  return (
    <>
      {collapsed && (
        <div
          className="panel-motion"
          style={{
            position: "fixed",
            top: CHROME_TOP,
            left: trioLeft,
            zIndex: Z.TOOLBAR,
            // In after the panel has gone, not over it: the sidebar's own
            // toggle slides out under the window's edge and this one takes
            // the corner as it arrives.
            animation: `fadeIn ${TRIO_FADE_MS}ms ease ${PANEL_MS - TRIO_FADE_MS}ms both`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: BTN_GAP }}>
            <ChromeButton
              onClick={toggleSidebar}
              label="Toggle sidebar"
              shortcut={SHORTCUTS.toggleSidebar}
            >
              <SidebarToggleIcon />
            </ChromeButton>
            <ChromeButton onClick={onNewNote} label="New note" shortcut={SHORTCUTS.newNote}>
              <NewNoteIcon size={18} />
            </ChromeButton>
            <ChromeButton onClick={onOpenSearch} label="Search notes" shortcut={SHORTCUTS.search}>
              <SearchIcon size={18} />
            </ChromeButton>
          </div>
        </div>
      )}
      <div
        style={{
          position: "fixed",
          top: CHROME_TOP,
          right: CHROME_INSET,
          zIndex: Z.TOOLBAR,
          display: "flex",
          alignItems: "center",
          gap: BTN_GAP,
        }}
      >
        {sourceView && activeNote && (
          // Lit while the view is on: it says the mode is on, and it is the
          // way back. The chip names what a press does.
          <ChromeButton
            onClick={onToggleSourceView}
            label="Show formatted"
            shortcut={SHORTCUTS.sourceView}
            lit
            data-testid="source-view-toggle"
          >
            <SourceViewIcon />
          </ChromeButton>
        )}
        <ChromeButton
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            // Anchor the menu under the button, right-aligned to it.
            onNoteActions({ x: r.right, y: r.bottom + 4 });
          }}
          label={activeNote ? "Note actions" : "App options"}
        >
          <MoreHorizontalIcon />
        </ChromeButton>
      </div>
    </>
  );
}
