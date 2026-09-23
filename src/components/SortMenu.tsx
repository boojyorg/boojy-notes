import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { SORT_ALPHA, SORT_RECENT } from "../utils/noteSort";
import { CheckIcon, ClockIcon, SortAlphaIcon } from "./Icons";

/**
 * The Notes row's Sort menu (2026-09-16, formerly the ··· "List options" menu,
 * which also carried New folder and Reveal in Finder): two radio items, each
 * with its glyph at the menu tier, the chosen one marked with a check on the
 * right. Folders are always first and alphabetical; the choice orders notes
 * alone, at the root and inside every folder. Same keyboard grammar as
 * ContextMenu: arrows move, Enter/Space activate, Escape closes; a
 * pointer-opened menu parks initial focus on the container so no item paints
 * a focus ring.
 *
 * Deliberately absent: "Collapse all folders" (removed 2026-09-05: folders
 * toggle on click and stay as left across launches); "Change vault folder…"
 * and "Show in Finder", both Settings → Storage only, beside the path they
 * act on.
 */

interface SortMenuProps {
  /** Anchor rect of the Sort button (viewport coordinates). */
  anchor: { top: number; bottom: number; left: number; right: number };
  sortMode: string;
  setSortMode: (mode: string) => void;
  onClose: () => void;
}

const hBg = (el: HTMLElement, c: string) => {
  el.style.background = c;
};

export default function SortMenu({ anchor, sortMode, setSortMode, onClose }: SortMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, ACCENT } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  useFocusTrap(menuRef as RefObject<HTMLElement>, true, "container");

  // The menu hangs off the button's bottom edge, growing rightward into the
  // editor like the note-row menu; positionMenu flips and clamps on overflow.
  const menuAnchor = useMemo(
    () => ({ top: anchor.top, bottom: anchor.bottom, left: anchor.left, right: anchor.right }),
    [anchor],
  );
  const pos = useMenuPosition(menuRef, true, menuAnchor, { gapY: 4 }) as {
    top: number;
    left: number;
  } | null;

  const items = useMemo(
    () => [
      { label: "Most recent", mode: SORT_RECENT, icon: <ClockIcon /> },
      { label: "Alphabetical", mode: SORT_ALPHA, icon: <SortAlphaIcon /> },
    ],
    [],
  );

  const choose = useCallback(
    (mode: string) => {
      setSortMode(mode);
      onClose();
    },
    [setSortMode, onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((i) =>
          i === -1 && step === -1 ? items.length - 1 : (i + step + items.length) % items.length,
        );
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (activeIndex >= 0) choose(items[activeIndex].mode);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [activeIndex, items, choose, onClose],
  );

  // On the document, as ContextMenu: a window listener added on open would
  // run after the app shell's startup window listener, too late to claim
  // Escape from it.
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }} />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Sort notes"
        aria-activedescendant={activeIndex >= 0 ? `sort-item-${activeIndex}` : undefined}
        tabIndex={-1}
        style={{
          outline: "none",
          position: "fixed",
          top: pos?.top ?? anchor.bottom + 4,
          left: pos?.left ?? anchor.left,
          zIndex: Z.CONTEXT_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: MENU_RADIUS,
          padding: MENU_PAD,
          minWidth: 200,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {items.map((item, index) => {
          const checked = sortMode === item.mode;
          return (
            <button
              key={item.mode}
              type="button"
              id={`sort-item-${index}`}
              role="menuitemradio"
              aria-checked={checked}
              onClick={() => choose(item.mode)}
              onMouseEnter={(e) => {
                setActiveIndex(index);
                hBg(e.currentTarget, BG.hover);
              }}
              onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              style={{
                width: "100%",
                background: index === activeIndex ? BG.hover : "none",
                border: "none",
                borderRadius: MENU_ROW_RADIUS,
                padding: "7px 10px",
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
              {/* The glyph in the menu tier's ink, as the note and folder menus. */}
              <span
                aria-hidden="true"
                style={{ display: "flex", flexShrink: 0, color: TEXT.secondary }}
              >
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {/* The chosen mode's mark: a check in the mark colour, the
                  accent's role as a marker rather than a surface. */}
              {checked && (
                <span
                  aria-hidden="true"
                  data-testid="sort-check"
                  style={{ display: "flex", flexShrink: 0, color: ACCENT.primary }}
                >
                  <CheckIcon />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
