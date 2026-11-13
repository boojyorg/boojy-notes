import type { MenuItem } from "../components/Menu";
import { describeProblem } from "../sync/syncStatus";
import { clock } from "../utils/versionTime";
import type { PhoneSync } from "./useSyncStatus";

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

/** Where the notes are, said where nothing syncs them. */
export const SYNC_OFF_LINE = "On this phone only";

/**
 * A problem no retry or sign-in mends (a file Dropbox won't take): the fix is
 * the person's, and Settings says which file and what to do.
 */
export const syncNeedsSettings = ({ state, problems }: PhoneSync["status"]) =>
  state === "problem" && problems.every((p) => describeProblem(p).action === undefined);

/**
 * Sync's state in a few words, under the location's name in Home's menu: the
 * state, or what the row's tap will do about it. Short enough for the menu's
 * fixed width (HomeMenu), so it never has to be cut.
 */
export function syncLine(status: PhoneSync["status"]): string {
  const { state, problems, lastSynced } = status;
  if (state === "off") return SYNC_OFF_LINE;
  if (state === "problem") {
    if (problems.some((p) => describeProblem(p).action === "sign-in")) return "Sign in again";
    return syncNeedsSettings(status) ? "See Settings to fix" : "Couldn't sync";
  }
  if (state === "offline") return "Can't reach Dropbox";
  if (state === "syncing") {
    const count = syncCount(status);
    return count ? `Syncing… ${count}` : "Syncing…";
  }
  return lastSynced === null ? "Synced" : `Synced ${syncedAt(lastSynced)}`;
}
