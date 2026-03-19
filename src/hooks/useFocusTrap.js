import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within a container element while `isOpen` is true.
 * Restores focus to the previously-focused element on close.
 *
 * @param {React.RefObject<HTMLElement>} containerRef - ref to the trap container
 * @param {boolean} isOpen - whether the trap is active
 */
export function useFocusTrap(containerRef, isOpen) {
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    // Remember what was focused before the trap opened
    previousFocusRef.current = document.activeElement;

    const container = containerRef.current;
    if (!container) return;

    // Focus the first focusable element inside the container
    const focusFirst = () => {
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

      // Restore focus to the element that was focused before the trap
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === "function") {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, containerRef]);
}
