import { EASE_ENTER, currentSettleMs, prefersReducedMotion } from "../tokens/motion";
import { cssZoom } from "./domHelpers";

/**
 * Where a block root was on screen when a reorder was asked for: its top, and
 * how opaque it looked there (a dropped block starts as its translucent copy).
 */
export type BlockPlace = { top: number; opacity?: number };

/** Every block root in the editor, by id. */
export function blockRoots(editor: HTMLElement | null): Map<string, HTMLElement> {
  const roots = new Map<string, HTMLElement>();
  if (!editor) return roots;
  for (const el of editor.querySelectorAll<HTMLElement>(":scope > [data-block-id]")) {
    if (el.dataset.blockId) roots.set(el.dataset.blockId, el);
  }
  return roots;
}

/** Each block root's top now, in viewport pixels. Taken before the commit. */
export function measureBlockPlaces(editor: HTMLElement | null): Map<string, BlockPlace> {
  const places = new Map<string, BlockPlace>();
  for (const [id, el] of blockRoots(editor))
    places.set(id, { top: el.getBoundingClientRect().top });
  return places;
}

/**
 * After a reorder, each block that changed place glides there from where it
 * was (FLIP: the new layout is measured, each block is drawn back at its old
 * place and let go). Call straight after the commit: React publishes a
 * discrete event's commit in a microtask, so the frame this waits for already
 * holds the new order and the old one is never painted twice.
 *
 * A scripted animation leaves no style behind, and the note's DOM and its
 * order are the committed ones throughout: only the paint moves. Reduced
 * motion skips it; so does a block that stays off screen both before and after.
 */
export function settleBlocks(editor: HTMLElement | null, before: Map<string, BlockPlace>): void {
  if (!editor || prefersReducedMotion()) return;
  requestAnimationFrame(() => {
    const duration = currentSettleMs();
    const viewH = window.innerHeight;
    for (const [id, el] of blockRoots(editor)) {
      const from = before.get(id);
      if (!from || typeof el.animate !== "function") continue;
      const r = el.getBoundingClientRect();
      const dy = from.top - r.top;
      if (Math.abs(dy) < 0.5 && from.opacity == null) continue;
      const offscreen = (top: number) => top + r.height < 0 || top > viewH;
      if (offscreen(from.top) && offscreen(r.top)) continue;
      // The root is inside the UI scale's zoom: its translate is CSS pixels.
      const shift = dy / cssZoom(el);
      el.animate(
        [
          { translate: `0 ${shift}px`, opacity: from.opacity ?? 1 },
          { translate: "0 0", opacity: 1 },
        ],
        { duration, easing: EASE_ENTER },
      );
    }
  });
}
