import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { useNoteDataActions } from "../context/NoteDataContext";
import {
  SidebarToggleIcon,
  MoreHorizontalIcon,
  SearchIcon,
  NewNoteIcon,
  UndoIcon,
  RedoIcon,
} from "./Icons";
import { isElectronMac } from "../utils/platform";
import { SIDEBAR_HANDLE_W } from "../constants/layout";
import { PANEL_MS, panelTransition } from "../tokens/motion";

/**
 * The editor's own chrome: two fixed corners, no horizontal strip.
 *
 * Left, reading outward from the window's edge, two groups with different
 * jobs and a wider gap between them than within either:
 *
 *   navigation and creation  panel toggle, Search, New note — rendered ONLY
 *          while the sidebar is not showing. When the sidebar IS showing,
 *          those three live in it (see Sidebar.jsx), so exactly one of each
 *          exists at any moment and it always means the same thing.
 *   history  Undo and Redo, the open note's edits. Always here, in both
 *          sidebar states, disabled when the open note has nothing to undo or
 *          redo (and with no note open at all).
 *
 * The two are separate fixed blocks so each can move on the panel's clock
 * (tokens/motion.js, 2026-09-14): the history pair slides between its two
 * positions as the sidebar slides, and the trio fades in at the corner as the
 * panel finishes leaving. As one block, the trio mounted on the first frame
 * over the still-open sidebar and the pair jumped 132px and floated in the
 * editor for the 200ms the panel took to catch up.
 *
 * Right, the note's ··· menu — the active note's actions, and Settings under a
 * separator. It is rendered with no active note too, carrying Settings alone:
 * app settings must never need a note to reach.
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
export const CHROME_BTN = 32;
/** Between buttons of one group, and between the two groups. A group reads as
 *  a group only if the step out of it is bigger than the step within it. */
const BTN_GAP = 2;
const GROUP_GAP = 12;
/** Air between the path's band and the control groups either side of it. */
export const PATH_AIR = 12;
/** The sidebar's drag handle sits between the sidebar and the editor. */
export { SIDEBAR_HANDLE_W } from "../constants/layout";
/**
 * Left inset that clears the macOS traffic lights: x:14, three 14px lights on
 * a 23px pitch on macOS 26 (they end at 75px), then breathing room. Shared by
 * the sidebar header's wordmark and the collapsed control group. Pairs with
 * trafficLightPosition in electron/main.js. Judge it at 100% only: the old 70
 * was settled in a dev window Chromium had zoomed to 131%, and at true size
 * the third light sat on the wordmark (measured 2026-09-05).
 */
export const MAC_TRAFFIC_INSET = 86;
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
  chromeControlsLeft(collapsed, fullScreen) +
  (collapsed ? groupWidth(3) + GROUP_GAP + groupWidth(2) : groupWidth(2)) +
  PATH_AIR;

/** Where the path's band ends, measured from the editor's right edge: the ··· and its air. */
export const CHROME_PATH_RIGHT_INSET = CHROME_INSET + CHROME_BTN + PATH_AIR;

export function ChromeButton({
  onClick,
  title,
  ariaLabel,
  disabled,
  keepSelection,
  // Held in the hover state (surface and primary ink) while whatever it opened
  // is open, so the pointer leaving for the popup does not drop it.
  active,
  children,
  style,
  ...rest
}) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  return (
    <button
      type="button"
      {...rest}
      onClick={onClick}
      disabled={disabled || undefined}
      // A press on a history button must not take the editor's selection with
      // it: preventing the mousedown default leaves the caret and any selected
      // run exactly where they were, so typing continues after the undo.
      // Keyboard focus and Enter/Space are untouched by this.
      onMouseDown={keepSelection ? (e) => e.preventDefault() : undefined}
      title={title}
      aria-label={ariaLabel || title}
      style={{
        width: CHROME_BTN,
        height: CHROME_BTN,
        background: active ? BG.surface : "none",
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        color: active ? TEXT.primary : TEXT.muted,
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
        if (disabled) return;
        e.currentTarget.style.background = BG.surface;
        e.currentTarget.style.color = TEXT.primary;
      }}
      onMouseLeave={(e) => {
        if (disabled || active) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = TEXT.muted;
      }}
    >
      {children}
    </button>
  );
}

export default function EditorChrome({ activeNote, onNoteActions, onNewNote, onOpenSearch }) {
  const { sidebarVisible, sidebarWidth, fullScreen, toggleSidebar } = useLayout();
  const { canUndo, canRedo, undo, redo } = useNoteDataActions();
  const collapsed = !sidebarVisible;

  // The left controls belong to the editor, so they start at its left edge:
  // past the sidebar and its handle while the sidebar shows, at the viewport
  // otherwise. Collapsed, the trio holds that edge and the history pair sits
  // a group-gap past it; expanded, the pair holds the edge alone.
  const trioLeft = chromeControlsLeft(true, fullScreen);
  const pairLeft = collapsed
    ? trioLeft + groupWidth(3) + GROUP_GAP
    : sidebarWidth + SIDEBAR_HANDLE_W + chromeControlsLeft(false, fullScreen);

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
            <ChromeButton onClick={toggleSidebar} title="Show sidebar">
              <SidebarToggleIcon />
            </ChromeButton>
            <ChromeButton onClick={onOpenSearch} title="Search notes">
              <SearchIcon size={18} />
            </ChromeButton>
            <ChromeButton onClick={onNewNote} title="New note">
              <NewNoteIcon size={18} />
            </ChromeButton>
          </div>
        </div>
      )}
      <div
        className="panel-motion"
        style={{
          position: "fixed",
          top: CHROME_TOP,
          left: pairLeft,
          zIndex: Z.TOOLBAR,
          display: "flex",
          alignItems: "center",
          gap: BTN_GAP,
          transition: panelTransition("left"),
        }}
      >
        <ChromeButton onClick={undo} disabled={!canUndo} keepSelection title="Undo">
          <UndoIcon />
        </ChromeButton>
        <ChromeButton onClick={redo} disabled={!canRedo} keepSelection title="Redo">
          <RedoIcon />
        </ChromeButton>
      </div>

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
        <ChromeButton
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            // Anchor the menu under the button, right-aligned to it.
            onNoteActions({ x: r.right, y: r.bottom + 4 });
          }}
          title={activeNote ? "Note actions" : "App options"}
        >
          <MoreHorizontalIcon />
        </ChromeButton>
      </div>
    </>
  );
}
