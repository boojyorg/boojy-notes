import { useState, useCallback, useRef, useEffect } from "react";

export function useTableInteractions({
  block,
  noteId,
  blockIndex,
  onUpdateTableRows,
  tableRef,
  accentColor,
  cellRefs,
}) {
  const rows = block.rows || [["", ""], ["", ""]];
  const colCount = rows[0]?.length || 2;
  const alignments = block.alignments || [];

  // Keep latest data in refs so drag handlers always see current values
  const dataRef = useRef({ rows, colCount, alignments, noteId, blockIndex });
  dataRef.current = { rows, colCount, alignments, noteId, blockIndex };
  const updateRef = useRef(onUpdateTableRows);
  updateRef.current = onUpdateTableRows;

  /* ── Selection ────────────────────────────────────────── */
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedCol, setSelectedCol] = useState(null);

  const clearSelection = useCallback(() => {
    setSelectedRow(null);
    setSelectedCol(null);
  }, []);

  /* ── Zone hover ───────────────────────────────────────── */
  const [leftZoneHovered, setLeftZoneHovered] = useState(false);
  const [topZoneHovered, setTopZoneHovered] = useState(false);
  const [bottomZoneHovered, setBottomZoneHovered] = useState(false);
  const [rightZoneHovered, setRightZoneHovered] = useState(false);

  /* ── Context menu ─────────────────────────────────────── */
  const [contextMenu, setContextMenu] = useState(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleCellContextMenu = useCallback(
    (e, rowIdx, colIdx) => {
      e.preventDefault();
      e.stopPropagation();
      let type;
      if (selectedRow !== null && selectedRow === rowIdx) {
        type = "row";
      } else if (selectedCol !== null && selectedCol === colIdx) {
        type = "column";
      } else if (rowIdx === 0) {
        type = "header";
      } else {
        type = "cell";
      }
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        context: { type, rowIndex: rowIdx, colIndex: colIdx },
      });
    },
    [selectedRow, selectedCol],
  );

  /* ── Row / Column helpers ──────────────────────────────── */
  const getRowAtY = useCallback(
    (clientY) => {
      if (!tableRef.current) return null;
      const trs = tableRef.current.querySelectorAll("tr");
      for (let i = 0; i < trs.length; i++) {
        const r = trs[i].getBoundingClientRect();
        if (clientY >= r.top && clientY <= r.bottom) return i;
      }
      return null;
    },
    [tableRef],
  );

  const getColAtX = useCallback(
    (clientX) => {
      if (!tableRef.current) return null;
      const cells = tableRef.current.querySelector("tr")?.children;
      if (!cells) return null;
      for (let i = 0; i < cells.length; i++) {
        const r = cells[i].getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right) return i;
      }
      return null;
    },
    [tableRef],
  );

  /* ── CRUD operations ──────────────────────────────────── */
  const insertRow = useCallback(
    (index, position) => {
      const { rows: r, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
      const emptyRow = new Array(cc).fill("");
      const newRows = r.map((row) => [...row]);
      const insertAt = position === "above" ? index : index + 1;
      newRows.splice(insertAt, 0, emptyRow);
      updateRef.current(n, b, newRows, a);
    },
    [],
  );

  const deleteRowAt = useCallback(
    (index) => {
      if (index === 0) return;
      const { rows: r, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
      const newRows = r.filter((_, i) => i !== index);
      updateRef.current(n, b, newRows, a);
      setSelectedRow(null);
    },
    [],
  );

  const addRowAtEnd = useCallback(() => {
    const { rows: r, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
    const emptyRow = new Array(cc).fill("");
    const newRows = [...r.map((row) => [...row]), emptyRow];
    updateRef.current(n, b, newRows, a);
    return r.length; // index of new row
  }, []);

  const insertColumn = useCallback(
    (index, position) => {
      const { rows: r, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
      const insertAt = position === "left" ? index : index + 1;
      const newRows = r.map((row, i) => {
        const newRow = [...row];
        newRow.splice(insertAt, 0, i === 0 ? `Col ${cc + 1}` : "");
        return newRow;
      });
      const newAligns = [...a];
      newAligns.splice(insertAt, 0, "left");
      updateRef.current(n, b, newRows, newAligns);
    },
    [],
  );

  const deleteColumnAt = useCallback(
    (index) => {
      const { rows: r, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
      if (cc <= 1) return;
      const newRows = r.map((row) => row.filter((_, i) => i !== index));
      const newAligns = a.filter((_, i) => i !== index);
      updateRef.current(n, b, newRows, newAligns);
      setSelectedCol(null);
    },
    [],
  );

  const addColumnAtEnd = useCallback(() => {
    const { rows: r, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
    const newRows = r.map((row, i) => [
      ...row,
      i === 0 ? `Col ${cc + 1}` : "",
    ]);
    const newAligns = [...a, "left"];
    updateRef.current(n, b, newRows, newAligns);
    return cc; // index of new column
  }, []);

  /* ── Keyboard ─────────────────────────────────────────── */
  const handleKeyDown = useCallback(
    (e) => {
      if (selectedRow !== null) {
        if (e.key === "Escape") {
          clearSelection();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          if (selectedRow > 0) {
            e.preventDefault();
            deleteRowAt(selectedRow);
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedRow((r) => Math.max(1, r - 1));
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedRow((r) => Math.min(dataRef.current.rows.length - 1, r + 1));
        }
        return;
      }
      if (selectedCol !== null) {
        if (e.key === "Escape") {
          clearSelection();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          if (dataRef.current.colCount > 1) {
            e.preventDefault();
            deleteColumnAt(selectedCol);
          }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          setSelectedCol((c) => Math.max(0, c - 1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setSelectedCol((c) => Math.min(dataRef.current.colCount - 1, c + 1));
        }
        return;
      }
    },
    [selectedRow, selectedCol, clearSelection, deleteRowAt, deleteColumnAt],
  );

  /* ── Drag reorder ─────────────────────────────────────── */
  const dragRef = useRef({
    active: false,
    type: null, // 'row' | 'col'
    fromIndex: null,
    insertAt: null,
    holdTimer: null,
    startX: 0,
    startY: 0,
    cloneEl: null,
    lineEl: null,
    moveHandler: null,
    upHandler: null,
  });

  const [dragInsert, setDragInsert] = useState(null);

  const cleanupDrag = useCallback(() => {
    const d = dragRef.current;
    if (d.holdTimer) clearTimeout(d.holdTimer);
    if (d.cloneEl) {
      d.cloneEl.remove();
      d.cloneEl = null;
    }
    if (d.lineEl) {
      d.lineEl.remove();
      d.lineEl = null;
    }
    // Remove the exact handler references that were added
    if (d.moveHandler) window.removeEventListener("pointermove", d.moveHandler);
    if (d.upHandler) window.removeEventListener("pointerup", d.upHandler);
    d.active = false;
    d.type = null;
    d.fromIndex = null;
    d.insertAt = null;
    d.holdTimer = null;
    d.moveHandler = null;
    d.upHandler = null;
    setDragInsert(null);
  }, []);

  const startEdgeDrag = useCallback(
    (type, e) => {
      const d = dragRef.current;
      const targetIndex =
        type === "row" ? getRowAtY(e.clientY) : getColAtX(e.clientX);
      if (targetIndex === null) return;

      // Header row can't be dragged (but can be selected)
      if (type === "row" && targetIndex === 0) {
        setSelectedRow(0);
        setSelectedCol(null);
        return;
      }

      d.type = type;
      d.startX = e.clientX;
      d.startY = e.clientY;

      // Define move and up handlers inline to capture stable refs
      const onMove = (me) => {
        if (!d.active) {
          // Before hold timer fires: if moved too far, cancel and select instead
          const dx = Math.abs(me.clientX - d.startX);
          const dy = Math.abs(me.clientY - d.startY);
          if (dx > 5 || dy > 5) {
            clearTimeout(d.holdTimer);
            d.holdTimer = null;
            if (d.type === "row") {
              const row = getRowAtY(d.startY);
              if (row !== null) { setSelectedRow(row); setSelectedCol(null); }
            } else {
              const col = getColAtX(d.startX);
              if (col !== null) { setSelectedCol(col); setSelectedRow(null); }
            }
            cleanupDrag();
          }
          return;
        }

        // Move floating clone
        if (d.cloneEl) {
          if (d.type === "row") {
            d.cloneEl.style.top = me.clientY - d.cloneEl._offsetY + "px";
          } else {
            d.cloneEl.style.left = me.clientX - d.cloneEl._offsetX + "px";
          }
        }

        // Compute insertion position
        if (!tableRef.current) return;
        if (d.type === "row") {
          const trs = tableRef.current.querySelectorAll("tr");
          let bestIdx = 1;
          let bestDist = Infinity;
          for (let i = 1; i <= trs.length; i++) {
            const y =
              i < trs.length
                ? trs[i].getBoundingClientRect().top
                : trs[trs.length - 1].getBoundingClientRect().bottom;
            const dist = Math.abs(me.clientY - y);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
          }
          d.insertAt = bestIdx;
          setDragInsert({ type: "row", index: bestIdx });

          if (d.lineEl) {
            const lineY =
              bestIdx < trs.length
                ? trs[bestIdx].getBoundingClientRect().top
                : trs[trs.length - 1].getBoundingClientRect().bottom;
            d.lineEl.style.top = lineY - 1 + "px";
            const tr = tableRef.current.getBoundingClientRect();
            d.lineEl.style.left = tr.left + "px";
            d.lineEl.style.width = tr.width + "px";
          }
        } else {
          const firstRow = tableRef.current.querySelector("tr");
          const cells = firstRow?.children;
          if (!cells) return;
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let i = 0; i <= cells.length; i++) {
            const x =
              i < cells.length
                ? cells[i].getBoundingClientRect().left
                : cells[cells.length - 1].getBoundingClientRect().right;
            const dist = Math.abs(me.clientX - x);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
          }
          d.insertAt = bestIdx;
          setDragInsert({ type: "col", index: bestIdx });

          if (d.lineEl) {
            const lineX =
              bestIdx < cells.length
                ? cells[bestIdx].getBoundingClientRect().left
                : cells[cells.length - 1].getBoundingClientRect().right;
            d.lineEl.style.left = lineX - 1 + "px";
            const tr = tableRef.current.getBoundingClientRect();
            d.lineEl.style.top = tr.top + "px";
            d.lineEl.style.height = tr.height + "px";
          }
        }
      };

      const onUp = () => {
        if (!d.active) {
          // Hold timer didn't fire → treat as click (select)
          clearTimeout(d.holdTimer);
          if (d.type === "row") {
            const row = getRowAtY(d.startY);
            if (row !== null) { setSelectedRow(row); setSelectedCol(null); }
          } else {
            const col = getColAtX(d.startX);
            if (col !== null) { setSelectedCol(col); setSelectedRow(null); }
          }
          cleanupDrag();
          return;
        }

        // Perform reorder using latest data from ref
        const { rows: curRows, alignments: curAligns, noteId: n, blockIndex: b } = dataRef.current;
        if (d.type === "row" && d.insertAt !== null && d.fromIndex !== null) {
          if (d.insertAt !== d.fromIndex && d.insertAt !== d.fromIndex + 1) {
            const newRows = curRows.map((r) => [...r]);
            const [moved] = newRows.splice(d.fromIndex, 1);
            const adj = d.insertAt > d.fromIndex ? d.insertAt - 1 : d.insertAt;
            newRows.splice(adj, 0, moved);
            updateRef.current(n, b, newRows, curAligns);
          }
        } else if (d.type === "col" && d.insertAt !== null && d.fromIndex !== null) {
          if (d.insertAt !== d.fromIndex && d.insertAt !== d.fromIndex + 1) {
            const adj = d.insertAt > d.fromIndex ? d.insertAt - 1 : d.insertAt;
            const newRows = curRows.map((row) => {
              const nr = [...row];
              const [movedC] = nr.splice(d.fromIndex, 1);
              nr.splice(adj, 0, movedC);
              return nr;
            });
            const newAligns = [...curAligns];
            const [movedA] = newAligns.splice(d.fromIndex, 1);
            newAligns.splice(adj, 0, movedA);
            updateRef.current(n, b, newRows, newAligns);
          }
        }

        cleanupDrag();
      };

      // Store handler refs for cleanup
      d.moveHandler = onMove;
      d.upHandler = onUp;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);

      // Start hold timer
      d.holdTimer = setTimeout(() => {
        d.holdTimer = null;
        d.active = true;
        d.fromIndex = targetIndex;

        // Create floating clone
        if (!tableRef.current) return;
        if (type === "row") {
          const trs = tableRef.current.querySelectorAll("tr");
          const tr = trs[targetIndex];
          if (!tr) return;
          const rect = tr.getBoundingClientRect();

          const floatTable = document.createElement("table");
          floatTable.className = "table-block";
          const tbody = document.createElement("tbody");
          tbody.appendChild(tr.cloneNode(true));
          floatTable.appendChild(tbody);
          Object.assign(floatTable.style, {
            position: "fixed",
            left: rect.left + "px",
            top: rect.top + "px",
            width: rect.width + "px",
            zIndex: "1000",
            pointerEvents: "none",
            opacity: "0.85",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            transform: "scale(1.02)",
            borderRadius: "4px",
            borderCollapse: "collapse",
          });
          floatTable._offsetY = e.clientY - rect.top;
          document.body.appendChild(floatTable);
          d.cloneEl = floatTable;
          tr.style.opacity = "0.3";
        } else {
          const trs = tableRef.current.querySelectorAll("tr");
          const firstCell = trs[0]?.children[targetIndex];
          if (!firstCell) return;
          const colRect = firstCell.getBoundingClientRect();
          const tRect = tableRef.current.getBoundingClientRect();

          const floatTable = document.createElement("table");
          floatTable.className = "table-block";
          for (const tr of trs) {
            const newTr = document.createElement("tr");
            const cell = tr.children[targetIndex];
            if (cell) newTr.appendChild(cell.cloneNode(true));
            floatTable.appendChild(newTr);
          }
          Object.assign(floatTable.style, {
            position: "fixed",
            left: colRect.left + "px",
            top: tRect.top + "px",
            width: colRect.width + "px",
            zIndex: "1000",
            pointerEvents: "none",
            opacity: "0.85",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            transform: "scale(1.02)",
            borderRadius: "4px",
            borderCollapse: "collapse",
          });
          floatTable._offsetX = e.clientX - colRect.left;
          document.body.appendChild(floatTable);
          d.cloneEl = floatTable;
          for (const tr of trs) {
            const cell = tr.children[targetIndex];
            if (cell) cell.style.opacity = "0.3";
          }
        }

        // Create insertion line
        const line = document.createElement("div");
        Object.assign(line.style, {
          position: "fixed",
          zIndex: "1000",
          pointerEvents: "none",
          borderRadius: "1px",
        });
        if (type === "row") {
          Object.assign(line.style, {
            height: "2px",
            background: accentColor || "#A4CACE",
            boxShadow: `0 0 6px ${accentColor || "#A4CACE"}50`,
          });
        } else {
          Object.assign(line.style, {
            width: "2px",
            background: accentColor || "#A4CACE",
            boxShadow: `0 0 6px ${accentColor || "#A4CACE"}50`,
          });
        }
        document.body.appendChild(line);
        d.lineEl = line;
      }, 400);
    },
    [tableRef, accentColor, getRowAtY, getColAtX, cleanupDrag],
  );

  const handleLeftZonePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      startEdgeDrag("row", e);
    },
    [startEdgeDrag],
  );

  const handleTopZonePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      startEdgeDrag("col", e);
    },
    [startEdgeDrag],
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
    const { rows: curRows, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
    const emptyRow = new Array(cc).fill("");
    const newRows = [...curRows.map((r) => [...r]), emptyRow];
    updateRef.current(n, b, newRows, a);
    const newIdx = curRows.length;
    setTimeout(() => {
      cellRefs.current?.[`${newIdx}-0`]?.focus();
    }, 50);
  }, [cellRefs]);

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
        const totalMove =
          Math.abs(me.clientX - c.startX) + Math.abs(me.clientY - c.startY);
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
          const { rows: curRows, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
          const emptyRow = new Array(cc).fill("");
          const newRows = [...curRows.map((r) => [...r])];
          for (let i = 0; i < c.count; i++) newRows.push([...emptyRow]);
          updateRef.current(n, b, newRows, a);
          setTimeout(() => {
            cellRefs.current?.[`${curRows.length}-0`]?.focus();
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
    [cellRefs],
  );

  const handleRightZoneClick = useCallback(() => {
    if (createRef.current.handled) {
      createRef.current.handled = false;
      return;
    }
    const { rows: curRows, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
    const newRows = curRows.map((r, i) => [
      ...r,
      i === 0 ? `Col ${cc + 1}` : "",
    ]);
    updateRef.current(n, b, newRows, [...a, "left"]);
  }, []);

  const handleRightZonePointerDown = useCallback(
    (e) => {
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
        const totalMove =
          Math.abs(me.clientX - c.startX) + Math.abs(me.clientY - c.startY);
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
          const { rows: curRows, colCount: cc, alignments: a, noteId: n, blockIndex: b } = dataRef.current;
          const newRows = curRows.map((r, ri) => {
            const nr = [...r];
            for (let j = 0; j < c.count; j++) {
              nr.push(ri === 0 ? `Col ${cc + j + 1}` : "");
            }
            return nr;
          });
          const newAligns = [...a];
          for (let j = 0; j < c.count; j++) newAligns.push("left");
          updateRef.current(n, b, newRows, newAligns);
        }
        // Simple click is handled by onClick

        setPreviewCount((p) => ({ ...p, cols: 0 }));
      };

      c.moveHandler = handleMove;
      c.upHandler = handleUp;
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [],
  );

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
    return () => {
      cleanupDrag();
      cleanupCreate();
    };
  }, [cleanupDrag, cleanupCreate]);

  /* ── Reset drag opacity on rows change ────────────────── */
  useEffect(() => {
    if (!tableRef.current) return;
    const trs = tableRef.current.querySelectorAll("tr");
    for (const tr of trs) {
      tr.style.opacity = "";
      for (const cell of tr.children) {
        cell.style.opacity = "";
      }
    }
  }, [rows, tableRef]);

  return {
    selectedRow,
    selectedCol,
    setSelectedRow,
    setSelectedCol,
    clearSelection,

    leftZoneHovered,
    setLeftZoneHovered,
    topZoneHovered,
    setTopZoneHovered,
    bottomZoneHovered,
    setBottomZoneHovered,
    rightZoneHovered,
    setRightZoneHovered,

    handleKeyDown,

    handleLeftZonePointerDown,
    handleTopZonePointerDown,
    dragInsert,

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
    addRowAtEnd,
    addColumnAtEnd,

    contextMenu,
    handleCellContextMenu,
    closeContextMenu,

    getRowAtY,
    getColAtX,
  };
}
