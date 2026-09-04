import { type MouseEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";

const HOVER_DELAY_MS = 500;

export interface LinkTooltipState {
  url: string;
  position: { top: number; left: number };
}

interface PendingHover {
  url: string;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * The link tooltip: rest the pointer on an `<a>` or a `[[wikilink]]` for
 * half a second and its URL or target appears under it; move off and it goes.
 *
 * The pending hover is tracked as an object holding both the timer and the
 * URL. The previous version hung the URL off the timer handle itself, which is
 * a number in the browser: in strict mode that assignment throws, so every
 * hover raised a TypeError and, because the throw came before the handle was
 * stored, the timer it had already started could never be cancelled and the
 * tooltip appeared after the pointer had left. The callback also checks it is
 * still the current hover before showing anything.
 */
export function useLinkHoverTooltip(containerRef: RefObject<HTMLElement | null>) {
  const [tooltip, setTooltip] = useState<LinkTooltipState | null>(null);
  const pending = useRef<PendingHover | null>(null);

  const cancel = useCallback(() => {
    if (pending.current?.timer) clearTimeout(pending.current.timer);
    pending.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onMouseMove = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const target = e.target as HTMLElement;
      const link = (target.closest("a") || target.closest(".wikilink")) as HTMLElement | null;
      if (!link) {
        cancel();
        setTooltip(null);
        return;
      }
      const url =
        link.getAttribute("data-url") ||
        link.getAttribute("href") ||
        link.getAttribute("data-target");
      if (!url || pending.current?.url === url) return;
      cancel();
      const hover: PendingHover = { url, timer: null };
      hover.timer = setTimeout(() => {
        if (pending.current !== hover) return;
        hover.timer = null;
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return;
        const linkRect = link.getBoundingClientRect();
        setTooltip({
          url: link.classList.contains("wikilink") ? `[[${url}]]` : url,
          position: {
            top: linkRect.bottom - containerRect.top + 4,
            left: linkRect.left - containerRect.left,
          },
        });
      }, HOVER_DELAY_MS);
      pending.current = hover;
    },
    [cancel, containerRef],
  );

  const onMouseLeave = useCallback(() => {
    cancel();
    setTooltip(null);
  }, [cancel]);

  return { tooltip, onMouseMove, onMouseLeave };
}
