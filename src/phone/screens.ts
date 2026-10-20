/**
 * The phone's two screens, Home and the open note, as Android's back and the
 * app's lifecycle move between them. Pure decisions here; `usePhoneScreens`
 * wires them to the plugin and the layout.
 */

/** Where Back acts first: a field outside the note owns Escape (search, a
 *  dialog's field), while the note's own text would take it as "select the
 *  block", so Escape goes to the page instead and only a menu or dialog
 *  listening there can claim it. A tree row is the same: its Escape means
 *  "back to the note", which on Home is hidden, so it would swallow Back. */
export function escapeTarget(active: Element | null): Element {
  if (!active || active === document.body) return document.body;
  if ((active as HTMLElement).isContentEditable) return document.body;
  if (active.hasAttribute("data-tree-key")) return document.body;
  return active;
}

/** What Back does once nothing open took its Escape. */
export function backAction(onNote: boolean): "home" | "leave" {
  return onNote ? "home" : "leave";
}

/**
 * A launch reopens the note only when Android closed the app in the
 * background while that note was on screen, and not long ago: the app was
 * still in use. Any other launch opens Home.
 */
export const RESUME_WINDOW_MS = 10 * 60 * 1000;

export interface LeftAt {
  screen: "home" | "note";
  at: number;
}

export function resumesOnNote(left: LeftAt | null, now: number): boolean {
  return !!left && left.screen === "note" && now - left.at < RESUME_WINDOW_MS;
}
