import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Z } from "../constants/zIndex";
import { useTheme } from "../hooks/useTheme";
import { cssZoom } from "../utils/domHelpers";
import { isMac } from "../utils/platform";

/**
 * The app's one tooltip: a chip naming a control, with its shortcut in muted
 * ink where one exists. The selection toolbar drew it first (2026-09-10); the
 * chrome row's buttons and the wordmark took it on 2026-09-17 in place of the
 * browser's own `title` tooltip, which arrives a second late, unstyled and
 * without the shortcut. A control that shows the chip carries no `title`.
 */

/** How long the pointer rests on a control before its chip shows. */
export const TOOLTIP_REST_MS = 400;
/**
 * After a chip has shown, a neighbour hovered within this window shows its own
 * at once, the way macOS toolbars behave: the rest is paid once per pass over
 * a group, not once per button.
 */
export const TOOLTIP_WARM_MS = 300;

let warmUntil = 0;

export interface ShortcutSpec {
  key: string;
  shift?: boolean;
  /** The key on Windows and Linux where it differs (Redo: ⇧⌘Z on a Mac, Ctrl+Y elsewhere). */
  win?: { key: string; shift?: boolean };
}

/** `⇧⌘S` on a Mac, `Ctrl+Shift+S` elsewhere: each platform's own modifier order. */
export function shortcutLabel(spec: ShortcutSpec, mac: boolean = isMac): string {
  if (mac) return `${spec.shift ? "⇧" : ""}⌘${spec.key}`;
  const { key, shift } = spec.win ?? spec;
  return `Ctrl+${shift ? "Shift+" : ""}${key}`;
}

interface TooltipProps {
  label: string;
  shortcut?: string;
  /** Above for a control mid-page (the toolbar); below for one on the window's top row. */
  placement?: "above" | "below";
  testId?: string;
}

/**
 * The chip itself, absolutely positioned against its control (which must be
 * `position: relative`), centred, and shifted inward when centring would put
 * it past the window's edge (the ··· sits 10px from the right edge; "Expand
 * sidebar" is wider than the toggle). The rect Chromium reports is already
 * multiplied by the UI scale and the shift is applied inside it, so it is
 * divided by the zoom before it becomes a style (see the editor rule).
 */
export function Tooltip({ label, shortcut, placement = "above", testId }: TooltipProps) {
  const { theme } = useTheme() as { theme: Record<string, Record<string, string>> };
  const { BG, TEXT } = theme;
  const ref = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const margin = 8;
    let dx = 0;
    if (r.left < margin) dx = margin - r.left;
    else if (r.right > window.innerWidth - margin) dx = window.innerWidth - margin - r.right;
    if (dx !== 0) setShift(dx / cssZoom(el));
  }, []);
  return (
    <span
      ref={ref}
      role="tooltip"
      aria-hidden="true"
      data-testid={testId}
      style={{
        position: "absolute",
        left: `calc(50% + ${shift}px)`,
        transform: "translateX(-50%)",
        ...(placement === "below" ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" }),
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "4px 8px",
        borderRadius: 5,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        color: TEXT.primary,
        // A control's label, read at a glance: 12px/500, a step above the link
        // tooltip's 11px, which shows long URLs and wants to be quiet. The
        // shortcut sits in the UI face on the same baseline; in mono `⌘B` read
        // as a code snippet.
        fontSize: 12,
        fontWeight: 500,
        lineHeight: "16px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: Z.TOOLBAR,
        animation: "fadeIn 0.1s ease-out",
      }}
    >
      <span>{label}</span>
      {shortcut && <span style={{ color: TEXT.muted, fontWeight: 400 }}>{shortcut}</span>}
    </span>
  );
}

export interface TooltipHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onMouseDown: () => void;
  onMouseUp: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: { key: string }) => void;
}

/**
 * When a control's chip shows. Hover: after TOOLTIP_REST_MS at rest, or at
 * once while a neighbour's chip has just hidden (warm). Keyboard focus: at
 * once, since the user is on the control on purpose; focus that a press gave
 * is not keyboard focus and shows nothing. A press, Enter, Space or Escape
 * hides it, and it stays hidden until the pointer leaves and returns or the
 * control is focused again, so a toggle never flashes its old name after it
 * has acted.
 */
export function useTooltip(): { shown: boolean; handlers: TooltipHandlers } {
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);
  shownRef.current = shown;
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDown = useRef(false);
  const cancel = () => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
  };
  const hide = () => {
    cancel();
    setShown(false);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount only clears the pending timer
  useEffect(() => cancel, []);
  const handlers: TooltipHandlers = {
    onMouseEnter: () => {
      cancel();
      if (Date.now() < warmUntil) {
        setShown(true);
        return;
      }
      pending.current = setTimeout(() => {
        pending.current = null;
        setShown(true);
      }, TOOLTIP_REST_MS);
    },
    onMouseLeave: () => {
      if (shownRef.current) warmUntil = Date.now() + TOOLTIP_WARM_MS;
      pointerDown.current = false;
      hide();
    },
    onMouseDown: () => {
      pointerDown.current = true;
      hide();
    },
    onMouseUp: () => {
      pointerDown.current = false;
    },
    onFocus: () => {
      if (pointerDown.current) return;
      cancel();
      setShown(true);
    },
    onBlur: hide,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") hide();
    },
  };
  return { shown, handlers };
}
