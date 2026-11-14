import { flushSync } from "react-dom";
import { prefersReducedMotion } from "../tokens/motion";
import { isPhone } from "../utils/platform";

/**
 * The phone's move between Home and the note: the note comes in from the
 * right over Home, and goes back out the way it came.
 *
 * It is a view transition: the browser animates pictures of the two screens,
 * so the note's own column never carries a transform (which would contain its
 * fixed menus). `data-screen` on `<html>` says which way, for the keyframes in
 * GlobalStyles. Where there is no such API (an old WebView), or motion is
 * reduced, the screens swap at once, as they always did.
 */
export function switchScreen(to: "note" | "home", change: () => void) {
  if (!isPhone || prefersReducedMotion() || !document.startViewTransition) {
    change();
    return;
  }
  const root = document.documentElement;
  root.dataset.screen = to;
  // The picture of the screen being left is taken first; the change must be
  // in the DOM by the time this returns, for the picture of the one arrived at.
  const transition = document.startViewTransition(() => flushSync(change));
  const done = () => {
    if (root.dataset.screen === to) delete root.dataset.screen;
  };
  transition.finished.then(done, done);
}
