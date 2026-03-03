import { useState, useRef, useCallback } from "react";
import { TEXT } from "../constants/colors";

export default function TableBlock({ block, noteId, blockIndex, onUpdateTableRows }) {
  const [hovered, setHovered] = useState(false);
  const cellRefs = useRef({});

  const rows = block.rows || [["", ""], ["", ""]];
  const colCount = rows[0]?.length || 2;

  const updateCell = useCallback((rowIdx, colIdx, value) => {
    const newRows = rows.map(r => [...r]);
    newRows[rowIdx][colIdx] = value;
    onUpdateTableRows(noteId, blockIndex, newRows);
  }, [rows, noteId, blockIndex, onUpdateTableRows]);

  const addRow = useCallback(() => {
    const newRows = [...rows.map(r => [...r]), new Array(colCount).fill("")];
    onUpdateTableRows(noteId, blockIndex, newRows);
  }, [rows, colCount, noteId, blockIndex, onUpdateTableRows]);

  const addColumn = useCallback(() => {
    const newRows = rows.map((r, i) => [...r, i === 0 ? `Column ${colCount + 1}` : ""]);
    onUpdateTableRows(noteId, blockIndex, newRows);
  }, [rows, colCount, noteId, blockIndex, onUpdateTableRows]);

  const deleteRow = useCallback(() => {
    if (rows.length <= 2) return; // Keep at least header + 1 data row
    const newRows = rows.slice(0, -1).map(r => [...r]);
    onUpdateTableRows(noteId, blockIndex, newRows);
  }, [rows, noteId, blockIndex, onUpdateTableRows]);

  const deleteColumn = useCallback(() => {
    if (colCount <= 1) return;
    const newRows = rows.map(r => r.slice(0, -1));
    onUpdateTableRows(noteId, blockIndex, newRows);
  }, [rows, colCount, noteId, blockIndex, onUpdateTableRows]);

  const handleCellKeyDown = useCallback((e, rowIdx, colIdx) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const nextCol = colIdx + 1;
      const nextRow = rowIdx + (nextCol >= colCount ? 1 : 0);
      const targetCol = nextCol >= colCount ? 0 : nextCol;
      if (nextRow < rows.length) {
        const key = `${nextRow}-${targetCol}`;
        cellRefs.current[key]?.focus();
      } else {
        // Add new row when tabbing past last cell
        addRow();
        setTimeout(() => {
          const key = `${rows.length}-0`;
          cellRefs.current[key]?.focus();
        }, 50);
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      const prevCol = colIdx - 1;
      const prevRow = rowIdx + (prevCol < 0 ? -1 : 0);
      const targetCol = prevCol < 0 ? colCount - 1 : prevCol;
      if (prevRow >= 0) {
        const key = `${prevRow}-${targetCol}`;
        cellRefs.current[key]?.focus();
      }
    } else if (e.key === "Enter" && rowIdx === rows.length - 1) {
      e.preventDefault();
      addRow();
      setTimeout(() => {
        const key = `${rows.length}-${colIdx}`;
        cellRefs.current[key]?.focus();
      }, 50);
    }
  }, [rows, colCount, addRow]);

  const handleCellBlur = useCallback((e, rowIdx, colIdx) => {
    const value = e.target.innerText;
    if (value !== rows[rowIdx][colIdx]) {
      updateCell(rowIdx, colIdx, value);
    }
  }, [rows, updateCell]);

  return (
    <div
      className="table-block-wrapper"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <table className="table-block">
        <thead>
          <tr>
            {rows[0]?.map((cell, colIdx) => (
              <th
                key={colIdx}
                ref={(el) => { cellRefs.current[`0-${colIdx}`] = el; }}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleCellBlur(e, 0, colIdx)}
                onKeyDown={(e) => handleCellKeyDown(e, 0, colIdx)}
                dangerouslySetInnerHTML={{ __html: cell || "" }}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rOffset) => {
            const rowIdx = rOffset + 1;
            return (
              <tr key={rowIdx}>
                {row.map((cell, colIdx) => (
                  <td
                    key={colIdx}
                    ref={(el) => { cellRefs.current[`${rowIdx}-${colIdx}`] = el; }}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleCellBlur(e, rowIdx, colIdx)}
                    onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx)}
                    dangerouslySetInnerHTML={{ __html: cell || "" }}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hovered && (
        <div className="table-toolbar">
          <button onClick={(e) => { e.stopPropagation(); addRow(); }}>+ Row</button>
          <button onClick={(e) => { e.stopPropagation(); addColumn(); }}>+ Column</button>
          <button onClick={(e) => { e.stopPropagation(); deleteRow(); }}>- Row</button>
          <button onClick={(e) => { e.stopPropagation(); deleteColumn(); }}>- Column</button>
        </div>
      )}
    </div>
  );
}
