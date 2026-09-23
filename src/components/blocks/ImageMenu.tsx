import { type ReactNode, type RefObject, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../hooks/useTheme";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useMenuPosition } from "../../hooks/useMenuPosition";
import { Z } from "../../constants/zIndex";
import { cssZoom } from "../../utils/domHelpers";
import { isMac } from "../../utils/platform";
import { CopyIcon, ExpandIcon, FolderIcon, ResetSizeIcon, TrashIcon } from "../Icons";

export interface MenuAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface ImageMenuProps {
  /** Viewport rect: the pointer (a point) for a right-click, the ··· button for the bar. */
  anchor: MenuAnchor;
  /** The bar's ··· sits at the picture's right edge, so the menu's right edge meets it. */
  fromBar: boolean;
  onView: () => void;
  onCopy: () => void;
  /** Desktop only: the web build has no folder to show. */
  onShowInFolder?: () => void;
  /** Only while the picture carries a width set by hand. */
  onOriginalSize?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

interface Item {
  label: string;
  icon: ReactNode;
  action: () => void;
  danger?: boolean;
  rule?: boolean;
}

const hBg = (el: HTMLElement, c: string) => {
  el.style.background = c;
};

/**
 * An image's menu, from a right-click on the picture or the hover bar's ···
 * (2026-09-23, replacing a hand-drawn list in Title Case with no glyphs, no
 * keyboard and its own heavier shadow). The table cell menu's grammar: the
 * elevated ground with the divider border, 12.5px sentence-case labels, a
 * Lucide glyph per item at the navigation stroke, Delete last under a rule and
 * in the error ink, arrows, Enter and Escape.
 *
 * It portals to `body`, and takes its keys on its own element and stops them
 * there, for CodeLangMenu's reason: a portal leaves the DOM but not the React
 * tree, so a key pressed here would otherwise reach the editor's `onKeyDown`.
 * Placement is divided by the UI scale, as every measured placement is.
 */
export default function ImageMenu({
  anchor,
  fromBar,
  onView,
  onCopy,
  onShowInFolder,
  onOriginalSize,
  onDelete,
  onClose,
}: ImageMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, SEMANTIC } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  useFocusTrap(menuRef as RefObject<HTMLElement>, true, "container");
  const pos = useMenuPosition(menuRef, true, anchor, fromBar ? { gapY: 4, align: "end" } : {}) as {
    top: number;
    left: number;
  } | null;
  const zoom = cssZoom(document.documentElement);

  const act = useCallback(
    (fn: () => void) => () => {
      onClose();
      fn();
    },
    [onClose],
  );

  const items: Item[] = [
    { label: "View full size", icon: <ExpandIcon nav />, action: act(onView) },
    { label: "Copy image", icon: <CopyIcon />, action: act(onCopy) },
  ];
  if (onShowInFolder) {
    items.push({
      label: isMac ? "Show in Finder" : "Show in folder",
      icon: <FolderIcon />,
      action: act(onShowInFolder),
    });
  }
  if (onOriginalSize) {
    items.push({ label: "Original size", icon: <ResetSizeIcon />, action: act(onOriginalSize) });
  }
  items.push({
    label: "Delete",
    icon: <TrashIcon />,
    action: act(onDelete),
    danger: true,
    rule: true,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.defaultPrevented) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((i) =>
        i === -1 && step === -1 ? items.length - 1 : (i + step + items.length) % items.length,
      );
      return true;
    }
    if (e.key === "Enter" || e.key === " ") {
      if (activeIndex >= 0) items[activeIndex].action();
      return true;
    }
    if (e.key === "Escape") {
      onClose();
      return true;
    }
    return false;
  };

  return createPortal(
    <>
      <div
        onMouseDown={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }}
      />
      <div
        ref={menuRef}
        className="image-context-menu"
        role="menu"
        aria-label="Image options"
        aria-activedescendant={activeIndex >= 0 ? `image-menu-item-${activeIndex}` : undefined}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (!handleKeyDown(e)) return;
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          outline: "none",
          position: "fixed",
          top: (pos?.top ?? anchor.bottom) / zoom,
          left: (pos?.left ?? anchor.left) / zoom,
          zIndex: Z.CONTEXT_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 8,
          padding: 4,
          minWidth: 180,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {items.map((item, i) => (
          <div key={item.label}>
            {item.rule && <div style={{ height: 1, background: BG.divider, margin: "4px 8px" }} />}
            <button
              id={`image-menu-item-${i}`}
              role="menuitem"
              type="button"
              onClick={item.action}
              onMouseEnter={(e) => {
                setActiveIndex(i);
                hBg(e.currentTarget, BG.hover);
              }}
              onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              style={{
                width: "100%",
                background: i === activeIndex ? BG.hover : "none",
                border: "none",
                borderRadius: 6,
                padding: "7px 10px",
                cursor: "pointer",
                color: item.danger ? SEMANTIC.error : TEXT.primary,
                fontSize: 12.5,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "background 0.12s",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {item.icon}
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
