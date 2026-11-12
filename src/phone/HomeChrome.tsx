import type { ReactNode } from "react";
import { NewNoteIcon, SearchIcon, SettingsIcon } from "../components/Icons";
import Wordmark from "../components/Wordmark";
import { TOUCH } from "../constants/layout";
import { useTheme } from "../hooks/useTheme";
import { NAV_BAR_H } from "../utils/uiScale";

/** The teal New note button's side. */
export const NEW_NOTE_SIZE = 72;

/** The N's height in the top row. */
const MARK_H = 28;

const PLAIN = { border: "none", background: "transparent", padding: 0, font: "inherit" } as const;

/**
 * Home's one top row on the phone: the N (the brand; it opens Settings as
 * the desktop's wordmark does), a field that opens Search, and the cog for
 * Settings. No menu: everything on Home is in sight and does one thing.
 */
export function HomeTop({
  onSettings,
  onSearch,
}: {
  onSettings: () => void;
  onSearch: () => void;
}) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexGrow: 1, minWidth: 0 }}>
      <button
        type="button"
        data-testid="wordmark-settings-button"
        aria-label="Notes — open Settings"
        onClick={onSettings}
        style={{
          ...PLAIN,
          height: TOUCH,
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {/* A mark beside the field, not a block as tall as it: the field is the row's height. */}
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
        data-testid="home-settings"
        aria-label="Settings"
        onClick={onSettings}
        style={{
          ...PLAIN,
          width: TOUCH,
          height: TOUCH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          borderRadius: 8,
          color: TEXT.secondary,
        }}
      >
        <SettingsIcon size={18} />
      </button>
    </div>
  );
}

/**
 * How far the New note button stands above the bottom of the screen's usable
 * part: its distance from the side, so the corner it sits in is square.
 */
export const NEW_NOTE_LIFT = 20;
/**
 * The room the list keeps at its end on the phone, so its last row scrolls
 * clear of the New note button, which stands over the list's corner.
 */
export const HOME_LIST_END = 56;

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
          right: NEW_NOTE_LIFT,
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
