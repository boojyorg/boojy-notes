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
        <SettingsIcon />
      </button>
    </div>
  );
}

/**
 * Home's foot on the phone, under a line as the desktop's is: Recently
 * Deleted on the left (`children`), and New note on the right, the one teal
 * surface in the app, so the thing done most is the easiest to find and
 * reach. Its glyph is white on the mark by Tyr's choice (about 2:1): the
 * button's place, size and colour say what it is, not the glyph alone.
 */
export function HomeFoot({ onNewNote, children }: { onNewNote: () => void; children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        borderTop: `1px solid ${theme.BG.divider}`,
        padding: `12px 20px calc(12px + ${NAV_BAR_H}) 0`,
      }}
    >
      <div style={{ flexGrow: 1, minWidth: 0 }}>{children}</div>
      <button
        type="button"
        className="press"
        data-testid="home-new-note"
        aria-label="New note"
        onClick={onNewNote}
        style={{
          ...PLAIN,
          width: NEW_NOTE_SIZE,
          height: NEW_NOTE_SIZE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
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
