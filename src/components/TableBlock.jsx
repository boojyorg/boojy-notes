import { useState, useRef, useCallback } from "react";
import { useTheme } from "../hooks/useTheme";
import {
  inlineMarkdownToHtml,
  htmlToInlineMarkdown,
  sanitizeInlineHtml,
} from "../utils/inlineFormatting";
import { useTableInteractions } from "../hooks/useTableInteractions";
import TableContextMenu from "./TableContextMenu";

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
  const cellRefs = useRef({});
  const tableRef = useRef(null);
  const outerRef = useRef(null);

  const rows = block.rows || [
    ["", ""],
    ["", ""],
  ];
  const colCount = rows[0]?.length || 2;
  const alignments = block.alignments || [];

  const {
    selectedRow,
    selectedCol,
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
    contextMenu,
    handleCellContextMenu,
    closeContextMenu,
  } = useTableInteractions({
    block,
    noteId,
    blockIndex,
    onUpdateTableRows,
    tableRef,
    accentColor,
    cellRefs,
  });

  /* ── Cell editing (preserved from original) ────────────── */

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
          cellRefs.current[`${nextRow}-${targetCol}`]?.focus();
        } else {
          addRow();
          setTimeout(() => {
            cellRefs.current[`${rows.length}-0`]?.focus();
          }, 50);
        }
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const prevCol = colIdx - 1;
        const prevRow = rowIdx + (prevCol < 0 ? -1 : 0);
        const targetCol = prevCol < 0 ? colCount - 1 : prevCol;
        if (prevRow >= 0) {
          cellRefs.current[`${prevRow}-${targetCol}`]?.focus();
        }
      } else if (e.key === "Enter" && rowIdx === rows.length - 1) {
        e.preventDefault();
        addRow();
        setTimeout(() => {
          cellRefs.current[`${rows.length}-${colIdx}`]?.focus();
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

  /* ── Selection highlight helper ───────────────────────── */

  const isRowSelected = (rowIdx) => selectedRow === rowIdx;
  const isColSelected = (colIdx) => selectedCol === colIdx;

  const cellHighlightStyle = (rowIdx, colIdx) => {
    if (isRowSelected(rowIdx) || isColSelected(colIdx)) {
      return { background: accentColor ? `${accentColor}20` : "rgba(164,202,206,0.12)" };
    }
    return {};
  };

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div
      ref={outerRef}
      className="table-outer"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{ position: "relative", outline: "none", margin: "8px 0" }}
    >
      {/* Left edge zone — 24px strip to the left of the wrapper */}
      <div
        className="table-left-zone"
        style={{
          position: "absolute",
          left: -24,
          top: 0,
          width: 24,
          bottom: 0,
          cursor: "grab",
          zIndex: 5,
        }}
        onMouseEnter={() => setLeftZoneHovered(true)}
        onMouseLeave={() => setLeftZoneHovered(false)}
        onPointerDown={handleLeftZonePointerDown}
      />

      {/* Top edge zone — 24px strip above the wrapper */}
      <div
        className="table-top-zone"
        style={{
          position: "absolute",
          left: -24,
          top: -24,
          right: -28,
          height: 24,
          cursor: "grab",
          zIndex: 5,
        }}
        onMouseEnter={() => setTopZoneHovered(true)}
        onMouseLeave={() => setTopZoneHovered(false)}
        onPointerDown={handleTopZonePointerDown}
      />

      {/* Table wrapper */}
      <div
        className="table-block-wrapper"
        style={{ margin: 0, borderRadius: "8px 0 0 0", position: "relative", overflow: "visible" }}
      >
        <table ref={tableRef} className="table-block">
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
                  onFocus={clearSelection}
                  onPaste={(e) => handleCellPaste(e, 0, colIdx)}
                  onContextMenu={(e) => handleCellContextMenu(e, 0, colIdx)}
                  dangerouslySetInnerHTML={{
                    __html: inlineMarkdownToHtml(cell || "", noteTitleSet),
                  }}
                  style={{
                    fontWeight: 600,
                    background: isColSelected(colIdx)
                      ? accentColor
                        ? `${accentColor}20`
                        : "rgba(164,202,206,0.12)"
                      : accentColor
                        ? `${accentColor}10`
                        : undefined,
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
                      onFocus={clearSelection}
                      onPaste={(e) => handleCellPaste(e, rowIdx, colIdx)}
                      onContextMenu={(e) => handleCellContextMenu(e, rowIdx, colIdx)}
                      dangerouslySetInnerHTML={{
                        __html: inlineMarkdownToHtml(cell || "", noteTitleSet),
                      }}
                      style={{
                        textAlign: alignments[colIdx] || "left",
                        ...cellHighlightStyle(rowIdx, colIdx),
                      }}
                    />
                  ))}
                </tr>
              );
            })}
            {/* Preview rows during drag-to-create */}
            {previewCount.rows > 0 &&
              Array.from({ length: previewCount.rows }, (_, i) => (
                <tr key={`preview-${i}`} className="table-preview-row">
                  {Array.from({ length: colCount }, (_, ci) => (
                    <td
                      key={ci}
                      style={{
                        textAlign: alignments[ci] || "left",
                        background: accentColor ? `${accentColor}08` : "rgba(164,202,206,0.03)",
                        borderStyle: "dashed",
                      }}
                    >
                      &nbsp;
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>

        {/* Right edge zone — full-height add-column bar, inside wrapper so it matches table height */}
        <div
          className="table-right-zone"
          style={{
            position: "absolute",
            left: "100%",
            top: -1,
            width: 28,
            bottom: -1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            borderTop: `1px solid ${theme.BG.divider}`,
            borderRight: `1px solid ${theme.BG.divider}`,
            borderBottom: `1px solid ${theme.BG.divider}`,
            borderLeft: "none",
            borderRadius: "0 8px 8px 0",
            color: accentColor || "#A4CACE",
            fontSize: 15,
            opacity: rightZoneHovered ? 1 : 0,
            transition: "opacity 150ms",
            outline: "none",
            background: "none",
          }}
          onMouseEnter={() => setRightZoneHovered(true)}
          onMouseLeave={() => setRightZoneHovered(false)}
          onPointerDown={handleRightZonePointerDown}
          onClick={handleRightZoneClick}
        >
          +
        </div>
      </div>

      {/* Bottom edge zone — full-width add-row bar connected to table bottom */}
      <div
        className="table-bottom-zone"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 28,
          cursor: "pointer",
          borderLeft: `1px solid ${theme.BG.divider}`,
          borderRight: `1px solid ${theme.BG.divider}`,
          borderBottom: `1px solid ${theme.BG.divider}`,
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
          color: accentColor || "#A4CACE",
          fontSize: 15,
          opacity: bottomZoneHovered ? 1 : 0,
          transition: "opacity 150ms",
          outline: "none",
          background: "none",
        }}
        onMouseEnter={() => setBottomZoneHovered(true)}
        onMouseLeave={() => setBottomZoneHovered(false)}
        onPointerDown={handleBottomZonePointerDown}
        onClick={handleBottomZoneClick}
      >
        +
      </div>

      {/* Counter badge during drag-to-create */}
      {createBadge && (
        <div
          className="table-create-counter"
          style={{
            position: "fixed",
            left: createBadge.x,
            top: createBadge.y,
            padding: "2px 8px",
            background: accentColor || "#A4CACE",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 10,
            pointerEvents: "none",
            zIndex: 200,
          }}
        >
          +{createBadge.count}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <TableContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          context={contextMenu.context}
          colCount={colCount}
          alignments={alignments}
          onInsertRow={insertRow}
          onDeleteRow={deleteRowAt}
          onInsertColumn={insertColumn}
          onDeleteColumn={deleteColumnAt}
          onSetAlignment={setAlignment}
          onDismiss={closeContextMenu}
        />
      )}
    </div>
  );
}
