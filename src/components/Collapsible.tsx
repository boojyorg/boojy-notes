import { type ReactNode, useEffect, useRef, useState } from "react";

/** Duration of the folder expand/collapse slide. */
export const FOLDER_ANIM_MS = 160;

/**
 * Animated disclosure for a folder's children, shared by the sidebar's tree
 * and the path's folder popup (2026-09-16) so the two open and close alike.
 *
 * The grid 0fr→1fr trick animates to auto height with no measuring. Children
 * MUST unmount once the collapse finishes (not merely clip): useSidebarDrag
 * hit-tests every [data-folder-path] row by rect, and clipped-but-mounted rows
 * would swallow drops meant for the visible rows they overlap. Expand mounts
 * at 0fr and flips to 1fr on the next frames so the first open animates too;
 * a folder open at mount is mounted grown, with no slide. Reduced-motion users
 * skip the animation entirely (mount/unmount is instant).
 *
 * The unmount is promised, not merely expected: `transitionend` is the prompt
 * path, and a timer a beat past the slide's length is the fallback, because
 * the event is lost when no transition runs (a window that is not painting,
 * a transition cut short) and the clipped rows then stayed in the DOM for
 * good (seen 2026-09-16 in the real-Electron suite under load).
 */
export default function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const reduceMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [mounted, setMounted] = useState(open);
  const [grown, setGrown] = useState(open);
  const rafRef = useRef(0);
  useEffect(() => {
    if (open) {
      setMounted(true);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setGrown(true));
      });
      return () => cancelAnimationFrame(rafRef.current);
    }
    setGrown(false);
    const fallback = setTimeout(() => setMounted(false), FOLDER_ANIM_MS + 50);
    return () => clearTimeout(fallback);
  }, [open]);
  if (reduceMotion) return open ? children : null;
  if (!mounted && !open) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: grown ? "1fr" : "0fr",
        transition: `grid-template-rows ${FOLDER_ANIM_MS}ms ease`,
      }}
      onTransitionEnd={(e) => {
        // Guard on target: a child row's own background/color transition
        // bubbling up must not unmount the subtree mid-collapse.
        if (!open && e.target === e.currentTarget) setMounted(false);
      }}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}
