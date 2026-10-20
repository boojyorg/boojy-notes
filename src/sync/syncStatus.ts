import { DropboxHttpError } from "./dropboxClient";
import type { Attention, PassResult } from "./engine";

/**
 * What the phone shows about sync: one of four states, and the problems that
 * need a person. The runner's passes report here (`started`, `finished`,
 * `failed`) and saves report `changed`; the state is worked out from those,
 * never kept on its own, so it cannot drift from what happened.
 *
 * - **Synced** promises that everything has settled: no save waiting for its
 *   pass, no pass running or asking for another, no retry due, nothing held
 *   back. Before the first pass settles it is syncing, never assumed synced.
 * - **Offline**: Dropbox can't be reached (or is too busy to answer). Normal on
 *   a phone, so never a problem; it ends when a pass gets through.
 * - **A problem** stays until its own cause is gone. A file held back is
 *   reported by every pass that meets it, so a pass without it clears it. One
 *   that stops passes (signed out, a full Dropbox or phone, failing) clears
 *   only when a pass settles: then nothing is left unsent, so it no longer
 *   stands in the way.
 */

export type SyncState = "syncing" | "synced" | "offline" | "problem";

export type SyncProblem =
  | Attention
  | { kind: "signed-out" }
  /** Another account signed in: syncing it would read every note as deleted there. */
  | { kind: "other-account" }
  | { kind: "dropbox-full" }
  | { kind: "phone-full" }
  | { kind: "failing"; message: string };

export interface SyncStatus {
  state: SyncState;
  /** When a pass last settled (ms), or null since the app opened. */
  lastSynced: number | null;
  problems: SyncProblem[];
}

/** What a failed pass means, and when to try again (null: not until asked). */
export type FailureMeaning =
  | { offline: true; retryAfterMs: number | null }
  | { problem: SyncProblem }
  | { other: string };

/** Passes that fail for no reason we know, in a row, before it is a problem. */
export const FAILING_AFTER = 3;

const message = (error: unknown) => (error as Error)?.message ?? String(error);

export function failureMeaning(error: unknown): FailureMeaning {
  if (error instanceof DropboxHttpError) {
    if (error.status === 401 || error.summary.includes("invalid_grant")) {
      return { problem: { kind: "signed-out" } };
    }
    if (error.summary.includes("insufficient_space")) return { problem: { kind: "dropbox-full" } };
    if (error.status === 429 || error.status >= 500) {
      return {
        offline: true,
        retryAfterMs: error.retryAfter === null ? null : error.retryAfter * 1000,
      };
    }
    return { other: message(error) };
  }
  // fetch's own failure: no network, or Dropbox out of reach.
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return { offline: true, retryAfterMs: null };
  }
  if (/ENOSPC|no space left|not enough space|disk full/i.test(message(error))) {
    return { problem: { kind: "phone-full" } };
  }
  return { other: message(error) };
}

export function createSyncStatus({ now = Date.now } = {}) {
  let pending = false;
  let running = false;
  let settled = false;
  let offline = false;
  let lastSynced: number | null = null;
  let held: Attention[] = [];
  let stopped: SyncProblem | null = null;
  /** A sign-in refused: passes go on with the kept one, so no pass ends it. */
  let refusal: SyncProblem | null = null;
  let failures = 0;
  const listeners = new Set<(status: SyncStatus) => void>();

  const status = (): SyncStatus => {
    const problems = [...(refusal ? [refusal] : []), ...(stopped ? [stopped] : []), ...held];
    const state: SyncState = problems.length
      ? "problem"
      : offline
        ? "offline"
        : running || pending || !settled
          ? "syncing"
          : "synced";
    return { state, lastSynced, problems };
  };
  const emit = () => {
    const current = status();
    for (const listener of listeners) listener(current);
  };

  return {
    status,
    subscribe(listener: (status: SyncStatus) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** A save on the phone: unsent until a pass starts after it. */
    changed() {
      pending = true;
      emit();
    },
    started() {
      running = true;
      pending = false;
      emit();
    },
    finished(result: PassResult) {
      running = false;
      offline = false;
      failures = 0;
      held = result.attention;
      settled = !result.again;
      if (settled) {
        stopped = null;
        lastSynced = now();
      }
      emit();
    },
    failed(error: unknown): FailureMeaning {
      running = false;
      settled = false;
      const meaning = failureMeaning(error);
      if ("offline" in meaning) offline = true;
      else if ("problem" in meaning) {
        offline = false;
        stopped = meaning.problem;
      } else {
        offline = false;
        failures++;
        if (failures >= FAILING_AFTER) stopped = { kind: "failing", message: meaning.other };
      }
      emit();
      return meaning;
    },
    /** A sign-in that can't be used (a different account) is a problem until the right one. */
    refused(problem: SyncProblem) {
      refusal = problem;
      emit();
    },
    /** The right sign-in, taken: a refusal before it is over. */
    accepted() {
      refusal = null;
      emit();
    },
  };
}

export type SyncStatusTracker = ReturnType<typeof createSyncStatus>;

/** What a problem says, and what the person can do about it here. */
export function describeProblem(problem: SyncProblem): {
  text: string;
  action?: "sign-in" | "retry";
} {
  switch (problem.kind) {
    case "signed-out":
      return {
        text: "Dropbox sign-in has expired. Sign in again to keep syncing.",
        action: "sign-in",
      };
    case "other-account":
      return {
        text: "That's a different Dropbox account. Sign in with the one these notes came from.",
        action: "sign-in",
      };
    case "dropbox-full":
      return {
        text: "Your Dropbox is full, so changes can't be sent. Free up space in Dropbox.",
        action: "retry",
      };
    case "phone-full":
      return {
        text: "This phone is out of storage, so changes from Dropbox can't be saved. Free up space.",
        action: "retry",
      };
    case "failing":
      return { text: `Sync keeps failing: ${problem.message}`, action: "retry" };
    case "case":
      return {
        text: `${problem.paths.map((p) => `“${p}”`).join(" and ")} differ only in capitals, so Dropbox can't keep both. Rename one.`,
      };
    case "too-large":
      return {
        text: `“${problem.path}” is over 150 MB, and Dropbox won't take files that big. Make it smaller or move it out of the folder.`,
      };
    case "refused":
      return { text: `“${problem.path}” has a name Dropbox won't take. Rename it.` };
  }
}

/** One string per set of problems: a new set is news, the same set again is not. */
export const problemsKey = (problems: SyncProblem[]) =>
  problems.map((p) => JSON.stringify(p)).join("|");
