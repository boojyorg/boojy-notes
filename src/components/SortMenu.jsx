import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { SORT_MODES } from "../utils/noteSort";
import { CheckIcon } from "./Icons";
import { Z } from "../constants/zIndex";

const hBg = (el, c) => {
  el.style.background = c;
};

/**
 * The `Notes` section header's ordering menu: two modes, a tick on the active
 * one. Placement goes through `useMenuPosition` like every other popover — the
 * trigger sits near the sidebar's right edge, so the flip rule is what keeps
 * the menu on screen at narrow widths.
 *
 * @param {{
 *   anchorRect: {top: number, bottom: number, left: number, right: number},
 *   mode: string,
 *   onSelect: (mode: string) => void,
 *   onClose: () => void,
 * }} props
 */
export default function SortMenu({ anchorRect, mode, onSelect, onClose }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const triggerRef = useRef(document.activeElement);
  const activeIndex = Math.max(
    0,
    SORT_MODES.findIndex((m) => m.id === mode),
  );
  const [focusIndex, setFocusIndex] = useState(activeIndex);

  const pos = useMenuPosition(menuRef, true, anchorRect, { gapY: 4 });

  // Open with the current mode focused, so Enter alone is a no-op rather than a
  // surprise change, and arrows start from where you are.
  useEffect(() => {
    itemRefs.current[focusIndex]?.focus();
  }, [focusIndex]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setFocusIndex((i) => (i + delta + SORT_MODES.length) % SORT_MODES.length);
    } else if (e.key === "Escape") {
      e.preventDefault();
      triggerRef.current?.focus();
      onClose();
    } else if (e.key === "Tab") {
      // Put focus back on the trigger before the browser performs its normal
      // Tab move. Preventing the default here stranded focus on <body> after
      // the focused menu item unmounted.
      triggerRef.current?.focus();
      onClose();
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{ position: "fixed", inset: 0, zIndex: Z.MENU_BACKDROP }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Sort notes"
        onKeyDown={handleKeyDown}
        style={{
          position: "fixed",
          top: pos?.top ?? anchorRect.bottom,
          left: pos?.left ?? anchorRect.left,
          zIndex: Z.DROPDOWN,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 8,
          padding: "4px 0",
          minWidth: 168,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {SORT_MODES.map((m, index) => {
          const checked = m.id === mode;
          return (
            <button
              key={m.id}
              ref={(el) => (itemRefs.current[index] = el)}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              onClick={() => {
                onSelect(m.id);
                onClose();
              }}
              onMouseMove={() => setFocusIndex(index)}
              onMouseEnter={(e) => hBg(e.currentTarget, BG.hover)}
              onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              onFocus={(e) => hBg(e.currentTarget, BG.hover)}
              onBlur={(e) => hBg(e.currentTarget, "transparent")}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: "7px 12px 7px 14px",
                cursor: "pointer",
                color: TEXT.primary,
                fontSize: 12.5,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "background 0.12s",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {m.label}
              <span
                aria-hidden="true"
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: ACCENT.primary,
                  visibility: checked ? "visible" : "hidden",
                }}
              >
                <CheckIcon size={14} />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
