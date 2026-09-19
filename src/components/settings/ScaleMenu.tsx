import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../hooks/useTheme";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useMenuPosition } from "../../hooks/useMenuPosition";
import { Z } from "../../constants/zIndex";
import { SCALE_OPTIONS } from "../../constants/data";
import { SCALE_DEFAULT } from "../../utils/uiScale";
import { cssZoom } from "../../utils/domHelpers";
import { CheckIcon } from "../Icons";

/**
 * The Interface size menu: the app's sizes, the one in use marked with a
 * check in the mark colour, and `Custom…` at the foot for a percentage the
 * list does not hold. Sort's rows and grammar (`menuitemradio`, arrows,
 * Enter, Escape), because this is the same kind of choice.
 *
 * **Choosing applies at once and closes**, and nothing previews on hover or
 * under the arrow keys (Tyr, 2026-09-19): the scale redraws the whole app,
 * Settings included, so a preview would move the menu out from under the
 * pointer while it was being read. That is also why the row is a menu rather
 * than the stepper it started as — a control you press repeatedly is the
 * worst shape for one that resizes the surface it sits on.
 *
 * It is portalled to `body`: the Settings pane is centred with
 * `transform: translate(-50%, -50%)`, which makes it the containing block for
 * anything `fixed` inside it, so a menu rendered in the pane was placed
 * against the pane rather than the window and stretched the pane's scroll area
 * (2026-09-19). It takes its keys in the capture phase, because Settings' own
 * Escape listener was registered first and would otherwise close the dialog
 * out from under the open menu; the dialog's focus trap only claims Tab, so
 * the menu keeps the arrows, Enter and Escape.
 */

interface ScaleMenuProps {
  anchor: { top: number; bottom: number; left: number; right: number };
  scale: number;
  onChoose: (scale: number) => void;
  onCustom: () => void;
  onClose: () => void;
}

const hBg = (el: HTMLElement, c: string) => {
  el.style.background = c;
};

export default function ScaleMenu({ anchor, scale, onChoose, onCustom, onClose }: ScaleMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, ACCENT } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  useFocusTrap(menuRef as RefObject<HTMLElement>, true, "container");

  const pos = useMenuPosition(menuRef, true, anchor, { gapY: 4, align: "end" }) as {
    top: number;
    left: number;
  } | null;
  // The anchor and the menu's own size are measured under the UI scale (CSS
  // zoom on <html>) and a `top`/`left` written inside it is scaled again on
  // paint, so the placement is divided by the zoom before it becomes a style —
  // the rule every measured placement follows (`domHelpers`). At 200% the list
  // was placed twice as far down and right as it should be, with its first
  // rows off the window.
  const zoom = cssZoom(document.documentElement);

  // The presets, then Custom… — one list, so the keys walk all of it.
  const rows = [...SCALE_OPTIONS.map((value) => ({ value })), { value: null }];
  const customInUse = !SCALE_OPTIONS.includes(scale);

  const activate = useCallback(
    (value: number | null) => {
      if (value === null) onCustom();
      else onChoose(value);
      onClose();
    },
    [onChoose, onCustom, onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((i) =>
          i === -1 && step === -1 ? rows.length - 1 : (i + step + rows.length) % rows.length,
        );
      } else if (e.key === "Enter" || e.key === " ") {
        if (activeIndex < 0) return;
        e.preventDefault();
        activate(rows[activeIndex].value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [activeIndex, rows, activate, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: Z.SETTINGS_MENU_BACKDROP }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Interface size"
        aria-activedescendant={activeIndex >= 0 ? `scale-item-${activeIndex}` : undefined}
        tabIndex={-1}
        style={{
          outline: "none",
          position: "fixed",
          top: (pos?.top ?? anchor.bottom + 4) / zoom,
          left: (pos?.left ?? anchor.left) / zoom,
          zIndex: Z.SETTINGS_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 8,
          padding: 4,
          minWidth: 180,
          maxHeight: 320,
          overflowY: "auto",
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {rows.map((row, index) => {
          const custom = row.value === null;
          const checked = custom ? customInUse : row.value === scale;
          return (
            <button
              key={custom ? "custom" : row.value}
              type="button"
              id={`scale-item-${index}`}
              role={custom ? "menuitem" : "menuitemradio"}
              aria-checked={custom ? undefined : checked}
              onClick={() => activate(row.value)}
              onMouseEnter={(e) => {
                setActiveIndex(index);
                hBg(e.currentTarget, BG.hover);
              }}
              onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              style={{
                width: "100%",
                background: index === activeIndex ? BG.hover : "none",
                border: "none",
                borderRadius: 6,
                padding: custom ? "11px 10px 7px" : "7px 10px",
                // The foot of the list is a different kind of thing, so it is
                // parted from the sizes by the menu's own rule. Written as a
                // spread, never as `borderTop: undefined` beside `border:
                // "none"`: React *removes* an undefined property, and a button
                // with no border of its own gets Chromium's 2px outset back
                // (every row wore a black line, 2026-09-19).
                ...(custom ? { borderTop: `1px solid ${BG.divider}`, marginTop: 4 } : null),
                cursor: "pointer",
                color: TEXT.primary,
                fontSize: 12.5,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "background 0.12s",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ flex: 1 }}>{custom ? "Custom…" : `${row.value}%`}</span>
              {/* The size the app opens at says so, in the hint ink the slash
                  menu uses for a shortcut: it is the one to come back to. */}
              {row.value === SCALE_DEFAULT && (
                <span style={{ color: TEXT.muted, fontSize: 11.5 }}>Default</span>
              )}
              {checked && (
                <span
                  aria-hidden="true"
                  data-testid="scale-check"
                  style={{ display: "flex", flexShrink: 0, color: ACCENT.primary }}
                >
                  <CheckIcon />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
