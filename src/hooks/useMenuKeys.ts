import { useCallback, useEffect, useRef } from "react";
import { endIndex, stepIndex, typeAheadIndex } from "../utils/menuKeys";

/** How long typed letters stay one type-ahead word. */
export const TYPE_AHEAD_MS = 700;

export interface MenuRow {
  label: string;
  disabled?: boolean;
}

export interface MenuKeysOptions {
  /** The rows, in order, read when a key lands (a menu may build them after
   *  its hooks). Type-ahead reads the labels. */
  rows: () => MenuRow[];
  active: number;
  setActive: (i: number) => void;
  choose: (i: number) => void;
  close: () => void;
  /** A suggestion menu under the caret: Space and letters are typing, not the menu's. */
  suggestion?: boolean;
}

type KeyLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "defaultPrevented">;

/**
 * The shared menu keys (utils/menuKeys.ts). Returns a handler that answers
 * whether it took the key; the caller prevents (and, in a portal, stops) the
 * ones it took, from wherever it listens.
 */
export function useMenuKeys({
  rows,
  active,
  setActive,
  choose,
  close,
  suggestion = false,
}: MenuKeysOptions) {
  const typed = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: "",
    timer: null,
  });
  useEffect(() => {
    const pending = typed.current;
    return () => {
      if (pending.timer) clearTimeout(pending.timer);
    };
  }, []);

  return useCallback(
    (e: KeyLike): boolean => {
      if (e.defaultPrevented) return false;
      const list = rows();
      const labels = list.map((r) => r.label);
      const disabled = list.map((r) => !!r.disabled);
      const count = list.length;
      const mod = e.metaKey || e.ctrlKey || e.altKey;
      if (e.key === "Escape") {
        close();
        return true;
      }
      if (mod) return false;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const next = stepIndex(active, e.key === "ArrowDown" ? 1 : -1, count, disabled);
        if (next >= 0) setActive(next);
        return true;
      }
      if (e.key === "Home" || e.key === "End") {
        if (suggestion) return false;
        const next = endIndex(e.key === "Home" ? "first" : "last", count, disabled);
        if (next >= 0) setActive(next);
        return true;
      }
      if (e.key === "Enter" || (e.key === " " && !suggestion)) {
        if (active >= 0 && active < count && !disabled[active]) choose(active);
        return true;
      }
      if (!suggestion && e.key.length === 1 && e.key.trim()) {
        if (typed.current.timer) clearTimeout(typed.current.timer);
        typed.current.buffer += e.key;
        typed.current.timer = setTimeout(() => {
          typed.current.buffer = "";
          typed.current.timer = null;
        }, TYPE_AHEAD_MS);
        const next = typeAheadIndex(labels, typed.current.buffer, active);
        if (next >= 0 && !disabled[next]) setActive(next);
        return true;
      }
      return false;
    },
    [rows, active, setActive, choose, close, suggestion],
  );
}
