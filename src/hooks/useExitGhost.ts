import { type RefObject, useLayoutEffect, useRef } from "react";
import { cssZoom } from "../utils/domHelpers";
import { MOTION_EXIT_MS, prefersReducedMotion } from "../tokens/motion";

/**
 * Lets a surface leave with an animation without staying mounted.
 *
 * Holding a closing surface in the tree for its exit would keep its focus
 * trap, its key handlers and `focusOwner()` alive for those milliseconds, and
 * every rule about who owns a key assumes a closed surface is gone. So the
 * surface goes at once, as it always did, and leaves behind a *ghost*: a
 * copy of what it looked like, inert and unreachable, that fades away on the
 * small clock and removes itself.
 *
 * Call it in the component that renders the surface, with the surface's root
 * element. `open` is for a component that stays mounted and renders nothing
 * while closed (`ContextMenu`, `SlashMenu`): the ghost is made when it goes
 * false.
 *
 * - A component that stays mounted (`open`) has already lost its element when
 *   the cleanup runs, so its root must be `position: fixed` by inline style,
 *   the ghost's only position; otherwise none is made.
 * - The ghost is appended to `<body>`, inside the UI scale's `zoom` on
 *   `<html>`, so a fixed surface's own inline position is still right. One
 *   that is not fixed (a toast in its column) is placed from its rect, divided
 *   by `cssZoom`.
 * - The decision is a microtask later: if the element is still connected then,
 *   the cleanup was StrictMode rehearsing a mount, not a close.
 * - Nothing of the app survives on the copy: no ids, no `data-*` (rows are
 *   hit-tested by them), no `autofocus`, and `inert` + `aria-hidden`.
 * - Removal is a timer, never `animationend` (an event a hidden window loses).
 * - Reduced motion makes none.
 */
export function useExitGhost(ref: RefObject<HTMLElement | null>, open = true): void {
  // The element is learned on every commit, not once: a surface may render
  // nothing on its first pass (waiting for a measurement) and only then mount.
  const last = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (ref.current) last.current = ref.current;
  });
  useLayoutEffect(() => {
    if (!open) return;
    return () => {
      const el = last.current;
      if (!el || prefersReducedMotion()) return;
      const rect = el.isConnected ? el.getBoundingClientRect() : null;
      // Nowhere to put it: fixed by its own style, or measured while it was
      // still on screen. Otherwise a copy would land at the foot of the page.
      if (!rect && el.style.position !== "fixed") return;
      const ghost = makeGhost(el, rect);
      last.current = null;
      queueMicrotask(() => {
        if (el.isConnected) return;
        document.body.appendChild(ghost);
        window.setTimeout(() => ghost.remove(), MOTION_EXIT_MS + 60);
      });
    };
  }, [open]);
}

function makeGhost(el: HTMLElement, rect: DOMRect | null): HTMLElement {
  const ghost = el.cloneNode(true) as HTMLElement;
  for (const node of [ghost, ...ghost.querySelectorAll<HTMLElement>("*")]) {
    node.removeAttribute("id");
    node.removeAttribute("autofocus");
    for (const name of node.getAttributeNames()) {
      if (name.startsWith("data-")) node.removeAttribute(name);
    }
  }
  // A clone keeps an input's attribute, not what was typed into it.
  const from = el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  const to = ghost.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  from.forEach((field, i) => {
    if (to[i]) to[i].value = field.value;
  });
  if (rect && el.style.position !== "fixed") {
    const zoom = cssZoom(el);
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left / zoom}px`,
      top: `${rect.top / zoom}px`,
      width: `${rect.width / zoom}px`,
      height: `${rect.height / zoom}px`,
      margin: "0",
    });
  }
  ghost.classList.add("motion-ghost");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  return ghost;
}
