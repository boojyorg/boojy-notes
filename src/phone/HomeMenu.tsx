import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  NewFolderIcon,
  RefreshIcon,
  SettingsIcon,
  SyncProblemIcon,
} from "../components/Icons";
import Menu, { type MenuAnchor, type MenuItem } from "../components/Menu";
import { SORT_MODES } from "../components/SortMenu";
import { useTheme } from "../hooks/useTheme";
import { SYNC_OFF_LINE, syncAction, syncLine, syncNeedsSettings } from "./syncWords";
import type { PhoneSync } from "./useSyncStatus";

/** How long the tick stands after a pass ends, before the arrows come back. */
export const DONE_SHOWS_MS = 1500;
/**
 * How long the arrows turn for a tap at the least: sync shows as working only
 * once a pass has run a while (SYNCING_SHOWS_AFTER_MS), so a quick one would
 * leave the tap unanswered.
 */
export const ASKED_TURNS_MS = 700;
/**
 * The menu's one width: its first row's words change while it is open, and a
 * menu that grew would leave the ··· it hangs from. Every line of syncLine fits.
 */
const WIDTH = 200;

/**
 * Home's one menu on the phone, under the ··· of its top row: everything that
 * is not done every day. First where the notes are and how sync is, in a few
 * words: with Dropbox connected that row is the way to sync now, or to sign in
 * again when that is what is wrong, and the menu stays open so its arrows can
 * be seen to turn and end in a tick. Then New folder, the list's two orders
 * (the desktop's Sort menu, in place) and Settings. Changing the storage
 * location is Settings' alone: it is rare, and a wrong tap here would move
 * the whole list.
 */
export default function HomeMenu({
  anchor,
  name,
  sync,
  sortMode,
  setSortMode,
  onNewFolder,
  onSettings,
  onClose,
}: {
  anchor: MenuAnchor;
  /** The open storage location's name. */
  name: string;
  sync: PhoneSync | null;
  sortMode: string;
  setSortMode: (mode: string) => void;
  onNewFolder: () => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const state = sync?.status.state ?? "off";
  const act = sync ? syncAction(sync) : null;

  // The arrows turn while a pass runs, and for a moment after a tap that asked
  // for one. Turning that ends synced says so: a tick, for a moment.
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!asked) return;
    const timer = setTimeout(() => setAsked(false), ASKED_TURNS_MS);
    return () => clearTimeout(timer);
  }, [asked]);
  const turning = asked || state === "syncing";
  const [done, setDone] = useState(false);
  const wasTurning = useRef(turning);
  useEffect(() => {
    const ended = wasTurning.current && !turning && state === "synced";
    wasTurning.current = turning;
    setDone(ended);
    if (!ended) return;
    const timer = setTimeout(() => setDone(false), DONE_SHOWS_MS);
    return () => clearTimeout(timer);
  }, [turning, state]);

  const glyph =
    state === "problem" ? (
      <span
        data-testid="home-sync-problem"
        style={{ display: "flex", color: theme.SEMANTIC.warning }}
      >
        <SyncProblemIcon />
      </span>
    ) : done ? (
      <span data-testid="home-sync-done" style={{ display: "flex" }}>
        <CheckIcon />
      </span>
    ) : (
      <span
        data-testid="home-sync-arrows"
        className={turning ? "sync-turning" : undefined}
        style={{ display: "flex" }}
      >
        <RefreshIcon />
      </span>
    );

  const items: MenuItem[] = [
    ...(sync && act
      ? [
          {
            label: name,
            detail: syncLine(sync.status),
            trailing: glyph,
            testId: "home-sync",
            // A fix that is the person's own is said in Settings. Else the menu
            // stays: the arrows and the tick are this tap's answer.
            action: syncNeedsSettings(sync.status)
              ? () => {
                  onClose();
                  onSettings();
                }
              : () => {
                  setAsked(true);
                  act.action?.();
                },
          },
        ]
      : []),
    {
      label: "New folder",
      icon: <NewFolderIcon />,
      rule: true,
      testId: "home-new-folder",
      action: () => {
        onClose();
        onNewFolder();
      },
    },
    ...SORT_MODES.map(
      ({ label, mode, icon }, i): MenuItem => ({
        label,
        icon,
        rule: i === 0,
        role: "menuitemradio",
        checked: sortMode === mode,
        action: () => {
          setSortMode(mode);
          onClose();
        },
      }),
    ),
    {
      label: "Settings",
      icon: <SettingsIcon />,
      rule: true,
      testId: "home-open-settings",
      action: () => {
        onClose();
        onSettings();
      },
    },
  ];

  return (
    <Menu
      label="Home"
      idPrefix="home-menu"
      testId="home-menu"
      anchor={anchor}
      align="end"
      gapY={4}
      minWidth={WIDTH}
      maxWidth={WIDTH}
      checkTestId="sort-check"
      onClose={onClose}
      items={items}
      // With no Dropbox there is nothing to do about sync: the name and where the notes are, as words.
      header={
        act ? undefined : (
          <div data-testid="home-location" style={{ padding: "8px 14px 6px", fontSize: 15 }}>
            {name}
            <span style={{ display: "block", color: theme.TEXT.muted, fontSize: 13 }}>
              {sync ? syncLine(sync.status) : SYNC_OFF_LINE}
            </span>
          </div>
        )
      }
    />
  );
}
