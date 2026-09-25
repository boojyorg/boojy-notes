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
  { value: "left", label: "Align left", key: "L", Icon: AlignStartIcon },
  { value: "center", label: "Align centre", key: "E", Icon: AlignCenterIcon },
  { value: "right", label: "Align right", key: "R", Icon: AlignEndIcon },
];
const shortcut = (key) => (isMac ? `⇧⌘${key}` : `Ctrl+Shift+${key}`);

/**
 * A table row's or column's menu, opened by its grip (TableHandles) and hung
 * just under it. Short labels, since the outlined row or column already says
 * what they act on, and no separators. A column's has its three alignments
 * as items of their own, each with its key; the column shows which it has,
 * so no tick (the menu bar's Format → Align carries one), and a choice
 * closes the menu like any other item. The header row's Delete makes
 * the row under it the header, as Markdown reads it. Right-click in a cell is
 * the editor's text menu (EditorContextMenu), which carries Delete table.
 *
 * The note-row menu's grammar: `role="menu"` with arrow keys, Enter and
 * Escape on a document listener, a focus trap that parks focus on the
 * container so a pointer-opened menu shows no ring, a Lucide glyph per item,
 * deletes in red.
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

  const items =
    type === "row"
      ? [
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
        ]
      : [
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
          {
            label: "Duplicate",
            icon: <CopyIcon />,
            action: act(() => onDuplicateColumn(colIndex)),
          },
          ...ALIGNMENTS.map((a) => ({
            label: a.label,
            icon: <a.Icon />,
            action: act(() => onAlign(colIndex, a.value)),
            radio: true,
            checked: a.value === alignment,
            hint: shortcut(a.key),
          })),
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
        ];
  itemsRef.current = items;

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
        aria-label={type === "row" ? "Row options" : "Column options"}
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
          minWidth: type === "row" ? 168 : 216,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {items.map((item, i) => (
          <button
            key={item.label}
            id={`table-ctx-item-${i}`}
            role={item.radio ? "menuitemradio" : "menuitem"}
            aria-checked={item.radio ? item.checked : undefined}
            type="button"
            onClick={item.action}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex((a) => (a === i ? -1 : a))}
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
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.hint && <span style={{ color: TEXT.muted, fontSize: 12 }}>{item.hint}</span>}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
