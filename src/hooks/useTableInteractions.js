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

export function useTableInteractions({
  block,
  noteId,
  blockIndex,
  onUpdateTableRows,
  tableRef,
  cellRefs,
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

  /* ── Context menu ─────────────────────────────────────── */
  const [contextMenu, setContextMenu] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleCellContextMenu = useCallback(
    (e, rowIdx, colIdx) => {
      e.preventDefault();
      e.stopPropagation();
      // The menu opens under the table, in line with the clicked column: the
      // scroller's top and bottom for the vertical anchor (the grid plus its
      // horizontal scrollbar when it has one, so the menu never covers a row
      // or the bar, and flips above the whole grid when there is no room
      // below), the cell's left and right for the horizontal (TableContextMenu).
      const cell = e.currentTarget.getBoundingClientRect();
      const grid = tableRef.current?.parentElement?.getBoundingClientRect() ?? cell;
      setContextMenu({
        anchor: { top: grid.top, bottom: grid.bottom, left: cell.left, right: cell.right },
        context: { type: rowIdx === 0 ? "header" : "cell", rowIndex: rowIdx, colIndex: colIdx },
      });
    },
    [tableRef],
  );

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
  // the rendered rows, the operation dropped it (review 2026-09-07, §3.4).
  // `dataRef` serves geometry and focus, never the rows an operation writes.
  const reshape = useCallback((fn) => {
    const { noteId: n, blockIndex: b } = dataRef.current;
    updateRef.current(n, b, fn);
  }, []);
  const widthOf = (r) => tableColumnCount(r) || 2;

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

  /* ── Drag-to-create ───────────────────────────────────── */
  const createRef = useRef({
    active: false,
    type: null,
    startY: 0,
    startX: 0,
    count: 0,
    moved: false,
  });
  const [previewCount, setPreviewCount] = useState({ rows: 0, cols: 0 });
  const [createBadge, setCreateBadge] = useState(null);

  const handleBottomZoneClick = useCallback(() => {
    // If drag already handled this interaction, skip
    if (createRef.current.handled) {
      createRef.current.handled = false;
      return;
    }
    reshape((curRows) => ({ rows: [...curRows, new Array(widthOf(curRows)).fill("")] }));
    const newIdx = dataRef.current.rows.length;
    setTimeout(() => {
      cellRefs.current?.[`${newIdx}-0`]?.focus();
    }, 50);
  }, [cellRefs, reshape]);

  const handleBottomZonePointerDown = useCallback(
    (e) => {
      const c = createRef.current;
      c.type = "rows";
      c.startY = e.clientY;
      c.startX = e.clientX;
      c.count = 0;
      c.active = true;
      c.moved = false;
      c.handled = false;

      const ROW_HEIGHT = 36;
      const MAX_ROWS = 20;

      const handleMove = (me) => {
        const dist = me.clientY - c.startY;
        const totalMove = Math.abs(me.clientX - c.startX) + Math.abs(me.clientY - c.startY);
        if (totalMove > 4) c.moved = true;
        const count = Math.min(MAX_ROWS, Math.max(0, Math.floor(dist / ROW_HEIGHT)));
        c.count = count;
        setPreviewCount((p) => ({ ...p, rows: count }));
        if (count > 0) {
          setCreateBadge({ x: me.clientX + 12, y: me.clientY - 16, count });
        } else {
          setCreateBadge(null);
        }
      };

      const handleUp = () => {
        c.active = false;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setCreateBadge(null);

        if (c.moved && c.count > 0) {
          // Drag → add N rows
          c.handled = true;
          const newIdx = dataRef.current.rows.length;
          reshape((curRows) => {
            const newRows = [...curRows];
            for (let i = 0; i < c.count; i++) newRows.push(new Array(widthOf(curRows)).fill(""));
            return { rows: newRows };
          });
          setTimeout(() => {
            cellRefs.current?.[`${newIdx}-0`]?.focus();
          }, 50);
        }
        // Simple click is handled by onClick

        setPreviewCount((p) => ({ ...p, rows: 0 }));
      };

      c.moveHandler = handleMove;
      c.upHandler = handleUp;
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [cellRefs, reshape],
  );

  const handleRightZoneClick = useCallback(() => {
    if (createRef.current.handled) {
      createRef.current.handled = false;
      return;
    }
    // Column cc + 1 for every row: a short row is padded up to the new column
    // so the cell lands where the user asked, not in a gap it did not reach.
    reshape((curRows, a) => {
      const cc = widthOf(curRows);
      return {
        rows: withColumnInserted(curRows, cc),
        alignments: [...a, "left"],
      };
    });
  }, [reshape]);

  const handleRightZonePointerDown = useCallback((e) => {
    const c = createRef.current;
    c.type = "cols";
    c.startX = e.clientX;
    c.startY = e.clientY;
    c.count = 0;
    c.active = true;
    c.moved = false;
    c.handled = false;

    const COL_WIDTH = 120;
    const MAX_COLS = 10;

    const handleMove = (me) => {
      const dist = me.clientX - c.startX;
      const totalMove = Math.abs(me.clientX - c.startX) + Math.abs(me.clientY - c.startY);
      if (totalMove > 4) c.moved = true;
      const count = Math.min(MAX_COLS, Math.max(0, Math.floor(dist / COL_WIDTH)));
      c.count = count;
      setPreviewCount((p) => ({ ...p, cols: count }));
      if (count > 0) {
        setCreateBadge({ x: me.clientX + 12, y: me.clientY - 16, count });
      } else {
        setCreateBadge(null);
      }
    };

    const handleUp = () => {
      c.active = false;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      setCreateBadge(null);

      if (c.moved && c.count > 0) {
        // Drag → add N columns
        c.handled = true;
        reshape((curRows, a) => {
          const cc = widthOf(curRows);
          let newRows = curRows;
          for (let j = 0; j < c.count; j++) {
            newRows = withColumnInserted(newRows, cc + j);
          }
          const newAligns = [...a];
          for (let j = 0; j < c.count; j++) newAligns.push("left");
          return { rows: newRows, alignments: newAligns };
        });
      }
      // Simple click is handled by onClick

      setPreviewCount((p) => ({ ...p, cols: 0 }));
    };

    c.moveHandler = handleMove;
    c.upHandler = handleUp;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, []);

  const cleanupCreate = useCallback(() => {
    const c = createRef.current;
    if (c.moveHandler) window.removeEventListener("pointermove", c.moveHandler);
    if (c.upHandler) window.removeEventListener("pointerup", c.upHandler);
    c.moveHandler = null;
    c.upHandler = null;
    c.active = false;
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
    previewCount,
    createBadge,

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
    handleCellContextMenu,
    closeContextMenu,
  };
}
