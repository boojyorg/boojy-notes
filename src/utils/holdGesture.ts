/**
 * A touch on the phone's editor is a scroll, a tap or a hold (useHoldToGrab):
 * a hold is a finger kept still for HOLD_MS, and grabs the block under it.
 * Text keeps the taps: a press that lands just after a tap, near it, is the
 * second tap of a double-tap (select a word, or hold to extend it), and is
 * never a hold. The rules are kept pure here.
 */

/** How long a finger must stay still to hold. A starting value, tuned on the phone. */
export const HOLD_MS = 400;
/** How far a still finger may drift, in CSS pixels. Past it, the touch is a scroll for good. */
export const HOLD_SLOP = 10;
/** A press this soon after a tap ended, this near it, is the double-tap's second. */
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_SLOP = 30;

export interface Point {
  x: number;
  y: number;
}

export interface Tap extends Point {
  /** When the tap ended, in ms. */
  at: number;
}

/** Whether a finger has drifted from where it landed far enough to be a scroll. */
export function drifted(from: Point, to: Point): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > HOLD_SLOP;
}

/** Whether a press at `at` is the second tap after `last`. */
export function isSecondTap(last: Tap | null, press: Point, at: number): boolean {
  if (!last || at - last.at > DOUBLE_TAP_MS) return false;
  return Math.hypot(press.x - last.x, press.y - last.y) <= DOUBLE_TAP_SLOP;
}

/** A touch that ended as a tap: short, still, never held. Null when it was anything else. */
export function tapFrom(start: Point & { at: number }, end: Point, at: number): Tap | null {
  if (drifted(start, end) || at - start.at >= HOLD_MS) return null;
  return { x: end.x, y: end.y, at };
}
