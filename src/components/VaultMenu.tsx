import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { SORT_ALPHA, SORT_RECENT } from "../utils/noteSort";

/**
 * The vault header's ··· menu: the rare, whole-vault actions. Sort lives here
 * rather than on the header because a preference flipped a few times a month
 * does not earn a standing glyph, and a menu has room for a third mode if one
 * ever earns its place. Same keyboard grammar as ContextMenu: arrows move,
 * Enter/Space activate, Escape closes; a pointer-opened menu parks initial
 * focus on the container so no item paints a focus ring.
 *
 * Deliberately absent (removed 2026-09-05): "Collapse all folders", since
 * folders toggle on click and stay as left across launches; and "Change vault
 * folder…", which lives in Settings → Storage only, beside the path it changes.
 */

interface VaultMenuProps {
  /** Anchor rect of the ··· button (viewport coordinates). */
  anchor: { top: number; bottom: number; left: number; right: number };
  sortMode: string;
  setSortMode: (mode: string) => void;
  /** The standing hint for a control that is hover-revealed on the header. */
  onNewFolder: () => void;
  /** Desktop only: show the vault directory in the OS file manager. */
  onReveal?: () => void;
  revealLabel: string;
  onClose: () => void;
}

interface Item {
  label: string;
  action: () => void;
  checked?: boolean;
  /** A rule above the item. */
  separator?: boolean;
  /** Non-interactive group label. */
  heading?: boolean;
}

const hBg = (el: HTMLElement, c: string) => {
  el.style.background = c;
};

export default function VaultMenu({
  anchor,
  sortMode,
  setSortMode,
  onNewFolder,
  onReveal,
  revealLabel,
  onClose,
}: VaultMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, ACCENT } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  useFocusTrap(menuRef as RefObject<HTMLElement>, true, "container");

  // The menu hangs off the button's bottom-right, growing rightward into the
  // editor like the note-row menu; positionMenu flips and clamps on overflow.
  const menuAnchor = useMemo(
    () => ({ top: anchor.top, bottom: anchor.bottom, left: anchor.left, right: anchor.right }),
    [anchor],
  );
  const pos = useMenuPosition(menuRef, true, menuAnchor, { gapY: 4 }) as {
    top: number;
    left: number;
  } | null;

  const items: Item[] = useMemo(() => {
    const list: Item[] = [
      {
        label: "New folder",
        action: () => {
          onNewFolder();
          onClose();
        },
      },
      { label: "Sort by", action: () => {}, heading: true, separator: true },
      {
        label: "Most recent",
        checked: sortMode === SORT_RECENT,
        action: () => {
          setSortMode(SORT_RECENT);
          onClose();
        },
      },
      {
        label: "Alphabetical",
        checked: sortMode === SORT_ALPHA,
        action: () => {
          setSortMode(SORT_ALPHA);
          onClose();
        },
      },
    ];
    if (onReveal) {
      list.push({
        label: revealLabel,
        separator: true,
        action: () => {
          onReveal();
          onClose();
        },
      });
    }
    return list;
  }, [sortMode, setSortMode, onNewFolder, onReveal, revealLabel, onClose]);

  const interactive = useMemo(
    () => items.map((item, i) => (item.heading ? -1 : i)).filter((i) => i >= 0),
    [items],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const pos = interactive.indexOf(activeIndex);
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = (pos + step + interactive.length) % interactive.length;
        setActiveIndex(interactive[pos === -1 && step === -1 ? interactive.length - 1 : next]);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (activeIndex >= 0) items[activeIndex].action();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [activeIndex, interactive, items, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }} />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Vault options"
        aria-activedescendant={activeIndex >= 0 ? `vault-item-${activeIndex}` : undefined}
        tabIndex={-1}
        style={{
          outline: "none",
          position: "fixed",
          top: pos?.top ?? anchor.bottom + 4,
          left: pos?.left ?? anchor.left,
          zIndex: Z.CONTEXT_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 8,
          padding: 4,
          minWidth: 200,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {items.map((item, index) =>
          item.heading ? (
            <div key={item.label}>
              {item.separator && (
                <div style={{ height: 1, background: BG.divider, margin: "4px 6px" }} />
              )}
              <div
                style={{
                  padding: "6px 10px 2px",
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: TEXT.muted,
                }}
              >
                {item.label}
              </div>
            </div>
          ) : (
            <div key={item.label}>
              {item.separator && (
                <div style={{ height: 1, background: BG.divider, margin: "4px 6px" }} />
              )}
              <button
                type="button"
                id={`vault-item-${index}`}
                role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                aria-checked={item.checked}
                onClick={item.action}
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
                  padding: "7px 10px",
                  cursor: "pointer",
                  color: TEXT.primary,
                  fontSize: 12.5,
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "background 0.12s",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span>{item.label}</span>
                {/* The current mode is marked by a small accent dot, the
                    accent's role as a marker rather than a surface. */}
                {item.checked && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: ACCENT.primary,
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>
            </div>
          ),
        )}
      </div>
    </>
  );
}
