import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * True only for genuinely small *touch* devices — a phone, or a tablet in
 * portrait.
 *
 * The width test alone used to decide this, which meant a narrow Mac window
 * became a phone app: back arrow, centred title, floating action button,
 * bottom toolbar, 17px rows. Width says how much room there is; it says
 * nothing about how the thing is being pointed at. Those are separate
 * questions, and only the second one should choose a navigation model — see
 * `useSidebarFits` for the first.
 *
 * `pointer: coarse` is the *primary* input, so a touchscreen laptop reports
 * `fine` and correctly stays desktop. Deliberately not `any-pointer: coarse`,
 * which that laptop would match, and not `hover: none`, which adds no
 * discrimination here and would misjudge stylus devices.
 *
 * The breakpoint is unchanged at 768, so which real devices get the mobile
 * layout is exactly what it was; only narrow desktop windows moved.
 *
 * Consequence for development: narrowing a desktop browser no longer previews
 * the mobile layout. Use DevTools device emulation, which emulates the pointer
 * type too.
 */
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT}px) and (pointer: coarse)`;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // Re-sync on mount: the query can have changed between the initial state
    // and the effect (a rotated tablet, a restored window).
    setIsMobile(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
