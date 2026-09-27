import { useEffect } from "react";

/** How long after the last resize event the window counts as still. */
const SETTLE_MS = 150;

/**
 * While the window is being resized, `window-resizing` on <html> switches
 * transitions off (GlobalStyles), as `sidebar-dragging` does for the divider:
 * the column's margins and the sidebar ease on the panel's clock so a toggle
 * slides, and on a window resize that easing made the note trail the hand.
 */
export function useWindowResizing(): void {
  useEffect(() => {
    const root = document.documentElement;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      root.classList.add("window-resizing");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => root.classList.remove("window-resizing"), SETTLE_MS);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (timer) clearTimeout(timer);
      root.classList.remove("window-resizing");
    };
  }, []);
}
