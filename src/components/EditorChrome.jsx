import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { useNoteDataActions } from "../context/NoteDataContext";
import {
  SidebarToggleIcon,
  MoreHorizontalIcon,
  SearchIcon,
  PlusIcon,
  UndoIcon,
  RedoIcon,
} from "./Icons";
import { isElectronMac } from "../utils/platform";

/**
 * The editor's own chrome: two fixed corners, no horizontal strip.
 *
 * Left, reading outward from the window's edge, two groups with different
 * jobs and a wider gap between them than within either:
 *
 *   navigation and creation  panel toggle, Search, New note — rendered ONLY
 *          while the sidebar is not showing, whether the user hid it or it is
 *          a closed overlay at a narrow width. When the sidebar IS showing,
 *          those three live in it (see Sidebar.jsx), so exactly one of each
 *          exists at any moment and it always means the same thing.
 *   history  Undo and Redo, the open note's edits. Always here, in both
 *          sidebar states, disabled when the open note has nothing to undo or
 *          redo (and with no note open at all).
 *
 * Right, the note's ··· menu — the active note's actions, and Settings under a
 * separator. It is rendered with no active note too, carrying Settings alone:
 * app settings must never need a note to reach.
 *
 * On macOS Electron the native traffic lights render over our chrome
 * (hiddenInset, no title bar): expanded, they share the sidebar header, which
 * doubles as the window drag region; collapsed, they sit alone at the top-left
 * and the left group shifts right of them (MAC_TRAFFIC_INSET), with a slim
 * invisible strip along the very top keeping the window draggable.
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
/** Air between the last left-hand control and anything on its row. */
const CONTROL_AIR = 8;
/** The sidebar's drag handle sits between the sidebar and the editor. */
export const SIDEBAR_HANDLE_W = 4;
/**
 * Left inset that clears the macOS traffic lights: x:14, three 14px lights on
 * a 23px pitch on macOS 26 (they end at 75px), then breathing room. Shared by
 * the sidebar header's wordmark and the collapsed control group. Pairs with
 * trafficLightPosition in electron/main.js. Judge it at 100% only: the old 70
 * was settled in a dev window Chromium had zoomed to 131%, and at true size
 * the third light sat on the wordmark (measured 2026-09-05).
 */
export const MAC_TRAFFIC_INSET = 86;
/** Height of the collapsed-state drag strip — stops above the note label's
    line box (top ≈16px) so the strip never steals its clicks. */
const DRAG_STRIP_H = 14;

const groupWidth = (n) => n * CHROME_BTN + (n - 1) * BTN_GAP;

/**
 * Where the left-hand controls begin, measured from the EDITOR's left edge.
 * Collapsed that edge is the viewport's, and on macOS the group starts right
 * of the traffic lights; expanded the sidebar holds the corner and the group
 * takes the editor's own inset.
 */
export const chromeControlsLeft = (collapsed) =>
  collapsed && isElectronMac ? MAC_TRAFFIC_INSET : CHROME_INSET;

/**
 * Kept clear on the left of anything sharing the chrome row (the note label in
 * EditorArea), measured from the editor's left edge: past the whole visible
 * control group, not just the toggle. Counted from CHROME_INSET alone, the
 * reserve left the collapsed toggle sitting on the first letters of the note's
 * name at every window width on macOS (2026-09-07); counted from the toggle
 * alone it would now put four more buttons there. Keep this beside the group
 * it measures — the two must move together.
 */
export const chromeLabelClearance = (collapsed) =>
  chromeControlsLeft(collapsed) +
  (collapsed ? groupWidth(3) + GROUP_GAP + groupWidth(2) : groupWidth(2)) +
  CONTROL_AIR;

export function ChromeButton({
  onClick,
  title,
  ariaLabel,
  disabled,
  keepSelection,
  children,
  style,
}) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  return (
    <button
      type="button"
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
        background: "none",
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        color: TEXT.muted,
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
        if (disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = TEXT.muted;
      }}
    >
      {children}
    </button>
  );
}

export default function EditorChrome({ activeNote, onNoteActions, onNewNote, onOpenSearch }) {
  const { sidebarVisible, sidebarInFlow, sidebarWidth, toggleSidebar } = useLayout();
  const { canUndo, canRedo, undo, redo } = useNoteDataActions();
  const collapsed = !sidebarVisible;

  // The left group belongs to the editor, so it starts at the editor's left
  // edge. An open overlay sidebar is painted over the editor and occupies no
  // layout, so the editor still starts at the viewport — the group sits under
  // the overlay, exactly as the note label does.
  const groupLeft =
    (sidebarInFlow ? sidebarWidth + SIDEBAR_HANDLE_W : 0) + chromeControlsLeft(collapsed);

  return (
    <>
      {collapsed && isElectronMac && (
        // With the sidebar hidden there is no header to drag the window by, so
        // a slim invisible strip along the very top takes that job. It sits
        // under the chrome buttons in stacking order; they opt out via
        // no-drag. 14px tall: real enough to grab, short of the note label.
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: DRAG_STRIP_H,
            zIndex: Z.TOOLBAR,
            WebkitAppRegion: "drag",
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top: CHROME_TOP,
          left: groupLeft,
          zIndex: Z.TOOLBAR,
          display: "flex",
          alignItems: "center",
          gap: GROUP_GAP,
        }}
      >
        {collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: BTN_GAP }}>
            <ChromeButton onClick={toggleSidebar} title="Show sidebar">
              <SidebarToggleIcon />
            </ChromeButton>
            <ChromeButton onClick={onOpenSearch} title="Search notes">
              <SearchIcon size={18} />
            </ChromeButton>
            <ChromeButton onClick={onNewNote} title="New note">
              <PlusIcon size={18} nav />
            </ChromeButton>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: BTN_GAP }}>
          <ChromeButton onClick={undo} disabled={!canUndo} keepSelection title="Undo">
            <UndoIcon />
          </ChromeButton>
          <ChromeButton onClick={redo} disabled={!canRedo} keepSelection title="Redo">
            <RedoIcon />
          </ChromeButton>
        </div>
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
