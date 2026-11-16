import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus within a container element while `isOpen` is true.
 * Restores focus to the previously-focused element on close.
 *
 * Focus follows the closest active surface: a surface that has already
 * placed its own focus keeps it (the confirm dialog's default button, the
 * palette's autofocused field), and a closing surface hands focus back only
 * while it still holds it, or a menu's Rename would lose its field to the
 * row's ··· a frame later.
 *
 * Tab walks the surface's Tab stops only. A row that is a button with
 * `tabIndex={-1}` (a palette's results, a tree's rows) can hold focus but is
 * no stop, so it is never the "last" the wrap waits for. The opener is read
 * while rendering, before an `autoFocus` field inside the surface takes
 * focus in the commit, and with it the selection it held, which is put back
 * if its text is still there.
 *
 * @param {React.RefObject<HTMLElement>} containerRef - ref to the trap container
 * @param {boolean} isOpen - whether the trap is active
 * @param {"first" | "container"} [initialFocus] - "container" parks initial
 *   focus on the container itself (give it tabIndex={-1}) instead of the first
 *   item. Menus opened by pointer use it so Chromium's script-focus heuristic
 *   can't paint a :focus-visible ring on the first item; real Tab/arrow use
 *   still moves focus into items and earns the ring legitimately.
 */
/** The elements Tab stops on inside `container`, in order. */
function tabStops(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => el.tabIndex >= 0);
}

export function useFocusTrap(containerRef, isOpen, initialFocus = "first") {
  const previousFocusRef = useRef(null);
  const ringedRef = useRef(false);
  const rangeRef = useRef(null);
  const openRef = useRef(false);

  // Remember what was focused before the trap opened, and whether it wore
  // the focus ring: focus handed back after a click-opened surface closes
  // on Escape would otherwise light up, since the last input was a key.
  // Read in the render that opens the surface: by the first effect an
  // autofocused field of the surface's own already holds focus.
  if (isOpen && !openRef.current && typeof document !== "undefined") {
    previousFocusRef.current = document.activeElement;
    ringedRef.current = document.activeElement?.matches?.(":focus-visible") ?? false;
    // The page has one selection: a text field in the surface takes it from
    // the note, and focus handed back alone would put the caret at the top.
    const sel = document.getSelection();
    rangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  }
  openRef.current = isOpen;

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    // What holds focus now, if it is not the surface's own: a surface opened
    // from a menu's item rendered while the closing menu still held focus,
    // and the menu has since handed it back to its row. The render's reading
    // stands only where the surface has taken focus itself (`autoFocus`).
    const now = document.activeElement;
    if (now && !container.contains(now) && now !== previousFocusRef.current) {
      previousFocusRef.current = now;
      ringedRef.current = now.matches?.(":focus-visible") ?? false;
      const sel = document.getSelection();
      rangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    }

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
      const stops = tabStops(container);
      const active = document.activeElement;
      const at = stops.indexOf(active);
      // Between two stops the browser's own Tab is right.
      if (at !== -1 && at !== (e.shiftKey ? 0 : stops.length - 1)) return;
      e.preventDefault();
      if (stops.length === 0) return;
      if (at !== -1) {
        // Wrap: the last stop to the first, the first to the last.
        stops[e.shiftKey ? stops.length - 1 : 0].focus();
        return;
      }
      // Focus on something that is no stop (the container, a row): the
      // nearest stop in the direction of travel, wrapping at the ends.
      const after = stops.find(
        (el) => active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      const before = stops.findLast(
        (el) => active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING,
      );
      const next = e.shiftKey ? (before ?? stops[stops.length - 1]) : (after ?? stops[0]);
      next.focus();
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("keydown", handleKeyDown);
      // Still open and still in the page: the effect is only being run again
      // (StrictMode), and nothing is closing.
      if (openRef.current && container.isConnected) return;
      const ringed = ringedRef.current;

      // Restore focus to the element that was focused before the trap, but
      // only if the trap still holds it: focus inside the container, or on
      // the body because the container has just left the DOM. Focus that
      // another surface has taken meanwhile is that surface's.
      const active = document.activeElement;
      const stillHeld = !active || active === document.body || container.contains(active);
      const previous = previousFocusRef.current;
      // Never scrolled: handing focus back to the editor, a contentEditable
      // spanning the note, scrolls it to wherever its caret sits.
      if (stillHeld && previous && typeof previous.focus === "function") {
        previous.focus({ preventScroll: true, focusVisible: ringed });
        const range = rangeRef.current;
        if (
          range?.startContainer.isConnected &&
          range.endContainer.isConnected &&
          previous.contains(range.commonAncestorContainer)
        ) {
          const sel = document.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    };
  }, [isOpen, containerRef, initialFocus]);
}
