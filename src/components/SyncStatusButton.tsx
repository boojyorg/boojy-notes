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

/** Sync's state in words, a line each: what the menu on Home and Settings both say. */
export function syncLines({ state, problems, lastSynced }: PhoneSync["status"]): string[] {
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
          ? ["Syncing with Dropbox…"]
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
export const SYNC_NAME = NAME;

/**
 * Sync's state after the phone's folder name on Home: muted, but in the
 * warning colour while something needs the person. A tap says it in words,
 * with the one thing to do about it (sign in again, try again, or sync now)
 * and the way to Settings, where Dropbox is connected and the notes' folder
 * is chosen.
 */
export default function SyncStatusButton({
  sync,
  onOpenSettings,
}: {
  sync: PhoneSync;
  onOpenSettings: () => void;
}) {
  const { theme } = useTheme();
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const { state } = sync.status;
  const Glyph = GLYPH[state];
  const lines = syncLines(sync.status);
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
        aria-label={`Sync: ${NAME[state]}`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-testid="sync-status"
        data-state={state}
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        style={{
          width: TOUCH,
          height: TOUCH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          padding: 0,
          border: "none",
          borderRadius: 8,
          background: "transparent",
          color: state === "problem" ? theme.SEMANTIC.warning : theme.TEXT.muted,
          cursor: "pointer",
        }}
      >
        <Glyph />
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
          header={
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
          }
        />
      )}
    </>
  );
}
