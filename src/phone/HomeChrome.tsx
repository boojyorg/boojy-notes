import { type ReactNode, useState } from "react";
import { MoreHorizontalIcon, NewNoteIcon, SearchIcon } from "../components/Icons";
import Menu, { type MenuAnchor } from "../components/Menu";
import Wordmark from "../components/Wordmark";
import { TOUCH } from "../constants/layout";
import { MARK_INK } from "../constants/themes";
import { useTheme } from "../hooks/useTheme";
import { NAV_BAR_H } from "../utils/uiScale";

/** The teal New note button's side. */
export const NEW_NOTE_SIZE = 72;

const PLAIN = { border: "none", background: "transparent", padding: 0, font: "inherit" } as const;

/**
 * Home's one top row on the phone: the N (the brand, and Settings as the
 * desktop's wordmark is), a field that opens Search, and ··· for what is
 * rarely wanted (New folder, Sort by, Settings). New note is not in the menu:
 * it has one way in, the teal button at the foot.
 */
export function HomeTop({
  onSettings,
  onSearch,
  onNewFolder,
  onSort,
}: {
  onSettings: () => void;
  onSearch: () => void;
  onNewFolder: () => void;
  /** Opens the Sort menu at the ··· button. */
  onSort: (anchor: MenuAnchor) => void;
}) {
  const { theme } = useTheme();
  const { TEXT, BG } = theme;
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const close = () => setMenu(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexGrow: 1, minWidth: 0 }}>
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
        <Wordmark height={22} markOnly />
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
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(e) => setMenu(e.currentTarget.getBoundingClientRect())}
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
        <MoreHorizontalIcon />
      </button>
      {menu && (
        <Menu
          label="More"
          idPrefix="home-more"
          testId="home-more-menu"
          anchor={menu}
          align="end"
          onClose={close}
          items={[
            {
              label: "New folder",
              action: () => {
                close();
                onNewFolder();
              },
            },
            {
              label: "Sort by…",
              action: () => {
                const at = menu;
                close();
                onSort(at);
              },
            },
            {
              label: "Settings",
              rule: true,
              action: () => {
                close();
                onSettings();
              },
            },
          ]}
        />
      )}
    </div>
  );
}

/**
 * Home's foot on the phone, under a line as the desktop's is: Recently
 * Deleted on the left (`children`), and New note on the right, the one teal
 * surface in the app, so the thing done most is the easiest to find and
 * reach. Its glyph is dark: white on the mark is 2:1.
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
          color: MARK_INK,
        }}
      >
        <NewNoteIcon size={28} />
      </button>
    </div>
  );
}
