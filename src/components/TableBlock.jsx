import { useState, useRef, useCallback } from "react";
import { useTheme } from "../hooks/useTheme";
import {
  inlineMarkdownToHtml,
  htmlToInlineMarkdown,
  sanitizeInlineHtml,
} from "../utils/inlineFormatting";

export default function TableBlock({
  block,
  noteId,
  blockIndex,
  onUpdateTableRows,
  noteTitleSet,
  accentColor,
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const [hovered, setHovered] = useState(false);
  const cellRefs = useRef({});

  const rows = block.rows || [
    ["", ""],
    ["", ""],
  ];
  const colCount = rows[0]?.length || 2;
  const alignments = block.alignments || [];

  const updateCell = useCallback(
    (rowIdx, colIdx, value) => {
      const newRows = rows.map((r) => [...r]);
      newRows[rowIdx][colIdx] = value;
      onUpdateTableRows(noteId, blockIndex, newRows, alignments);
    },
    [rows, noteId, blockIndex, onUpdateTableRows, alignments],
  );

  const addRow = useCallback(() => {
    const newRows = [...rows.map((r) => [...r]), new Array(colCount).fill("")];
    onUpdateTableRows(noteId, blockIndex, newRows, alignments);
  }, [rows, colCount, noteId, blockIndex, onUpdateTableRows, alignments]);

  const addColumn = useCallback(() => {
    const newRows = rows.map((r, i) => [...r, i === 0 ? `Column ${colCount + 1}` : ""]);
    const newAligns = [...alignments, "left"];
    onUpdateTableRows(noteId, blockIndex, newRows, newAligns);
  }, [rows, colCount, noteId, blockIndex, onUpdateTableRows, alignments]);

  const deleteRow = useCallback(() => {
    if (rows.length <= 2) return;
    const newRows = rows.slice(0, -1).map((r) => [...r]);
    onUpdateTableRows(noteId, blockIndex, newRows, alignments);
  }, [rows, noteId, blockIndex, onUpdateTableRows, alignments]);

  const deleteColumn = useCallback(() => {
    if (colCount <= 1) return;
    const newRows = rows.map((r) => r.slice(0, -1));
    const newAligns = alignments.slice(0, -1);
    onUpdateTableRows(noteId, blockIndex, newRows, newAligns);
  }, [rows, colCount, noteId, blockIndex, onUpdateTableRows, alignments]);

  const setAlignment = useCallback(
    (colIdx, align) => {
      const newAligns = [...alignments];
      while (newAligns.length <= colIdx) newAligns.push("left");
      newAligns[colIdx] = align;
      onUpdateTableRows(noteId, blockIndex, rows, newAligns);
    },
    [alignments, rows, noteId, blockIndex, onUpdateTableRows],
  );

  const handleCellKeyDown = useCallback(
    (e, rowIdx, colIdx) => {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const nextCol = colIdx + 1;
        const nextRow = rowIdx + (nextCol >= colCount ? 1 : 0);
        const targetCol = nextCol >= colCount ? 0 : nextCol;
        if (nextRow < rows.length) {
          const key = `${nextRow}-${targetCol}`;
          cellRefs.current[key]?.focus();
        } else {
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
    },
    [rows, colCount, addRow],
  );

  const handleCellBlur = useCallback(
    (e, rowIdx, colIdx) => {
      const value = htmlToInlineMarkdown(sanitizeInlineHtml(e.target.innerHTML));
      if (value !== rows[rowIdx][colIdx]) {
        updateCell(rowIdx, colIdx, value);
      }
    },
    [rows, updateCell],
  );

  const handleCellPaste = useCallback(
    (e, rowIdx, colIdx) => {
      const text = e.clipboardData.getData("text/plain");
      if (text.includes("\t") || (text.includes(",") && text.includes("\n"))) {
        e.preventDefault();
        const delimiter = text.includes("\t") ? "\t" : ",";
        const pastedRows = text
          .trim()
          .split("\n")
          .map((r) => r.split(delimiter).map((c) => c.trim()));
        const newRows = rows.map((r) => [...r]);
        pastedRows.forEach((pRow, ri) => {
          const targetRow = rowIdx + ri;
          while (newRows.length <= targetRow) newRows.push(new Array(colCount).fill(""));
          pRow.forEach((val, ci) => {
            const targetCol = colIdx + ci;
            while (newRows[0].length <= targetCol) {
              newRows.forEach((r) => r.push(""));
            }
            newRows[targetRow][targetCol] = val;
          });
        });
        onUpdateTableRows(noteId, blockIndex, newRows, alignments);
      }
    },
    [rows, colCount, noteId, blockIndex, onUpdateTableRows, alignments],
  );

  const [selectedCol, setSelectedCol] = useState(null);

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
                ref={(el) => {
                  cellRefs.current[`0-${colIdx}`] = el;
                }}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => handleCellBlur(e, 0, colIdx)}
                onKeyDown={(e) => handleCellKeyDown(e, 0, colIdx)}
                onFocus={() => setSelectedCol(colIdx)}
                onPaste={(e) => handleCellPaste(e, 0, colIdx)}
                dangerouslySetInnerHTML={{
                  __html: inlineMarkdownToHtml(cell || "", noteTitleSet),
                }}
                style={{
                  fontWeight: 600,
                  background: accentColor ? `${accentColor}10` : undefined,
                  textAlign: alignments[colIdx] || "left",
                }}
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
                    ref={(el) => {
                      cellRefs.current[`${rowIdx}-${colIdx}`] = el;
                    }}
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => handleCellBlur(e, rowIdx, colIdx)}
                    onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx)}
                    onFocus={() => setSelectedCol(colIdx)}
                    onPaste={(e) => handleCellPaste(e, rowIdx, colIdx)}
                    dangerouslySetInnerHTML={{
                      __html: inlineMarkdownToHtml(cell || "", noteTitleSet),
                    }}
                    style={{
                      textAlign: alignments[colIdx] || "left",
                    }}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hovered && (
        <div className="table-toolbar">
          <button
            onClick={(e) => {
              e.stopPropagation();
              addRow();
            }}
          >
            + Row
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              addColumn();
            }}
          >
            + Column
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteRow();
            }}
          >
            - Row
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteColumn();
            }}
          >
            - Column
          </button>
          {selectedCol !== null && (
            <>
              <span style={{ margin: "0 4px", color: TEXT.muted, fontSize: 10 }}>|</span>
              {[
                { align: "left", label: "L" },
                { align: "center", label: "C" },
                { align: "right", label: "R" },
              ].map(({ align, label }) => (
                <button
                  key={align}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAlignment(selectedCol, align);
                  }}
                  style={{
                    fontWeight: alignments[selectedCol] === align ? 700 : 400,
                    textDecoration: alignments[selectedCol] === align ? "underline" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
