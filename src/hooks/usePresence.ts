import { useEffect, useRef, useState } from "react";
import { MOTION_EXIT_MS, prefersReducedMotion } from "../tokens/motion";

/**
 * Lets a surface leave with an animation instead of vanishing.
 *
 * The app's popovers, dialogs and toasts are conditional on a value that turns
 * null when they close (`menu && <Menu {...menu} />`), which unmounts them
 * before an exit could play. Pass that value in: while it is set, `value` is
 * it; when it clears, `value` stays as the *last* one for `exitMs` with
 * `motion: "exit"`, then goes null. Render on `value`, put `motion` on the
 * surface as `data-motion`, and the stylesheet does the rest.
 *
 * - Unmount is a timer, never `animationend`: the event is lost when no
 *   animation runs (a window that is not painting, a cut-short animation) and
 *   the surface then stayed for good (the lesson of `Collapsible`).
 * - Reduced motion skips the exit entirely: closed is closed.
 * - A leaving surface takes no pointer (`[data-motion="exit"]` in
 *   GlobalStyles), or a click on it in its last 90ms would act twice. Keys are
 *   the parent's already: it has closed.
 */
export function usePresence<T>(
  value: T | null | undefined,
  exitMs: number = MOTION_EXIT_MS,
): { value: T | null; motion: "enter" | "exit" } {
  const open = value != null;
  const last = useRef<T | null>(null);
  if (open) last.current = value;
  const [, settle] = useState(0);
  const reduce = prefersReducedMotion();
  // Leaving is derived, not set in an effect: the render right after a close
  // must already hold the surface, or it would unmount and remount.
  const leaving = !open && last.current != null && !reduce;

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => {
      last.current = null;
      settle((n) => n + 1);
    }, exitMs);
    return () => clearTimeout(t);
  }, [leaving, exitMs]);

  if (open) return { value: value as T, motion: "enter" };
  if (leaving) return { value: last.current, motion: "exit" };
  return { value: null, motion: "exit" };
}
