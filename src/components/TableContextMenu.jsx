import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  TrashIcon,
} from "./Icons";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { isMac } from "../utils/platform";

/**
 * A column's three alignments, with the keys that set them from a cell
 * (`useAppKeyboard`, the menu bar's Format → Align): Google Docs' and Word's.
 */
export const ALIGNMENTS = [
  { value: "left", label: "Left", key: "L", Icon: AlignStartIcon },
  { value: "center", label: "Centre", key: "E", Icon: AlignCenterIcon },
  { value: "right", label: "Right", key: "R", Icon: AlignEndIcon },
];
const shortcut = (key) => (isMac ? `⇧⌘${key}` : `Ctrl+Shift+${key}`);

/**
 * The table's menus. Right-click on a cell: rows and columns around the
 * clicked cell and, last, the whole table (Delete table is the discoverable
 * path to what Escape then Backspace also does), anchored under the table in
 * line with the clicked column so it never covers a row, and flipping above
 * the grid when there is no room below.
 *
 * A grip (TableHandles) opens its row's or column's own menu, hung just
 * under the grip: short labels, since the outlined row or column already
 * says what they act on, no separators and no Delete table. A column's has
 * Align, one item showing the column's alignment with the three choices in a
 * submenu beside it, each with its key. The header row's Delete makes the row
 * under it the header, as Markdown reads it.
 *
 * The note-row menu's grammar: `role="menu"` with arrow keys, Enter and
 * Escape on a document listener (ArrowRight opens the submenu, ArrowLeft or
 * Escape closes it), a focus trap that parks focus on the container so a
 * pointer-opened menu shows no ring, a Lucide glyph per item, deletes in red.
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
  const alignRowRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  // The Align submenu: open or not, and its highlighted choice.
  const [sub, setSub] = useState(null);
  const [subPos, setSubPos] = useState(null);
  const itemsRef = useRef([]);
  const open = !!anchor && !!context;

  useFocusTrap(menuRef, open, "container");
  const pos = useMenuPosition(menuRef, open, anchor, { gapY: 4 });

  // The submenu stands beside its row, on whichever side the window has room.
  useLayoutEffect(() => {
    if (!sub || !alignRowRef.current || !menuRef.current) {
      setSubPos(null);
      return;
    }
    const row = alignRowRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const width = 200;
    const right = menu.right + 4 + width <= window.innerWidth;
    setSubPos({ top: row.top - MENU_PAD, left: right ? menu.right + 4 : menu.left - 4 - width });
  }, [sub]);

  const current = ALIGNMENTS.findIndex((a) => a.value === alignment);
  const openSub = useCallback(
    (fromKeys) => setSub({ active: fromKeys ? Math.max(0, current) : -1 }),
    [current],
  );

  const handleKeyDown = useCallback(
    (e) => {
      const items = itemsRef.current;
      if (!items.length || e.defaultPrevented) return;
      if (sub) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const step = e.key === "ArrowDown" ? 1 : ALIGNMENTS.length - 1;
          setSub((s) => ({ active: (Math.max(0, s.active) + step) % ALIGNMENTS.length }));
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (sub.active >= 0) {
            onDismiss();
            onAlign?.(context.colIndex, ALIGNMENTS[sub.active].value);
          }
        } else if (e.key === "ArrowLeft" || e.key === "Escape") {
          e.preventDefault();
          setSub(null);
        }
        return;
      }
      const active = items[activeIndex];
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "ArrowRight" && active?.submenu) {
        e.preventDefault();
        openSub(true);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (active?.submenu) openSub(true);
        else active?.action();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    },
    [activeIndex, sub, openSub, onAlign, onDismiss, context],
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
  const grip = type === "row" || type === "column";

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

  const groups = [];
  if (type === "row") {
    groups.push([
      {
        label: "Insert above",
        icon: <ArrowUpToLineIcon />,
        action: act(() => onInsertRow(rowIndex, "above")),
      },
      {
        label: "Insert below",
        icon: <ArrowDownToLineIcon />,
        action: act(() => onInsertRow(rowIndex, "below")),
      },
      { label: "Duplicate", icon: <CopyIcon />, action: act(() => onDuplicateRow(rowIndex)) },
      ...(rowCount > 1
        ? [
            {
              label: "Delete",
              icon: <TrashIcon />,
              action: act(() => onDeleteRow(rowIndex)),
              danger: true,
            },
          ]
        : []),
    ]);
  } else if (type === "column") {
    const shown = ALIGNMENTS[Math.max(0, current)];
    groups.push([
      {
        label: "Insert left",
        icon: <ArrowLeftToLineIcon />,
        action: act(() => onInsertColumn(colIndex, "left")),
      },
      {
        label: "Insert right",
        icon: <ArrowRightToLineIcon />,
        action: act(() => onInsertColumn(colIndex, "right")),
      },
      { label: "Duplicate", icon: <CopyIcon />, action: act(() => onDuplicateColumn(colIndex)) },
      ...(onAlign
        ? [{ label: "Align", icon: <shown.Icon />, submenu: true, value: shown.label }]
        : []),
      ...(colCount > 1
        ? [
            {
              label: "Delete",
              icon: <TrashIcon />,
              action: act(() => onDeleteColumn(colIndex)),
              danger: true,
            },
          ]
        : []),
    ]);
  } else {
    const inserts = [];
    if (type === "cell") {
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
    const deletes = [];
    // From a cell the header row cannot be deleted (its grip can); the last
    // column never can.
    if (type === "cell" && rowIndex > 0) {
      deletes.push({
        label: "Delete row",
        icon: <TrashIcon />,
        action: act(() => onDeleteRow(rowIndex)),
        danger: true,
      });
    }
    if (colCount > 1) {
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
    groups.push(inserts, deletes);
  }
  const items = groups.flat();
  itemsRef.current = items;

  const rowStyle = (i, item) => ({
    width: "100%",
    background: i === activeIndex || (item.submenu && sub) ? BG.hover : "none",
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
  });

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
          minWidth: grip ? 168 : 180,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {groups.map((group, g) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the groups are fixed in order
          <div key={g}>
            {g > 0 && group.length > 0 && (
              <div style={{ height: 1, background: BG.divider, margin: "4px 8px" }} />
            )}
            {group.map((item) => {
              index += 1;
              const i = index;
              return (
                <button
                  key={item.label}
                  ref={item.submenu ? alignRowRef : undefined}
                  id={`table-ctx-item-${i}`}
                  role="menuitem"
                  type="button"
                  aria-haspopup={item.submenu ? "menu" : undefined}
                  aria-expanded={item.submenu ? !!sub : undefined}
                  onClick={item.submenu ? () => (sub ? setSub(null) : openSub(false)) : item.action}
                  onMouseEnter={() => {
                    setActiveIndex(i);
                    if (item.submenu) openSub(false);
                    else setSub(null);
                  }}
                  onMouseLeave={() => setActiveIndex((a) => (a === i ? -1 : a))}
                  style={rowStyle(i, item)}
                >
                  {/* The glyph inherits the item colour, so a delete's goes red with its label. */}
                  {item.icon}
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.submenu && (
                    <>
                      <span style={{ color: TEXT.muted }}>{item.value}</span>
                      <span style={{ display: "flex", color: TEXT.muted }}>
                        <ChevronRightIcon size={14} />
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {sub && (
        <div
          role="menu"
          aria-label="Align"
          style={{
            position: "fixed",
            top: subPos?.top ?? -9999,
            left: subPos?.left ?? -9999,
            width: 200,
            boxSizing: "border-box",
            zIndex: Z.CONTEXT_MENU,
            background: BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: MENU_RADIUS,
            padding: MENU_PAD,
            boxShadow: theme.modalShadow,
          }}
        >
          {ALIGNMENTS.map((a, k) => (
            <button
              key={a.value}
              role="menuitemradio"
              aria-checked={a.value === alignment}
              type="button"
              onClick={act(() => onAlign(colIndex, a.value))}
              onMouseEnter={() => setSub({ active: k })}
              style={{
                ...rowStyle(-2, a),
                background: sub.active === k ? BG.hover : "none",
              }}
            >
              <span style={{ display: "flex", width: 16 }}>
                {a.value === alignment && <CheckIcon />}
              </span>
              <span style={{ flex: 1 }}>{a.label}</span>
              <span style={{ color: TEXT.muted }}>{shortcut(a.key)}</span>
            </button>
          ))}
        </div>
      )}
    </>,
    document.body,
  );
}
