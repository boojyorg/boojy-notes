import { type RefObject, useLayoutEffect } from "react";

/**
 * Keeps `data-empty` on an editable element while it holds no text, read from
 * the live DOM so a placeholder hides on the keystroke, not the commit. CSS
 * alone cannot say it: an empty field is one <br>, and so is a field with one
 * soft break, since selectors see elements, not text.
 */
export function useEmptyMark(ref: RefObject<HTMLElement | null>, enabled = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const mark = () => el.toggleAttribute("data-empty", el.textContent === "");
    mark();
    const observer = new MutationObserver(mark);
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    return () => {
      observer.disconnect();
      el.removeAttribute("data-empty");
    };
  }, [ref, enabled]);
}
