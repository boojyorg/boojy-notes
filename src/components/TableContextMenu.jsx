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
import { isMac } from "../utils/platform";
import Menu from "./Menu";

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
 * The shared menu (`Menu`), a Lucide glyph per item, deletes in red.
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
  const open = !!anchor && !!context;
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
            role: "menuitemradio",
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

  // The column already shows its alignment, so the radios carry no tick
  // (the menu bar's Format → Align does).
  return (
    <Menu
      label={type === "row" ? "Row options" : "Column options"}
      idPrefix="table-ctx-item"
      className="table-context-menu"
      anchor={anchor}
      gapY={4}
      minWidth={type === "row" ? 168 : 216}
      ticks={false}
      onClose={onDismiss}
      items={items}
    />
  );
}
