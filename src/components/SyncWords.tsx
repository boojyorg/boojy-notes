import { useTheme } from "../hooks/useTheme";
import type { PhoneSync } from "../phone/useSyncStatus";
import { describeProblem } from "../sync/syncStatus";
import { clock } from "../utils/versionTime";
import type { MenuItem } from "./Menu";

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

/** Sync's state in words, a line each: what Settings says, where there is room for sentences. */
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

/** Sync's state in a few words, under the location's name in Home's menu: what its tap will do when something is wrong. */
export function syncLine(status: PhoneSync["status"]): string {
  const { state, problems, lastSynced } = status;
  if (state === "off") return "On this phone only";
  if (state === "problem")
    return problems.some((p) => describeProblem(p).action === "sign-in")
      ? "Sign in again"
      : "Couldn't sync. Try again";
  if (state === "offline") return "Can't reach Dropbox";
  if (state === "syncing") {
    const count = syncCount(status);
    return count ? `Syncing… ${count}` : "Syncing…";
  }
  return lastSynced === null ? "Synced" : `Synced ${syncedAt(lastSynced)}`;
}

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
