import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "../constants/zIndex";
import { useTheme } from "../hooks/useTheme";
import { cssZoom } from "../utils/domHelpers";
import { isMac } from "../utils/platform";

/**
 * The app's one tooltip: a chip naming a control, with its shortcut in a small
 * grey pill where one exists. The selection toolbar drew it first (2026-09-10);
 * the chrome row's buttons, the wordmark and the Notes row's pair took it on
 * 2026-09-17 in place of the browser's own `title` tooltip, which arrives a
 * second late, unstyled and without the shortcut. A control that shows the chip
 * carries no `title`.
 */

/** How long the pointer rests on a control before its chip shows. */
export const TOOLTIP_REST_MS = 400;
/**
 * After a chip has shown, a neighbour hovered within this window shows its own
 * at once, the way macOS toolbars behave: the rest is paid once per pass over
 * a group, not once per button.
 */
export const TOOLTIP_WARM_MS = 300;
/** Air between the control and the chip, and between the chip and the window's edge. */
const GAP = 6;
const EDGE = 8;

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
  /** The control the chip names; the chip is centred on it. */
  anchor: HTMLElement | null;
  /** Above for a control mid-page (the toolbar); below for one on the window's top row. */
  placement?: "above" | "below";
  testId?: string;
}

/**
 * The chip itself. Portalled to `body` and fixed, so it sits over the sidebar
 * and the note alike (drawn inside its control it was clipped at the sidebar's
 * edge and hidden under the editor). Measured once when it appears: centred on
 * the control, then moved in from the window's edge by the least it must. The
 * rects Chromium reports are already multiplied by the UI scale and a fixed
 * element inside the zoom is multiplied again on paint, so the placement is
 * divided by the zoom before it becomes a style (the menus do the same).
 */
export function Tooltip({ label, shortcut, anchor, placement = "above", testId }: TooltipProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { dragShadow: string };
  };
  const { BG, TEXT } = theme;
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    const maxLeft = Math.max(EDGE, window.innerWidth - EDGE - c.width);
    const left = Math.min(maxLeft, Math.max(EDGE, a.left + a.width / 2 - c.width / 2));
    const top = placement === "below" ? a.bottom + GAP : a.top - GAP - c.height;
    const zoom = cssZoom(document.documentElement);
    setPos({ left: left / zoom, top: top / zoom });
  }, [anchor, placement]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <span
      ref={ref}
      role="tooltip"
      aria-hidden="true"
      data-testid={testId}
      data-placement={placement}
      style={{
        position: "fixed",
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: shortcut ? "5px 6px 5px 10px" : "5px 10px",
        borderRadius: 8,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        boxShadow: theme.dragShadow,
        color: TEXT.primary,
        // A control's label, read at a glance: 13px/500 in the primary ink.
        // The shortcut is a step smaller on a grey pill (the content-hover
        // grey, secondary ink), so it reads as a key and never as prose.
        fontSize: 13,
        fontWeight: 500,
        lineHeight: "18px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
        zIndex: Z.TOOLBAR,
        animation: "fadeIn 0.1s ease-out",
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            lineHeight: "14px",
            padding: "1px 5px",
            borderRadius: 5,
            background: BG.surface,
            color: TEXT.secondary,
          }}
        >
          {shortcut}
        </span>
      )}
    </span>,
    document.body,
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
