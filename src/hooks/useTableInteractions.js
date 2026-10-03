import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  tableColumnCount,
  withAlignment,
  withColumnDuplicated,
  withColumnInserted,
  withColumnMoved,
  withRowDuplicated,
  withRowMoved,
} from "../utils/tableShape";

const widthOf = (r) => tableColumnCount(r) || 2;

export function useTableInteractions({
  block,
  noteId,
  blockIndex,
  onUpdateTableRows,
  onRowsAdded,
}) {
  const defaultRows = useMemo(
    () => [
      ["", ""],
      ["", ""],
    ],
    [],
  );
  const rows = block.rows || defaultRows;
  // The widest row, not the header: rows are ragged and the grid is drawn to
  // the widest one (utils/tableShape.ts).
  const colCount = tableColumnCount(rows) || 2;
  const alignments = block.alignments || [];

  // Keep latest data in refs so drag handlers always see current values
  const dataRef = useRef({ rows, colCount, alignments, noteId, blockIndex });
  dataRef.current = { rows, colCount, alignments, noteId, blockIndex };
  const updateRef = useRef(onUpdateTableRows);
  updateRef.current = onUpdateTableRows;
  const rowsAddedRef = useRef(onRowsAdded);
  rowsAddedRef.current = onRowsAdded;

  /* ── Context menu ─────────────────────────────────────── */
  const [contextMenu, setContextMenu] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  /** A grip's menu: its row or column, hung where the grip says (TableHandles). */
  const openGripMenu = useCallback((target, anchor) => {
    setContextMenu({
      anchor,
      context:
        target.kind === "row"
          ? { type: "row", rowIndex: target.index, colIndex: 0 }
          : { type: "column", rowIndex: 0, colIndex: target.index },
    });
  }, []);

  /* ── CRUD operations ──────────────────────────────────── */
  // Every operation reshapes the rows as the keystroke ref holds them
  // (`onUpdateTableRows(noteId, blockIndex, reshape)`), so a cell edit still
  // pending in a focused cell is inside the rows it reshapes; computed from
  // the rendered rows, the operation would drop it.
  // `dataRef` serves geometry and focus, never the rows an operation writes.
  const reshape = useCallback((fn) => {
    const { noteId: n, blockIndex: b } = dataRef.current;
    updateRef.current(n, b, fn);
  }, []);

  const insertRow = useCallback(
    (index, position) => {
      reshape((r) => {
        const newRows = r.map((row) => [...row]);
        const insertAt = position === "above" ? index : index + 1;
        newRows.splice(insertAt, 0, new Array(widthOf(r)).fill(""));
        return { rows: newRows };
      });
    },
    [reshape],
  );

  // The header can go too: the row under it becomes the header, as Markdown
  // reads it. A table keeps at least its header row.
  const deleteRowAt = useCallback(
    (index) => {
      reshape((r) => (r.length > 1 ? { rows: r.filter((_, i) => i !== index) } : { rows: r }));
    },
    [reshape],
  );

  const insertColumn = useCallback(
    (index, position) => {
      reshape((r, a) => {
        const insertAt = position === "left" ? index : index + 1;
        const newAligns = [...a];
        newAligns.splice(insertAt, 0, "left");
        return {
          rows: withColumnInserted(r, insertAt),
          alignments: newAligns,
        };
      });
    },
    [reshape],
  );

  const deleteColumnAt = useCallback(
    (index) => {
      if (dataRef.current.colCount <= 1) return;
      reshape((r, a) => ({
        rows: r.map((row) => row.filter((_, i) => i !== index)),
        alignments: a.filter((_, i) => i !== index),
      }));
    },
    [reshape],
  );

  const moveRow = useCallback(
    (from, to) => reshape((r) => ({ rows: withRowMoved(r, from, to) })),
    [reshape],
  );
  const moveColumn = useCallback(
    (from, to) => reshape((r, a) => withColumnMoved(r, a, from, to)),
    [reshape],
  );
  const duplicateRow = useCallback(
    (index) => reshape((r) => ({ rows: withRowDuplicated(r, index) })),
    [reshape],
  );
  const duplicateColumn = useCallback(
    (index) => reshape((r, a) => withColumnDuplicated(r, a, index)),
    [reshape],
  );
  // One column's alignment: the separator line is the only line it rewrites,
  // and a choice the column already holds writes nothing.
  const setAlignment = useCallback(
    (index, alignment) => {
      const current = dataRef.current.alignments;
      if (withAlignment(current, index, alignment) === current) return;
      reshape((r, a) => ({ rows: r, alignments: withAlignment(a, index, alignment) }));
    },
    [reshape],
  );

  /* ── Add bars: a click adds one, a drag outward several ── */
  // At the far edge, one commit each, so one undo. A new row hands its index
  // to `onRowsAdded` (the caret goes there).
  const addRows = useCallback(
    (count) => {
      rowsAddedRef.current?.(dataRef.current.rows.length);
      reshape((r) => ({
        rows: [...r, ...Array.from({ length: count }, () => new Array(widthOf(r)).fill(""))],
      }));
    },
    [reshape],
  );
  // Column cc + 1 for every row: a short row is padded up to the new column
  // so the cell lands where the user asked, not in a gap it did not reach.
  const addColumns = useCallback(
    (count) =>
      reshape((r, a) => {
        const cc = widthOf(r);
        let rows = r;
        for (let j = 0; j < count; j++) rows = withColumnInserted(rows, cc + j);
        return { rows, alignments: [...a, ...new Array(count).fill("left")] };
      }),
    [reshape],
  );

  // One row per 36 px down (at most 20), one column per 120 px right (at
  // most 10), counted on a badge as the pointer goes and added on release.
  const createRef = useRef({ count: 0, moved: false, handled: false });
  const [previewRows, setPreviewRows] = useState(0);
  const [createBadge, setCreateBadge] = useState(null);

  const startCreateDrag = useCallback(
    (axis, e) => {
      const c = createRef.current;
      const startX = e.clientX;
      const startY = e.clientY;
      const [step, max] = axis === "rows" ? [36, 20] : [120, 10];
      c.count = 0;
      c.moved = false;
      c.handled = false;

      const handleMove = (me) => {
        const dist = axis === "rows" ? me.clientY - startY : me.clientX - startX;
        if (Math.abs(me.clientX - startX) + Math.abs(me.clientY - startY) > 4) c.moved = true;
        c.count = Math.min(max, Math.max(0, Math.floor(dist / step)));
        if (axis === "rows") setPreviewRows(c.count);
        setCreateBadge(
          c.count > 0 ? { x: me.clientX + 12, y: me.clientY - 16, count: c.count } : null,
        );
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setCreateBadge(null);
        setPreviewRows(0);
        // A plain click is the bar's onClick.
        if (c.moved && c.count > 0) {
          c.handled = true;
          if (axis === "rows") addRows(c.count);
          else addColumns(c.count);
        }
      };
      c.moveHandler = handleMove;
      c.upHandler = handleUp;
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [addRows, addColumns],
  );
  // The click that ends a drag has been handled by the drag.
  const clickAdding = useCallback((add) => {
    if (createRef.current.handled) createRef.current.handled = false;
    else add(1);
  }, []);
  const handleBottomZonePointerDown = useCallback(
    (e) => startCreateDrag("rows", e),
    [startCreateDrag],
  );
  const handleRightZonePointerDown = useCallback(
    (e) => startCreateDrag("cols", e),
    [startCreateDrag],
  );
  const handleBottomZoneClick = useCallback(() => clickAdding(addRows), [clickAdding, addRows]);
  const handleRightZoneClick = useCallback(
    () => clickAdding(addColumns),
    [clickAdding, addColumns],
  );

  const cleanupCreate = useCallback(() => {
    const c = createRef.current;
    if (c.moveHandler) window.removeEventListener("pointermove", c.moveHandler);
    if (c.upHandler) window.removeEventListener("pointerup", c.upHandler);
    c.moveHandler = null;
    c.upHandler = null;
  }, []);

  /* ── Cleanup on unmount ───────────────────────────────── */
  useEffect(() => {
    return () => cleanupCreate();
  }, [cleanupCreate]);

  return {
    handleBottomZonePointerDown,
    handleBottomZoneClick,
    handleRightZonePointerDown,
    handleRightZoneClick,
    previewRows,
    createBadge,
    addRows,

    insertRow,
    deleteRowAt,
    insertColumn,
    deleteColumnAt,
    moveRow,
    moveColumn,
    duplicateRow,
    duplicateColumn,
    setAlignment,

    contextMenu,
    openGripMenu,
    closeContextMenu,
  };
}
