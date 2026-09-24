import { type MouseEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { LinkDescription } from "../../components/LinkTooltip";

const HOVER_DELAY_MS = 500;

export interface LinkTooltipState {
  description: LinkDescription;
  position: { top: number; left: number };
}

interface PendingHover {
  link: HTMLElement;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * The destination chip: rest the pointer on an `<a>` or a `[[wikilink]]` for
 * half a second and what it points at appears under it; move off and it
 * goes. The keyboard reaches it too (2026-09-20): a caret that comes to rest
 * inside a link, by the arrows or Home and End, shows the same chip after
 * the same rest, and it goes the moment the caret leaves. `describe` says
 * what a link is: the URL, or the note's name and folder, or that no note
 * (or two) answers to it.
 *
 * The pending hover is tracked as an object holding both the timer and the
 * link. The previous version hung the URL off the timer handle itself, which
 * is a number in the browser: in strict mode that assignment throws, so every
 * hover raised a TypeError and, because the throw came before the handle was
 * stored, the timer it had already started could never be cancelled and the
 * tooltip appeared after the pointer had left. The callback also checks it is
 * still the current hover before showing anything.
 */
const linkAt = (node: Node | null): HTMLElement | null => {
  const el = (node && (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)) || null;
  return (el?.closest("a, .wikilink") as HTMLElement | null) ?? null;
};

export function useLinkHoverTooltip(
  containerRef: RefObject<HTMLElement | null>,
  describe: (link: HTMLElement) => LinkDescription | null,
) {
  const [tooltip, setTooltip] = useState<LinkTooltipState | null>(null);
  const pending = useRef<PendingHover | null>(null);

  const cancel = useCallback(() => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const arm = useCallback(
    (link: HTMLElement) => {
      if (pending.current?.link === link) return;
      cancel();
      const hover: PendingHover = { link, timer: null };
      hover.timer = setTimeout(() => {
        if (pending.current !== hover) return;
        hover.timer = null;
        const containerRect = containerRef.current?.getBoundingClientRect();
        const description = describe(link);
        if (!containerRect || !description || !link.isConnected) return;
        const linkRect = link.getBoundingClientRect();
        setTooltip({
          description,
          position: {
            top: linkRect.bottom - containerRect.top + 4,
            left: linkRect.left - containerRect.left,
          },
        });
      }, HOVER_DELAY_MS);
      pending.current = hover;
    },
    [cancel, containerRef, describe],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const link = linkAt(e.target as Node);
      if (!link) {
        cancel();
        setTooltip(null);
        return;
      }
      arm(link);
    },
    [arm, cancel],
  );

  const onMouseLeave = useCallback(() => {
    cancel();
    setTooltip(null);
  }, [cancel]);

  // The caret's link, for the keyboard: a collapsed selection that a key
  // moved into a link in the container arms the chip; moved out, it hides.
  // A caret the pointer placed is the pointer's business (the hover above),
  // and a caret left inside a link when the note opened arms nothing.
  // On the document, with the container read at event time: the column the
  // ref points at is remounted per note, so a listener bound to the element
  // at mount would sit on a dead node after the first note switch.
  const byKey = useRef(false);
  useEffect(() => {
    const inside = (node: EventTarget | Node | null) =>
      !!node && !!containerRef.current?.contains(node as Node);
    const onKeyDown = (e: KeyboardEvent) => {
      if (inside(e.target)) byKey.current = true;
    };
    const onPointer = () => {
      byKey.current = false;
    };
    const onSelectionChange = () => {
      if (!byKey.current) return;
      const sel = window.getSelection();
      if (!sel?.rangeCount || !sel.isCollapsed) return;
      if (!inside(sel.anchorNode)) return;
      const link = linkAt(sel.anchorNode);
      if (link && inside(link)) arm(link);
      else {
        cancel();
        setTooltip(null);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [arm, cancel, containerRef]);

  return { tooltip, onMouseMove, onMouseLeave };
}
