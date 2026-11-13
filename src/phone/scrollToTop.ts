import { currentSettleMs, prefersReducedMotion } from "../tokens/motion";

/** The move under way on a list: how to stop it. */
const running = new WeakMap<HTMLElement, () => void>();
/** What takes the list back from the move: a finger, or a wheel. */
const TAKES_OVER = ["pointerdown", "touchstart", "wheel"] as const;

/**
 * Takes a list back to its top in one short move, the same length however far
 * down it is: the browser's own smooth scroll takes longer the further it has
 * to go, and a tap on Home's N should be answered at once. Eased out, so the
 * list arrives rather than stops. One move at a time per list, and a touch on
 * the list ends it: the list is the finger's first. At once under reduced motion.
 */
export function scrollToTop(list: HTMLElement) {
  running.get(list)?.();
  const from = list.scrollTop;
  if (from <= 0) return;
  if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
    list.scrollTop = 0;
    return;
  }
  const ms = currentSettleMs();
  const start = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const type of TAKES_OVER) list.removeEventListener(type, stop);
    running.delete(list);
  };
  const step = (now: number) => {
    // A frame's time can be earlier than the tap that asked for it: never below 0.
    const t = Math.min(1, Math.max(0, (now - start) / ms));
    list.scrollTop = Math.round(from * (1 - t) ** 3);
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  for (const type of TAKES_OVER) list.addEventListener(type, stop, { passive: true });
  running.set(list, stop);
  frame = requestAnimationFrame(step);
}
