import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

function MenuItem({ label, onClick, danger }) {
  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;
  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        // Capture scroll position before the action/dismiss removes the portal
        // and focus returns to the editor (which would trigger scroll-to-top)
        const scrollEl = document.querySelector(".editor-scroll");
        const scrollTop = scrollEl?.scrollTop;
        onClick(e);
        if (scrollEl && scrollTop != null) {
          requestAnimationFrame(() => {
            scrollEl.scrollTop = scrollTop;
          });
        }
      }}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        color: danger ? SEMANTIC.error : TEXT.primary,
        cursor: "pointer",
        borderRadius: 4,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = BG.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </div>
  );
}

function Separator() {
  const { theme } = useTheme();
  return (
    <div
      style={{
        height: 1,
        background: theme.BG.divider,
        margin: "4px 8px",
      }}
    />
  );
}

/**
 * The cell's right-click menu: rows and columns around the clicked cell and,
 * last, the whole table. Delete table is the discoverable path to what Escape
 * then Backspace also does (the table is addressed as a whole; see
 * TableBlock). Labels are sentence case, as the rest of the app's menus are.
 * No alignment items, by decision (2026-09-10): a file's `:---:` still renders
 * and round-trips, but the app offers no control for it.
 */
export default function TableContextMenu({
  position,
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
  const { BG } = theme;

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onDismiss();
    };
    const handleClick = (e) => {
      if (!e.target.closest(".table-context-menu")) onDismiss();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onDismiss]);

  if (!position || !context) return null;

  const { type, rowIndex, colIndex } = context;

  const items = [];

  // Row operations (not for header-only context)
  if (type === "row" || type === "cell") {
    items.push(
      <MenuItem
        key="row-above"
        label="Insert row above"
        onClick={() => {
          onInsertRow(rowIndex, "above");
          onDismiss();
        }}
      />,
    );
    items.push(
      <MenuItem
        key="row-below"
        label="Insert row below"
        onClick={() => {
          onInsertRow(rowIndex, "below");
          onDismiss();
        }}
      />,
    );
  }

  // Column operations
  if (type === "column" || type === "cell" || type === "header") {
    items.push(
      <MenuItem
        key="col-left"
        label="Insert column left"
        onClick={() => {
          onInsertColumn(colIndex, "left");
          onDismiss();
        }}
      />,
    );
    items.push(
      <MenuItem
        key="col-right"
        label="Insert column right"
        onClick={() => {
          onInsertColumn(colIndex, "right");
          onDismiss();
        }}
      />,
    );
  }

  // Separator before the deletions
  if (items.length > 0) {
    items.push(<Separator key="sep" />);
  }

  // Delete row (not for header)
  if ((type === "row" || type === "cell") && rowIndex > 0) {
    items.push(
      <MenuItem
        key="del-row"
        label="Delete row"
        danger
        onClick={() => {
          onDeleteRow(rowIndex);
          onDismiss();
        }}
      />,
    );
  }

  // Delete column (need at least 2 columns)
  if ((type === "column" || type === "cell" || type === "header") && colCount > 1) {
    items.push(
      <MenuItem
        key="del-col"
        label="Delete column"
        danger
        onClick={() => {
          onDeleteColumn(colIndex);
          onDismiss();
        }}
      />,
    );
  }

  // The whole table, last, in every context
  if (onDeleteTable) {
    items.push(
      <MenuItem
        key="del-table"
        label="Delete table"
        danger
        onClick={() => {
          onDismiss();
          onDeleteTable();
        }}
      />,
    );
  }

  return createPortal(
    <div
      className="table-context-menu"
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 8,
        padding: 4,
        minWidth: 180,
        zIndex: Z.CONTEXT_MENU,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        backdropFilter: "blur(12px)",
      }}
    >
      {items}
    </div>,
    document.body,
  );
}
