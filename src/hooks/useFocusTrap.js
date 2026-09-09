import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within a container element while `isOpen` is true.
 * Restores focus to the previously-focused element on close.
 *
 * Focus follows the closest active surface (review 2026-09-07, §4.1, §4.2):
 * a surface that has already placed its own focus keeps it (the confirm
 * dialog's default button, the palette's autofocused field), and a closing
 * surface hands focus back only while it still holds it. Before this, the
 * context menu's Rename opened the sidebar's rename field, and the menu's
 * cleanup then put focus back on the row's ··· a frame later: the field
 * blurred, committed the unchanged name and unmounted, so Rename from a menu
 * never worked; the same cleanup took focus off the confirm dialog's Cancel
 * button the moment a menu's Delete opened it.
 *
 * @param {React.RefObject<HTMLElement>} containerRef - ref to the trap container
 * @param {boolean} isOpen - whether the trap is active
 * @param {"first" | "container"} [initialFocus] - "container" parks initial
 *   focus on the container itself (give it tabIndex={-1}) instead of the first
 *   item. Menus opened by pointer use it so Chromium's script-focus heuristic
 *   can't paint a :focus-visible ring on the first item; real Tab/arrow use
 *   still moves focus into items and earns the ring legitimately.
 */
export function useFocusTrap(containerRef, isOpen, initialFocus = "first") {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Remember what was focused before the trap opened
    previousFocusRef.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Focus the first focusable element inside the container, unless the
    // surface has already put focus somewhere inside itself.
    const focusFirst = () => {
      if (container.contains(document.activeElement)) return;
      if (initialFocus === "container") {
        container.focus();
        return;
      }
      const focusable = container.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    };

    // Small delay so the DOM is painted
    const raf = requestAnimationFrame(focusFirst);

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;

      const focusable = container.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (focusable.length === 1) {
        // Single element — keep focus there
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey) {
        // Shift+Tab: wrap from first to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: wrap from last to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("keydown", handleKeyDown);

      // Restore focus to the element that was focused before the trap, but
      // only if the trap still holds it: focus inside the container, or on
      // the body because the container has just left the DOM. Focus that
      // another surface has taken meanwhile is that surface's.
      const active = document.activeElement;
      const stillHeld = !active || active === document.body || container.contains(active);
      const previous = previousFocusRef.current;
      if (stillHeld && previous && typeof previous.focus === "function") {
        previous.focus();
      }
    };
  }, [isOpen, containerRef, initialFocus]);
}
