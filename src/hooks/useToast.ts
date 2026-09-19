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
}

export interface ToastOptions {
  icon?: string;
  key?: string;
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
    (message: string, kind: ToastKind = "error", { icon, key }: ToastOptions = {}) => {
      const id = Date.now() + Math.random();
      const toast: ToastItem = { id, message, kind, icon, key };
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

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  return { toasts, showToast, dismissToast };
}
