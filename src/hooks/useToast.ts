import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What a notification is. The kind decides how long it stays and which mark it
 * carries: a receipt of something that went well fades on its own, and anything
 * the user may still have to act on waits to be dismissed, because a timer on a
 * save failure is a save failure nobody saw.
 */
export type ToastKind = "done" | "notice" | "warning" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  /** A glyph name (`ToastIcon`), where the kind's own mark is not the point. */
  icon?: string;
  /**
   * Notices about one condition carry one key, and a newer one takes the older
   * one's place: two failing saves are one problem, and the receipt that the
   * saving works again is what ends it.
   */
  key?: string;
  /** A receipt whose words can be clicked to give the thing it names a name (⌘S's save point). */
  nameable?: { onCommit: (name: string) => void };
  /** Its name field is open: it waits, whatever its kind, until the field closes. */
  editing?: boolean;
  /** One thing the receipt offers to do about what it reports: Undo. */
  action?: { label: string; run: () => void };
}

export interface ToastOptions {
  icon?: string;
  key?: string;
  nameable?: ToastItem["nameable"];
  action?: ToastItem["action"];
}

/** How long a receipt stays: long enough to read a name in it, no longer. */
export const DONE_MS = 3200;

/** Whether a kind sits there until it is dismissed. */
export const toastPersists = (kind: ToastKind) => kind !== "done";

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const drop = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      kind: ToastKind = "error",
      { icon, key, nameable, action }: ToastOptions = {},
    ) => {
      const id = Date.now() + Math.random();
      const toast: ToastItem = { id, message, kind, icon, key, nameable, action };
      setToasts((prev) => (key ? prev.filter((t) => t.key !== key) : prev).concat(toast));
      if (!toastPersists(kind)) {
        timers.current.set(
          id,
          setTimeout(() => drop(id), DONE_MS),
        );
      }
      return id;
    },
    [drop],
  );

  const dismissToast = drop;

  /** A receipt waits while it is pointed at or being named, and fades on its own clock after. */
  const holdToast = useCallback(
    (id: number, held: boolean) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      if (!held)
        timers.current.set(
          id,
          setTimeout(() => drop(id), DONE_MS),
        );
    },
    [drop],
  );

  const updateToast = useCallback((id: number, patch: Partial<ToastItem>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  return { toasts, showToast, dismissToast, holdToast, updateToast };
}
