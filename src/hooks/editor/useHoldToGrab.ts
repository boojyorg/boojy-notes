import { type RefObject, useEffect, useRef } from "react";
import { keyboardUp } from "../../phone/keyBar";
import {
  drifted,
  HOLD_MS,
  HOLD_SLOP,
  isSecondTap,
  type Tap,
  tapFrom,
} from "../../utils/holdGesture";

/** The block root under a point, frontmatter never; through an open menu's backdrop too. */
function blockAt(root: HTMLElement, x: number, y: number): string | null {
  let el: Element | null | undefined = document
    .elementsFromPoint(x, y)
    .find((e) => root.contains(e));
  while (el && el.parentElement !== root) el = el.parentElement;
  if (!(el instanceof HTMLElement)) {
    // Between blocks, or in the column's margin: the row that holds the height.
    el =
      Array.from(root.children).find((c) => {
        const r = c.getBoundingClientRect();
        return y >= r.top && y < r.bottom;
      }) ?? null;
  }
  if (!(el instanceof HTMLElement) || !el.dataset.blockId) return null;
  return el.dataset.blockType === "frontmatter" ? null : el.dataset.blockId;
}

/**
 * Whether a press at (x, y) lands on text already selected: the text's, so
 * the system's own menu copies the words, never a held block. A text box
 * (code) counts whole while it holds a selection.
 */
function onSelectedText(target: Element | null, x: number, y: number): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)
    return target.selectionStart !== target.selectionEnd;
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  return Array.from(sel.getRangeAt(0).getClientRects()).some(
    (r) =>
      x >= r.left - HOLD_SLOP &&
      x <= r.right + HOLD_SLOP &&
      y >= r.top - HOLD_SLOP &&
      y <= r.bottom + HOLD_SLOP,
  );
}

/** The touch in `list` made by `finger`, if it is there. */
function ownFinger(list: TouchList, finger: number): globalThis.Touch | undefined {
  return Array.from(list).find((t) => t.identifier === finger);
}

interface Touch {
  /** The finger's `identifier`: only its moves and its lift are the hold's. */
  finger: number;
  x: number;
  y: number;
  at: number;
  /** The double-tap's second press: text's, never a hold. */
  second: boolean;
  /** Landed on a block already held (selected): moving drags it, no wait. */
  armed: boolean;
  /** Drifted past the slop once: a scroll for the rest of the touch. */
  scrolled: boolean;
  claimed: boolean;
  /** The held block, once claimed. */
  blockId: string | null;
  /** The held block has lifted and follows the finger. */
  dragging: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Whether the keyboard was up when the finger landed. */
  keyboard: boolean;
  /** Where the caret was once the hold was claimed, kept for the rest of the touch. */
  keep: Range | null;
  /** A text box under the finger (code), out of the system's reach while held. */
  field: HTMLElement | null;
}

export interface HoldHandlers {
  /** A finger kept still on a block: it is held (selected). */
  onHold: (blockId: string) => void;
  /** Let go without moving: the block's menu, at the finger. */
  onRelease: (blockId: string, x: number, y: number) => void;
  /** The held finger moved: the block lifts. False if it cannot move. */
  onDragStart: (blockId: string, x: number, y: number) => boolean;
  onDragMove: (x: number, y: number) => void;
  /** The finger lifted (drop), or the touch was taken away (cancel). */
  onDragEnd: (cancelled: boolean) => void;
  /** Whether a block is held now (selected whole), so a press on it drags at once. */
  isHeld: (blockId: string) => boolean;
}

/**
 * The phone's hold: a finger kept still on a block grabs it (`onHold`), in
 * place of the system's own long-press, which would select the word; moved,
 * it drags the block, and let go where it was, it opens the block's menu. A
 * scroll, a tap and a double-tap stay the browser's. Once a hold is claimed,
 * the rest of the touch is the app's: no scroll, no selection, no menu of the
 * system's.
 */
