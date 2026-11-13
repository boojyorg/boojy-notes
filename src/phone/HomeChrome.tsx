import type { ReactNode } from "react";
import { MoreHorizontalIcon, NewNoteIcon, SearchIcon } from "../components/Icons";
import type { MenuAnchor } from "../components/Menu";
import Wordmark from "../components/Wordmark";
import { TOUCH } from "../constants/layout";
import { useTheme } from "../hooks/useTheme";
import { NAV_BAR_H } from "../utils/uiScale";

/** The teal New note button's side. */
export const NEW_NOTE_SIZE = 72;

/** The N's height in the top row. */
const MARK_H = 28;

/** The air on either side of the Search field: to the N, and to the ···'s dots. */
const FIELD_GAP = 20;
/** How far the ···'s dots stand inside their button: an 18px glyph, centred, its dots 3px inside it. */
const MORE_INSET = (TOUCH - 18) / 2 + 3;

const PLAIN = { border: "none", background: "transparent", padding: 0, font: "inherit" } as const;

/**
 * Home's one top row on the phone: the N (the brand; a tap takes the list
 * back to its top, and leads nowhere), a field that opens Search, and the ···
 * whose menu holds everything else (`HomeMenu`): one way to each thing. The
 * ··· is the note's own ··· button (EditorChrome): its size and corners, on
 * the row's grey while its menu is open. It carries a dot only while sync
 * needs the person; synced, syncing or offline it says nothing. The field
 * stands as far from the N as from the ···'s dots, which sit inside a button
 * wider than they are. A press brightens the N (`.home-mark`, GlobalStyles).
 */
export function HomeTop({
  onTop,
  onSearch,
  onMenu,
  menuOpen,
  syncTrouble,
}: {
  onTop: () => void;
  onSearch: () => void;
  onMenu: (anchor: MenuAnchor) => void;
  menuOpen: boolean;
  syncTrouble: boolean;
}) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  return (
    <div style={{ display: "flex", alignItems: "center", flexGrow: 1, minWidth: 0 }}>
      {/* A mark beside the field, not a block as tall as it: the field is the row's height. */}
      <button
        type="button"
        data-testid="home-mark"
        className="home-mark"
        aria-label="Back to top"
        onClick={onTop}
        style={{
          ...PLAIN,
          height: TOUCH,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          marginRight: FIELD_GAP,
        }}
      >
        <Wordmark height={MARK_H} markOnly />
      </button>
      <button
        type="button"
        data-testid="home-search"
        aria-label="Search notes"
        onClick={onSearch}
        style={{
          ...PLAIN,
          flexGrow: 1,
          minWidth: 0,
          height: TOUCH,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 14px",
          borderRadius: 12,
          background: BG.hover,
          color: TEXT.muted,
          fontSize: 16,
          textAlign: "left",
        }}
      >
        <SearchIcon size={18} />
        <span>Search notes</span>
      </button>
      <button
        type="button"
        data-testid="home-more"
        className="press"
        aria-label={syncTrouble ? "More. Sync needs attention" : "More"}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => onMenu(e.currentTarget.getBoundingClientRect())}
        style={{
          ...PLAIN,
          position: "relative",
          width: TOUCH,
          height: TOUCH,
          marginLeft: FIELD_GAP - MORE_INSET,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          borderRadius: 6,
          background: menuOpen ? BG.hover : "transparent",
          color: menuOpen ? TEXT.primary : TEXT.secondary,
        }}
      >
        <MoreHorizontalIcon />
        {syncTrouble && (
          <span
            data-testid="home-sync-dot"
            style={{
              position: "absolute",
              top: 9,
              right: 7,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: theme.SEMANTIC.warning,
              // A ring of the ground it is on, so the dot reads apart from the glyph under it.
              boxShadow: `0 0 0 2px ${menuOpen ? BG.hover : BG.standard}`,
            }}
          />
        )}
      </button>
    </div>
  );
}

/** How far the New note button stands from the side of the screen. */
const NEW_NOTE_SIDE = 20;
/**
 * How far it stands above the bottom of the screen's usable part: a little
 * more than from the side, since the gesture bar under it makes that gap
 * read smaller than it is. Judged on a Pixel.
 */
export const NEW_NOTE_LIFT = 24;
/**
 * The room the list keeps at its end on the phone, so its last row scrolls
 * clear of the New note button, which stands over the list's corner: it
 * grows with the button's lift.
 */
export const HOME_LIST_END = NEW_NOTE_LIFT + 36;

/**
 * Home's foot on the phone, as the desktop's: a line the width of the screen,
 * then Recently Deleted as one quiet row (`children`). New note stands over
 * the corner, across the line: the one teal surface in the app, so the thing
 * done most is the easiest to find and reach. Its glyph is white on the mark
 * by Tyr's choice (about 2:1): the button's place, size and colour say what
 * it is, not the glyph alone.
 */
export function HomeFoot({ onNewNote, children }: { onNewNote: () => void; children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        position: "relative",
        flexShrink: 0,
        borderTop: `1px solid ${theme.BG.divider}`,
        padding: `6px 0 calc(6px + ${NAV_BAR_H})`,
      }}
    >
      {/* Recently Deleted keeps clear of the button beside it. */}
      <div style={{ marginRight: NEW_NOTE_SIZE + 28, minHeight: 1 }}>{children}</div>
      <button
        type="button"
        className="press"
        data-testid="home-new-note"
        aria-label="New note"
        onClick={onNewNote}
        style={{
          ...PLAIN,
          position: "absolute",
          right: NEW_NOTE_SIDE,
          bottom: `calc(${NEW_NOTE_LIFT}px + ${NAV_BAR_H})`,
          width: NEW_NOTE_SIZE,
          height: NEW_NOTE_SIZE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 22,
          background: theme.ACCENT.primary,
          color: theme.ACCENT.onAccent,
        }}
      >
        <NewNoteIcon size={28} />
      </button>
    </div>
  );
}
