import { type ComponentType, useState } from "react";
import { TOUCH } from "../constants/layout";
import { useTheme } from "../hooks/useTheme";
import type { PhoneSync } from "../phone/useSyncStatus";
import { describeProblem, type SyncState } from "../sync/syncStatus";
import { clock } from "../utils/versionTime";
import { SyncedIcon, SyncingIcon, SyncOffIcon, SyncOfflineIcon, SyncProblemIcon } from "./Icons";
import Menu, { type MenuAnchor, type MenuItem } from "./Menu";

const GLYPH: Record<SyncState, ComponentType<{ size?: number }>> = {
  off: SyncOffIcon,
  synced: SyncedIcon,
  syncing: SyncingIcon,
  offline: SyncOfflineIcon,
  problem: SyncProblemIcon,
};

const NAME: Record<SyncState, string> = {
  off: "Dropbox not connected",
  synced: "Synced",
  syncing: "Syncing",
  offline: "Offline",
  problem: "Needs attention",
};

/** `09:42` (or `9:42 AM`, by the phone's language) today, `16 Oct` before. */
export function syncedAt(ms: number, now = new Date()) {
  const at = new Date(ms);
  return at.toDateString() === now.toDateString()
    ? clock(ms)
    : at.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** "34 of 180" while a pass works through more than one file: a first sync takes minutes. */
export function syncCount({ state, progress }: PhoneSync["status"]) {
  return state === "syncing" && progress && progress.total > 1
    ? `${progress.done} of ${progress.total}`
    : null;
}

/** Sync's state in words, a line each: what the menu on Home and Settings both say. */
export function syncLines(status: PhoneSync["status"]): string[] {
  const { state, problems, lastSynced } = status;
  const count = syncCount(status);
  const last = lastSynced === null ? null : syncedAt(lastSynced);
  return state === "off"
    ? ["Dropbox not connected. Your notes are on this phone only."]
    : state === "problem"
      ? problems.map((p) => describeProblem(p).text)
      : state === "offline"
        ? [
            "Can't reach Dropbox. Sync will resume when it's reachable.",
            ...(last ? [`Last synced ${last}.`] : []),
          ]
        : state === "syncing"
          ? [`Syncing with Dropbox…${count ? ` ${count} files` : ""}`]
          : [`Synced with Dropbox${last ? ` · ${last}` : ""}`];
}

/** The one thing to do about sync's state while Dropbox is connected; none while it is not. */
export function syncAction(sync: PhoneSync): MenuItem | null {
  const { state, problems } = sync.status;
  if (state === "off") return null;
  const signIn = problems.some((p) => describeProblem(p).action === "sign-in");
  return {
    label: signIn ? "Sign in again" : state === "problem" ? "Try again" : "Sync now",
    testId: signIn ? "sync-sign-in" : "sync-now",
    action: () => (signIn ? sync.signInAgain() : sync.syncNow()),
  };
}

export const SYNC_GLYPH = GLYPH;

/** Sync's state in words, at the head of a menu. */
export function SyncWords({ lines }: { lines: string[] }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        padding: "8px 10px",
        fontSize: 14,
        lineHeight: 1.45,
        color: theme.TEXT.primary,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {lines.map((line) => (
        <p key={line} style={{ margin: 0 }}>
          {line}
        </p>
      ))}
    </div>
  );
}

/**
 * Home's heading on the phone: the list's name, then sync's state as a glyph
 * (none with no Dropbox), in the warning colour while something needs the
 * person. One button: a tap says the state in words,
 * with the one thing to do about it (sign in again, try again, or sync now)
 * and the way to Settings, where Dropbox is connected and the notes' folder
 * is chosen.
 */
export default function SyncStatusButton({
  name,
  sync,
  onOpenSettings,
  onOpen,
  expanded = false,
}: {
  /** The list's name ("Personal", or "Phone" with no Dropbox), which the button says first. */
  name: string;
  sync: PhoneSync;
  onOpenSettings: () => void;
  /** The storage-location menu's, where there is one: the tap opens that, as the desktop's name does. */
  onOpen?: (anchor: MenuAnchor) => void;
  /** Whether that menu is open. */
  expanded?: boolean;
}) {
  const { theme } = useTheme();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const { state } = sync.status;
  const Glyph = GLYPH[state];
  const lines = syncLines(sync.status);
  const count = syncCount(sync.status);
  const close = () => setAnchor(null);
  const act = syncAction(sync);
  const items: MenuItem[] = [
    ...(act
      ? [
          {
            ...act,
            action: () => {
              close();
              act.action?.();
            },
          },
        ]
      : []),
    {
      label: "Storage and sync…",
      testId: "sync-settings",
      action: () => {
        close();
        onOpenSettings();
      },
    },
  ];

  return (
    <>
      <button
        type="button"
        aria-label={`${name}. Sync: ${NAME[state]}`}
        aria-haspopup="menu"
        aria-expanded={onOpen ? expanded : anchor !== null}
        data-testid="sync-status"
        data-state={state}
        onClick={(e) => (onOpen ?? setAnchor)(e.currentTarget.getBoundingClientRect())}
        style={{
          height: TOUCH,
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 1,
          minWidth: 0,
          padding: 0,
          border: "none",
          background: "transparent",
          font: "inherit",
          fontSize: 14,
          fontWeight: 500,
          color: theme.TEXT.muted,
          cursor: "pointer",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
        {/* No Dropbox, no glyph: the name alone says the notes are the phone's. */}
        {state !== "off" && (
          <span
            style={{
              display: "flex",
              color: state === "problem" ? theme.SEMANTIC.warning : theme.TEXT.muted,
            }}
          >
            <Glyph />
          </span>
        )}
        {count && (
          <span style={{ flexShrink: 0, fontWeight: 400, fontVariantNumeric: "tabular-nums" }}>
            {count}
          </span>
        )}
      </button>
      {anchor && (
        <Menu
          label="Sync"
          idPrefix="sync-status"
          testId="sync-menu"
          anchor={anchor}
          onClose={close}
          maxWidth={300}
          items={items}
          header={<SyncWords lines={lines} />}
        />
      )}
    </>
  );
}
