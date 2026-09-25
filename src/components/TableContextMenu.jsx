import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuPosition } from "../hooks/useMenuPosition";
import {
  AlignCenterIcon,
  AlignEndIcon,
  AlignStartIcon,
  ArrowDownToLineIcon,
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ArrowUpToLineIcon,
  CopyIcon,
  EraserIcon,
  TrashIcon,
} from "./Icons";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";

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
 * are sentence case.
 *
 * A grip (TableHandles) opens the same menu for its row or column
 * (`type` "row" / "column"): the row's hangs under the row at its grip.
 * A column's starts with Align, three glyphs on one line whose press keeps
 * the menu open so the change can be seen; then Insert, Duplicate, Clear
 * contents and Delete. A grip's menu has no Delete table: it acts on its
 * row or column only. The header row's Delete makes the row under it the
 * header, as Markdown reads it.
 */
export default function TableContextMenu({
  anchor,
  context,
  colCount,
  rowCount = 2,
  alignment = "left",
  onAlign,
  onDuplicateRow,
  onDuplicateColumn,
  onClearRow,
  onClearColumn,
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

  const grip = type === "row" || type === "column";
  const aligns = [];
  if (type === "column" && onAlign) {
    for (const [value, label, icon] of [
      ["left", "Align left", <AlignStartIcon key="l" />],
      ["center", "Align centre", <AlignCenterIcon key="c" />],
      ["right", "Align right", <AlignEndIcon key="r" />],
    ]) {
      aligns.push({
        label,
        icon,
        checked: alignment === value,
        action: () => onAlign(colIndex, value),
      });
    }
  }

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

  const copies = [];
  if (type === "row" && onDuplicateRow) {
    copies.push(
      { label: "Duplicate row", icon: <CopyIcon />, action: act(() => onDuplicateRow(rowIndex)) },
      { label: "Clear contents", icon: <EraserIcon />, action: act(() => onClearRow(rowIndex)) },
    );
  }
  if (type === "column" && onDuplicateColumn) {
    copies.push(
      {
        label: "Duplicate column",
        icon: <CopyIcon />,
        action: act(() => onDuplicateColumn(colIndex)),
      },
      {
        label: "Clear contents",
        icon: <EraserIcon />,
        action: act(() => onClearColumn(colIndex)),
      },
    );
  }

  const deletes = [];
  // From a cell, the header row cannot be deleted (GFM needs one); from its
  // grip it can, while another row is there to take its place. The last
  // column never can.
  if ((type === "cell" && rowIndex > 0) || (type === "row" && rowCount > 1)) {
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
  if (onDeleteTable && !grip) {
    deletes.push({
      label: "Delete table",
      icon: <TrashIcon />,
      action: act(() => onDeleteTable()),
      danger: true,
    });
  }

  const groups = [inserts, copies, deletes].filter((g) => g.length > 0);
  const items = [...aligns, ...groups.flat()];
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
        aria-label={
          type === "row" ? "Row options" : type === "column" ? "Column options" : "Table cell menu"
        }
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
          borderRadius: MENU_RADIUS,
          padding: MENU_PAD,
          minWidth: 180,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {aligns.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "2px 2px 2px 10px",
            }}
          >
            <span style={{ fontSize: 12.5, color: TEXT.muted }}>Align</span>
            <div style={{ display: "flex", gap: 2 }}>
              {aligns.map((item) => {
                index += 1;
                const i = index;
                return (
                  <button
                    key={item.label}
                    id={`table-ctx-item-${i}`}
                    role="menuitemradio"
                    aria-checked={item.checked}
                    aria-label={item.label}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setActiveIndex(i)}
                    style={{
                      width: 30,
                      height: 26,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "none",
                      borderRadius: MENU_ROW_RADIUS,
                      cursor: "pointer",
                      background: item.checked || i === activeIndex ? BG.hover : "transparent",
                      color: item.checked ? TEXT.primary : TEXT.muted,
                      transition: "background 0.12s",
                    }}
                  >
                    {item.icon}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {groups.map((group, g) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the groups are fixed in order
          <div key={g}>
            {(g > 0 || aligns.length > 0) && (
              <div style={{ height: 1, background: BG.divider, margin: "4px 8px" }} />
            )}
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
                    borderRadius: MENU_ROW_RADIUS,
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
