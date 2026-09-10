import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuPosition } from "../hooks/useMenuPosition";
import {
  ArrowDownToLineIcon,
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ArrowUpToLineIcon,
  TrashIcon,
} from "./Icons";
import { Z } from "../constants/zIndex";

const hBg = (el, c) => {
  el.style.background = c;
};

/**
 * The cell's right-click menu: rows and columns around the clicked cell and,
 * last, the whole table. Delete table is the discoverable path to what Escape
 * then Backspace also does (the table is addressed as a whole; see TableBlock).
 *
 * The note-row menu's grammar (2026-09-10, judged against the raw-div version
 * it replaced): `role="menu"` with arrow keys, Enter and Escape on a document
 * listener, a focus trap that parks focus on the container so a pointer-opened
 * menu shows no ring, the elevated ground with the divider border, 12.5px
 * labels in the app face, a Lucide glyph per item (the arrow-to-line family
 * for the inserts, where the direction is the meaning; Trash for the deletes,
 * red with their labels), and the shared viewport-aware placement. It is
 * **anchored under the table, in line with the clicked column**, not at the
 * pointer: the anchor is the grid's top and bottom with the cell's left and
 * right (useTableInteractions), so it opens 4px under the grid with its left
 * edge on the column's, never covers a row (from a header cell, "under the
 * cell" hid the very column it was about to act on), and flips above the
 * whole grid when there is no room below. Every item acts on that column or
 * the clicked row, and the menu reads as attached to the table rather than
 * floating where the click happened to land; on a very tall table it can sit
 * a way below the pointer, accepted for the short tables notes hold. Labels
 * are sentence case. No alignment items, by decision: a file's `:---:` still
 * renders and round-trips, but the app offers no control for it.
 */
export default function TableContextMenu({
  anchor,
  context,
  colCount,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
  onDeleteTable,
  onDismiss,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;
  const menuRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const itemsRef = useRef([]);
  const open = !!anchor && !!context;

  useFocusTrap(menuRef, open, "container");
  const pos = useMenuPosition(menuRef, open, anchor, { gapY: 4 });

  const handleKeyDown = useCallback(
    (e) => {
      const items = itemsRef.current;
      if (!items.length || e.defaultPrevented) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < items.length) items[activeIndex].action();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    },
    [activeIndex, onDismiss],
  );

  // On the document, not the window: the app shell's shortcut handler is a
  // window listener registered at startup, and one added now would run after
  // it (see ContextMenu).
  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const { type, rowIndex, colIndex } = context;

  // An action closes the menu first; the editor scroll is put back a frame
  // later because focus returning to the cell can scroll the note to its top.
  const act = (fn) => () => {
    const scrollEl = document.querySelector(".editor-scroll");
    const scrollTop = scrollEl?.scrollTop;
    onDismiss();
    fn();
    if (scrollEl && scrollTop != null) {
      requestAnimationFrame(() => {
        scrollEl.scrollTop = scrollTop;
      });
    }
  };

  const inserts = [];
  if (type === "row" || type === "cell") {
    inserts.push(
      {
        label: "Insert row above",
        icon: <ArrowUpToLineIcon />,
        action: act(() => onInsertRow(rowIndex, "above")),
      },
      {
        label: "Insert row below",
        icon: <ArrowDownToLineIcon />,
        action: act(() => onInsertRow(rowIndex, "below")),
      },
    );
  }
  if (type === "column" || type === "cell" || type === "header") {
    inserts.push(
      {
        label: "Insert column left",
        icon: <ArrowLeftToLineIcon />,
        action: act(() => onInsertColumn(colIndex, "left")),
      },
      {
        label: "Insert column right",
        icon: <ArrowRightToLineIcon />,
        action: act(() => onInsertColumn(colIndex, "right")),
      },
    );
  }

  const deletes = [];
  // The header row cannot be deleted (GFM needs one) and neither can the last column.
  if ((type === "row" || type === "cell") && rowIndex > 0) {
    deletes.push({
      label: "Delete row",
      icon: <TrashIcon />,
      action: act(() => onDeleteRow(rowIndex)),
      danger: true,
    });
  }
  if ((type === "column" || type === "cell" || type === "header") && colCount > 1) {
    deletes.push({
      label: "Delete column",
      icon: <TrashIcon />,
      action: act(() => onDeleteColumn(colIndex)),
      danger: true,
    });
  }
  if (onDeleteTable) {
    deletes.push({
      label: "Delete table",
      icon: <TrashIcon />,
      action: act(() => onDeleteTable()),
      danger: true,
    });
  }

  const groups = [inserts, deletes].filter((g) => g.length > 0);
  const items = groups.flat();
  itemsRef.current = items;

  let index = -1;
  return createPortal(
    <>
      <div
        onClick={onDismiss}
        style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }}
      />
      <div
        ref={menuRef}
        className="table-context-menu"
        role="menu"
        aria-label="Table cell menu"
        aria-activedescendant={activeIndex >= 0 ? `table-ctx-item-${activeIndex}` : undefined}
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
          minWidth: 180,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {groups.map((group, g) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the groups are fixed in order
          <div key={g}>
            {g > 0 && <div style={{ height: 1, background: BG.divider, margin: "4px 8px" }} />}
            {group.map((item) => {
              index += 1;
              const i = index;
              return (
                <button
                  key={item.label}
                  id={`table-ctx-item-${i}`}
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
                  {/* The glyph inherits the item colour, so a delete's goes red with its label. */}
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>,
    document.body,
  );
}
