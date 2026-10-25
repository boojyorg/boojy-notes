/**
 * The focus ring is for keyboard use, and a modifier alone is not keyboard
 * use. Chromium rings the focused element at any keydown except ⌘, Ctrl and
 * ⌥, so Shift pressed for a Shift-click lit the row clicked before it, until
 * the click moved focus on: a flash.
 *
 * An element that takes focus without the ring is marked
 * (`data-pointer-focus`), and the mark hides the ring (GlobalStyles). The
 * first key that is not a lone modifier takes the mark off, so the ring
 * Chromium then draws is shown; leaving focus takes it off too.
 */
export const POINTER_FOCUS = "data-pointer-focus";

const MODIFIERS = new Set(["Shift", "Meta", "Control", "Alt", "CapsLock", "Fn"]);

export function installFocusRingGuard(doc: Document = document) {
  doc.addEventListener(
    "focusin",
    (e) => {
      const el = e.target as Element;
      if (!el.matches(":focus-visible")) el.setAttribute(POINTER_FOCUS, "");
    },
    true,
  );
  doc.addEventListener(
    "focusout",
    (e) => (e.target as Element).removeAttribute(POINTER_FOCUS),
    true,
  );
  doc.addEventListener(
    "keydown",
    (e) => {
      if (!MODIFIERS.has(e.key)) doc.activeElement?.removeAttribute(POINTER_FOCUS);
    },
    true,
  );
}