export function useHoldToGrab({
  editorRef,
  enabled,
  mountKey,
  ...handlers
}: HoldHandlers & {
  editorRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Changes whenever the editor root may have been remounted. */
  mountKey: string;
}) {
  const on = useRef(handlers);
  on.current = handlers;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `mountKey` names a new editor element
  useEffect(() => {
    const root = editorRef.current;
    if (!enabled || !root) return;
    // The scroller, not just the blocks: a hold in the margin beside a block is on it.
    const area = (root.closest(".editor-scroll") as HTMLElement | null) ?? root;
    let touch: Touch | null = null;
    let lastTap: Tap | null = null;
    // The window's tallest at each width, as the key bar reads the keyboard.
    const tallest = new Map<number, number>();
    keyboardUp(tallest, window.innerWidth, window.innerHeight);
    const onResize = () => keyboardUp(tallest, window.innerWidth, window.innerHeight);
    const blurEditor = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && root.contains(el)) el.blur();
    };

    /** The touch ends without its finger: a waiting hold never fires, a drag goes home. */
    const abort = () => {
      if (!touch) return;
      clearTimeout(touch.timer);
      if (touch.dragging) on.current.onDragEnd(true);
      touch.field?.style.removeProperty("pointer-events");
      touch = null;
    };

    const claim = () => {
      if (!touch || touch.claimed || touch.second || touch.scrolled) return;
      clearTimeout(touch.timer);
      const id = blockAt(root, touch.x, touch.y);
      if (!id) return;
      touch.claimed = true;
      touch.blockId = id;
      // The block replaces a text selection elsewhere in the note, with its
      // handles and the system's menu.
      const sel = document.getSelection();
      if (sel && !sel.isCollapsed) sel.collapseToEnd();
      touch.keep = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      // A text box selects on the system's long-press with no selectstart to
      // refuse; its long-press hit-tests afresh, so it finds the block instead.
      if (touch.field) touch.field.style.pointerEvents = "none";
      // A note focused with the keyboard put away would bring it back up.
      if (!touch.keyboard) blurEditor();
      on.current.onHold(id);
    };

    const onTouchStart = (e: TouchEvent) => {
      // A second finger on a held block is ignored: the first still holds
      // it (Android hands the app an edge swipe made while a finger is down).
      // Before the hold, two fingers are a pinch.
      if (touch?.claimed) return;
      if (touch) clearTimeout(touch.timer);
      if (e.touches.length !== 1) {
        touch = null;
        return;
      }
      const { clientX: x, clientY: y, identifier: finger } = e.touches[0];
      // The note's own touches, and those on an open menu's backdrop over
      // the note: a block held there is held (and the menu goes).
      const target = e.target instanceof Element ? e.target : null;
      const overNote =
        !!target &&
        (area.contains(target) ||
          (!!target.closest("[data-menu-backdrop]") &&
            document.elementsFromPoint(x, y).some((el) => area.contains(el))));
      if (!overNote || onSelectedText(target, x, y)) {
        touch = null;
        return;
      }
      // The held block closes the menu, and its backdrop leaves the page
      // mid-touch; the rest of the touch is still dispatched to it, where no
      // document listener hears it. So it is heard on the backdrop too.
      if (target instanceof HTMLElement && !area.contains(target)) followDetached(target);
      const at = performance.now();
      const second = isSecondTap(lastTap, { x, y }, at);
      const isHeldAt = (px: number, py: number) => {
        const id = blockAt(root, px, py);
        return !!id && on.current.isHeld(id);
      };
      const keyboard = keyboardUp(tallest, window.innerWidth, window.innerHeight);
      touch = {
        finger,
        x,
        y,
        at,
        second,
        armed: !second && isHeldAt(x, y),
        scrolled: false,
        claimed: false,
        blockId: null,
        dragging: false,
        timer: undefined,
        keyboard,
        keep: null,
        field:
          e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement
            ? e.target
            : null,
      };
      if (!second) touch.timer = setTimeout(claim, HOLD_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      const finger = touch && ownFinger(e.touches, touch.finger);
      if (!touch || !finger) return;
      const { clientX: x, clientY: y } = finger;
      // A held block under the finger is the drag's from the first move:
      // the page must not start scrolling under it.
      if (touch.armed && !touch.claimed) {
        if (e.cancelable) e.preventDefault();
        if (drifted(touch, { x, y })) claim();
      }
      if (touch.claimed) {
        if (e.cancelable) e.preventDefault();
        if (!touch.dragging && touch.blockId && drifted(touch, { x, y })) {
          // The caret is the drag's now: it goes with the keyboard.
          touch.keep = null;
          touch.dragging = on.current.onDragStart(touch.blockId, x, y);
        } else if (touch.dragging) on.current.onDragMove(x, y);
        return;
      }
      if (!touch.scrolled && drifted(touch, { x, y })) {
        touch.scrolled = true;
        clearTimeout(touch.timer);
      }
    };

    const followDetached = (target: HTMLElement) => {
      const onlyDetached =
        <E extends Event>(fn: (e: E) => void) =>
        (e: E) => {
          if (!target.isConnected) fn(e);
        };
      const move = onlyDetached(onTouchMove);
      const end = onlyDetached(onTouchEnd);
      const done = () => {
        target.removeEventListener("touchmove", move);
        target.removeEventListener("touchend", end);
        target.removeEventListener("touchcancel", end);
        target.removeEventListener("touchend", done);
        target.removeEventListener("touchcancel", done);
      };
      target.addEventListener("touchmove", move, { passive: false });
      target.addEventListener("touchend", end, { passive: false });
      target.addEventListener("touchcancel", end);
      target.addEventListener("touchend", done);
      target.addEventListener("touchcancel", done);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const t = touch && ownFinger(e.changedTouches, touch.finger);
      if (!touch || !t) return;
      clearTimeout(touch.timer);
      const now = performance.now();
      lastTap =
        e.type === "touchend" && !touch.claimed && !touch.second
          ? tapFrom(touch, { x: t.clientX, y: t.clientY }, now)
          : null;
      // A hold's release is no tap: no caret, no click, no tick.
      if (touch.claimed && e.cancelable) e.preventDefault();
      if (touch.dragging) on.current.onDragEnd(e.type !== "touchend");
      else if (touch.claimed && touch.blockId && e.type === "touchend")
        on.current.onRelease(touch.blockId, t.clientX, t.clientY);
      const field = touch.field;
      if (field) requestAnimationFrame(() => field.style.removeProperty("pointer-events"));
      touch = null;
    };

    // The system's long-press, if it fires before the timer: refused, and
    // taken as the hold. A double-tap's second keeps its word selection.
    const onSelectStart = (e: Event) => {
      if (!touch || touch.second || touch.scrolled) return;
      e.preventDefault();
      claim();
    };
    const onContextMenu = (e: Event) => {
      // A double-tap's selection fires one too: the system's own menu is
      // the answer, never a block's desktop right-click menu (code's).
      e.stopPropagation();
      if (!touch || touch.second) return;
      e.preventDefault();
      claim();
    };
    // The system's long-press still focuses the note and moves the caret
    // where there is no word to select (a list's marker, blank space): a
    // claimed hold takes both back, so the keyboard stays as it was and the
    // caret where it was.
    const onFocusIn = () => {
      if (touch?.claimed && !touch.keyboard) blurEditor();
    };
    const onSelectionChange = () => {
      const sel = document.getSelection();
      const keep = touch?.claimed ? touch.keep : null;
      if (sel && keep && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        if (
          r.startContainer !== keep.startContainer ||
          r.startOffset !== keep.startOffset ||
          r.endContainer !== keep.endContainer ||
          r.endOffset !== keep.endOffset
        ) {
          sel.removeAllRanges();
          sel.addRange(keep.cloneRange());
        }
      }
    };

    // The browser's own drag of selected words: a phone draws no copy of
    // them, so a held finger's wobble would move them unseen. Cut and Paste
    // move text here; the selection's handles are touches, never a drag.
    const onDragStart = (e: DragEvent) => e.preventDefault();

    // iOS's long-press callout over the editor.
    area.style.setProperty("-webkit-touch-callout", "none");
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    // Not passive: a claimed hold must be able to refuse the scroll.
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: false });
    document.addEventListener("touchcancel", onTouchEnd);
    document.addEventListener("selectstart", onSelectStart, true);
    area.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("selectionchange", onSelectionChange);
    root.addEventListener("focusin", onFocusIn);
    window.addEventListener("resize", onResize);
    // The app leaving the screen, or the editor rebuilt mid-touch (the
    // Markdown view): the touch's lift would never be heard.
    window.addEventListener("blur", abort);
    area.addEventListener("dragstart", onDragStart, true);
    return () => {
      area.removeEventListener("dragstart", onDragStart, true);
      abort();
      window.removeEventListener("blur", abort);
      window.removeEventListener("resize", onResize);
      root.removeEventListener("focusin", onFocusIn);
      area.style.removeProperty("-webkit-touch-callout");
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      document.removeEventListener("selectstart", onSelectStart, true);
      area.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [editorRef, enabled, mountKey]);
}
