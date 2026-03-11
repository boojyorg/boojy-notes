import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";

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

export default function TableContextMenu({
  position,
  context,
  colCount,
  alignments,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
  onSetAlignment,
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
        label="Insert Row Above"
        onClick={() => {
          onInsertRow(rowIndex, "above");
          onDismiss();
        }}
      />,
    );
    items.push(
      <MenuItem
        key="row-below"
        label="Insert Row Below"
        onClick={() => {
          onInsertRow(rowIndex, "below");
          onDismiss();
        }}
      />,
    );
  }

  // Column operations
  if (type === "column" || type === "cell" || type === "header") {
    if (items.length > 0 && type === "cell") {
      // No separator needed before column ops in cell context
    }
    items.push(
      <MenuItem
        key="col-left"
        label="Insert Column Left"
        onClick={() => {
          onInsertColumn(colIndex, "left");
          onDismiss();
        }}
      />,
    );
    items.push(
      <MenuItem
        key="col-right"
        label="Insert Column Right"
        onClick={() => {
          onInsertColumn(colIndex, "right");
          onDismiss();
        }}
      />,
    );
  }

  // Separator before delete options
  if (items.length > 0) {
    items.push(<Separator key="sep" />);
  }

  // Delete row (not for header)
  if ((type === "row" || type === "cell") && rowIndex > 0) {
    items.push(
      <MenuItem
        key="del-row"
        label="Delete Row"
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
        label="Delete Column"
        danger
        onClick={() => {
          onDeleteColumn(colIndex);
          onDismiss();
        }}
      />,
    );
  }

  // Alignment options for column/header context
  if ((type === "column" || type === "header") && onSetAlignment) {
    const currentAlign = (alignments && alignments[colIndex]) || "left";
    items.push(<Separator key="sep-align" />);
    items.push(
      <MenuItem
        key="align-left"
        label={`Align Left${currentAlign === "left" ? "  \u2713" : ""}`}
        onClick={() => {
          onSetAlignment(colIndex, "left");
          onDismiss();
        }}
      />,
    );
    items.push(
      <MenuItem
        key="align-center"
        label={`Align Center${currentAlign === "center" ? "  \u2713" : ""}`}
        onClick={() => {
          onSetAlignment(colIndex, "center");
          onDismiss();
        }}
      />,
    );
    items.push(
      <MenuItem
        key="align-right"
        label={`Align Right${currentAlign === "right" ? "  \u2713" : ""}`}
        onClick={() => {
          onSetAlignment(colIndex, "right");
          onDismiss();
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
        zIndex: 300,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        backdropFilter: "blur(12px)",
      }}
    >
      {items}
    </div>,
    document.body,
  );
}
