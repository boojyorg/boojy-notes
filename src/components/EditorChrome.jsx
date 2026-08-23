import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { SidebarToggleIcon, MoreHorizontalIcon } from "./Icons";

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
 * `topOffset` clears the desktop TitleBar (window drag region); on web it is 0.
 */

export const CHROME_INSET = 10;
export const CHROME_BTN = 32;

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

export default function EditorChrome({ topOffset = 0, activeNote, onNoteActions }) {
  const { sidebarVisible, toggleSidebar } = useLayout();

  return (
    <>
      {!sidebarVisible && (
        <div
          style={{
            position: "fixed",
            top: topOffset + CHROME_INSET,
            left: CHROME_INSET,
            zIndex: Z.TOOLBAR,
          }}
        >
          <ChromeButton onClick={toggleSidebar} title="Show sidebar">
            <SidebarToggleIcon />
          </ChromeButton>
        </div>
      )}

      {activeNote && (
        <div
          style={{
            position: "fixed",
            top: topOffset + CHROME_INSET,
            right: CHROME_INSET,
            zIndex: Z.TOOLBAR,
          }}
        >
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
        </div>
      )}
    </>
  );
}
