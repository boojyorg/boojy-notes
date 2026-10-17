import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ToastKind, ToastOptions } from "../hooks/useToast";
import { getAPI } from "../services/apiProvider";
import { describeProblem, problemsKey, type SyncStatus } from "../sync/syncStatus";

/** Sync as the app sees it (install.ts hands it over on the phone). */
export interface PhoneSyncAPI {
  status(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
  syncNow(): void;
  /** Throws when the sign-in is cancelled or fails; nothing changes then. */
  signInAgain(): Promise<void>;
}

/** Syncing shows only once a pass has taken this long: most end sooner, and the glyph would blink. */
export const SYNCING_SHOWS_AFTER_MS = 600;
const TOAST_KEY = "sync";

type ShowToast = (message: string, kind?: ToastKind, options?: ToastOptions) => unknown;

const syncAPI = (): PhoneSyncAPI | undefined =>
  (getAPI() as { sync?: PhoneSyncAPI } | undefined)?.sync;

/**
 * Sync's state for Home's folder row, on the phone; null elsewhere. A new
 * problem also says so in a toast, which waits for its ×, so it is seen from
 * the note's screen too; once every problem it told of has gone, a receipt
 * says so. Being offline is no news.
 */
export function useSyncStatus({ showToast }: { showToast: ShowToast }) {
  const api = useRef(syncAPI()).current;
  const [status, setStatus] = useState<SyncStatus | null>(() => api?.status() ?? null);
  const [shown, setShown] = useState<SyncStatus | null>(status);
  const told = useRef("");

  useEffect(() => api?.subscribe(setStatus), [api]);

  // A pass that ends quickly never shows as syncing; the state before it stays.
  useEffect(() => {
    if (!status) return;
    if (status.state !== "syncing" || shown?.state === "syncing") {
      setShown(status);
      return;
    }
    const timer = setTimeout(() => setShown(status), SYNCING_SHOWS_AFTER_MS);
    return () => clearTimeout(timer);
    // biome-ignore lint/correctness/useExhaustiveDependencies: the new status is the trigger
  }, [status]);

  const signInAgain = useCallback(async () => {
    try {
      await api?.signInAgain();
    } catch (error) {
      // Cancelled: the problem still stands and says what to do.
      console.log("[sync] sign-in again:", (error as Error)?.message ?? error);
    }
  }, [api]);

  const syncNow = useCallback(() => api?.syncNow(), [api]);

  useEffect(() => {
    if (!status) return;
    const key = problemsKey(status.problems);
    if (key === told.current) return;
    if (!key) {
      showToast("Synced again", "done", { key: TOAST_KEY });
    } else {
      const { text, action } = describeProblem(status.problems[0]);
      showToast(text, "warning", {
        key: TOAST_KEY,
        action:
          action === "sign-in"
            ? { label: "Sign in again", run: signInAgain }
            : action === "retry"
              ? { label: "Try again", run: syncNow }
              : undefined,
      });
    }
    told.current = key;
  }, [status, showToast, signInAgain, syncNow]);

  // One object per shown state: the sidebar is memoised on its props.
  return useMemo(
    () => (api && shown ? { status: shown, syncNow, signInAgain } : null),
    [api, shown, syncNow, signInAgain],
  );
}

export type PhoneSync = NonNullable<ReturnType<typeof useSyncStatus>>;
