import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { SidebarToggleIcon, MoreHorizontalIcon, NewNoteIcon } from "./Icons";
import { isElectronMac } from "../utils/platform";

/**
 * The only two editor-level controls that survive the minimal-chrome pass.
 *
 * There is deliberately no horizontal strip: these are two quiet buttons pinned
 * to the top corners of the viewport, sitting over the sidebar/editor beneath.
 *
 *   left   panel toggle — rendered here ONLY while the sidebar is not showing,
 *          whether that's because the user hid it or because it's a closed
 *          overlay at a narrow width. When the sidebar IS showing, the toggle
 *          lives in its own header, at the top-right next to the divider (see
 *          Sidebar.jsx), so exactly one toggle exists at any moment and it
 *          always means the same thing.
 *   right  note actions — opens the existing note context menu.
 *
 * On macOS Electron the native traffic lights render over our chrome
 * (hiddenInset, no title bar): expanded, they share the sidebar header, which
 * doubles as the window drag region; collapsed, they sit alone at the top-left
 * and the toggle shifts right of them (MAC_TRAFFIC_INSET), with a slim
 * invisible strip along the very top keeping the window draggable.
 */

export const CHROME_INSET = 10;
/** Top of the chrome row's buttons; centres them on the traffic lights
 *  (main.js trafficLightPosition.y = CHROME_TOP + CHROME_BTN / 2). */
export const CHROME_TOP = 7;
export const CHROME_BTN = 32;
/**
 * Left inset that clears the macOS traffic lights: x:14, three 14px lights on
 * a 23px pitch on macOS 26 (they end at 75px), then breathing room. Shared by
 * the sidebar header's wordmark and the collapsed toggle. Pairs with
 * trafficLightPosition in electron/main.js. Judge it at 100% only: the old 70
 * was settled in a dev window Chromium had zoomed to 131%, and at true size
 * the third light sat on the wordmark (measured 2026-09-05).
 */
export const MAC_TRAFFIC_INSET = 86;
/** Height of the collapsed-state drag strip — stops above the note label's
    line box (top ≈16px) so the strip never steals its clicks. */
const DRAG_STRIP_H = 14;

export function ChromeButton({ onClick, title, ariaLabel, children, style }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      style={{
        width: CHROME_BTN,
        height: CHROME_BTN,
        background: "none",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        color: TEXT.muted,
        transition: "background 0.12s, color 0.12s",
        // Chrome buttons can sit inside window drag regions (sidebar header,
        // collapsed strip) — keep them clickable there. Harmless on web.
        WebkitAppRegion: "no-drag",
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = BG.surface;
        e.currentTarget.style.color = TEXT.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = TEXT.muted;
      }}
    >
      {children}
    </button>
  );
}

// New note lives above the editor, Apple Notes style (2026-09-05): the
// sidebar's chrome row is for finding and hiding, the editor's for making
// and managing, and the button is still there with the sidebar collapsed.
export default function EditorChrome({ activeNote, onNoteActions, onNewNote }) {
  const { sidebarVisible, toggleSidebar } = useLayout();

  return (
    <>
      {!sidebarVisible && isElectronMac && (
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
      {!sidebarVisible && (
        <div
          style={{
            position: "fixed",
            top: CHROME_TOP,
            // Clear the traffic lights, which hold the viewport's top-left
            // corner on macOS once the sidebar (and its header) is hidden.
            left: isElectronMac ? MAC_TRAFFIC_INSET : CHROME_INSET,
            zIndex: Z.TOOLBAR,
          }}
        >
          <ChromeButton onClick={toggleSidebar} title="Show sidebar">
            <SidebarToggleIcon />
          </ChromeButton>
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
          gap: 2,
        }}
      >
        {onNewNote && (
          <ChromeButton onClick={onNewNote} title="New note">
            <NewNoteIcon size={18} />
          </ChromeButton>
        )}
        {activeNote && (
          <ChromeButton
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              // Anchor the menu under the button, right-aligned to it.
              onNoteActions({ x: r.right, y: r.bottom + 4 });
            }}
            title="Note actions"
          >
            <MoreHorizontalIcon />
          </ChromeButton>
        )}
      </div>
    </>
  );
}
