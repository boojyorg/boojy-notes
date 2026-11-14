import { currentExitMs, currentSettleMs, prefersReducedMotion } from "../tokens/motion";
import { isPhone } from "../utils/platform";

/**
 * The phone's move between Home and the note: the note comes in from the
 * right over Home, and goes back out the way it came.
 *
 * The change itself is made at once, as it always was, so everything timed
 * against it (the note's scroll place, a new note's caret, Back pressed twice)
 * is as it was with no motion. What moves is decoration:
 *
 * - To the note: a copy of Home stands still underneath while the app itself
 *   arrives (`.screen-in` on the app's root, a keyframe that leaves no
 *   transform behind it).
 * - To Home: a copy of the note leaves over the top (`.screen-out`).
 *
 * The copy is inert, unreachable and timer-removed, like `useExitGhost`'s. It
 * keeps its `data-*`, which the note's look is written against; it follows
 * the app in the document, so a lookup finds the app's own node first, and it
 * lasts no longer than the motion. Reduced motion makes none.
 */

/** The app's root in the page (`index.html`). */
const APP_ROOT = "root";
/** What scrolls inside a screen: a copy starts at the top unless told. */
const SCROLLERS = ".editor-scroll, .sidebar-scroll";

let ghost: HTMLElement | null = null;
let timer = 0;

/** End whatever motion is under way: a second change starts from rest. */
function settle() {
  window.clearTimeout(timer);
  ghost?.remove();
  ghost = null;
  document.getElementById(APP_ROOT)?.classList.remove("screen-in");
}

function copyOf(app: HTMLElement): HTMLElement {
  const copy = app.cloneNode(true) as HTMLElement;
  for (const node of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
    node.removeAttribute("id");
    node.removeAttribute("autofocus");
    node.removeAttribute("contenteditable");
  }
  // A clone keeps an input's attribute, not what was typed into it; a canvas, nothing.
  const pairs = <T extends Element>(selector: string) => {
    const to = copy.querySelectorAll<T>(selector);
    return [...app.querySelectorAll<T>(selector)].map((from, i) => [from, to[i]] as const);
  };
  for (const [from, to] of pairs<HTMLInputElement>("input, textarea")) {
    if (to) to.value = from.value;
  }
  for (const [from, to] of pairs<HTMLCanvasElement>("canvas")) {
    if (to && from.width && from.height) to.getContext("2d")?.drawImage(from, 0, 0);
  }
  copy.className = "screen-ghost";
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  return copy;
}

/** Scrolled as the screen was: possible only once the copy is in the page. */
function keepScroll(app: HTMLElement, copy: HTMLElement) {
  const to = copy.querySelectorAll<HTMLElement>(SCROLLERS);
  app.querySelectorAll<HTMLElement>(SCROLLERS).forEach((from, i) => {
    if (to[i] && (from.scrollTop || from.scrollLeft)) {
      to[i].scrollTop = from.scrollTop;
      to[i].scrollLeft = from.scrollLeft;
    }
  });
}

/**
 * Make `change` (the state change that swaps the screens), moving to `to`.
 * `motion: false` is a screen put back, not gone to (a launch's restore).
 */
export function switchScreen(to: "note" | "home", change: () => void, motion = true) {
  const app = isPhone && motion && !prefersReducedMotion() && document.getElementById(APP_ROOT);
  if (!app) {
    change();
    return;
  }
  settle();
  ghost = copyOf(app);
  ghost.classList.add(to === "note" ? "screen-under" : "screen-out");
  document.body.appendChild(ghost);
  keepScroll(app, ghost);
  change();
  if (to === "note") app.classList.add("screen-in");
  // A timer, never `animationend`: an event a hidden window loses.
  timer = window.setTimeout(settle, (to === "note" ? currentSettleMs() : currentExitMs()) + 60);
}
