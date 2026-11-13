import { currentSettleMs, prefersReducedMotion } from "../tokens/motion";

/**
 * Takes a list back to its top in one short move, the same length however far
 * down it is: the browser's own smooth scroll takes longer the further it has
 * to go, and a tap on Home's N should be answered at once. Eased out, so the
 * list arrives rather than stops. At once under reduced motion.
 */
export function scrollToTop(list: HTMLElement) {
  const from = list.scrollTop;
  if (from <= 0) return;
  if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
    list.scrollTop = 0;
    return;
  }
  const ms = currentSettleMs();
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    list.scrollTop = Math.round(from * (1 - t) ** 3);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
