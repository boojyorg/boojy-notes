import { useRef, useCallback, useLayoutEffect, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import { inlineMarkdownToHtml, domNodeToMarkdown } from "../utils/inlineFormatting";
import { caretLength, getCaretOffset, placeCaret } from "../utils/domHelpers";
import { cellAt, tableColumnCount, withCell } from "../utils/tableShape";
import { useTableInteractions } from "../hooks/useTableInteractions";
import TableContextMenu from "./TableContextMenu";
import { Z } from "../constants/zIndex";

/**
 * One cell. The browser's while typed into: it commits what it holds on
 * every input at the text grain, and state paints it only when it does not
 * already hold state's text (useOwnedField), which is how a row inserted
 * above it repaints it and a render that merely caught up with the
 * keystrokes does not.
 */
function TableCell({
  tag: Tag,
  rowIdx,
  colIdx,
  text,
  syncGen,
  latestRows,
  noteTitleSet,
  cellRefs,
  onInput,
  onKeyDown,
  onFocus,
  onPaste,
  onContextMenu,
  style,
}) {
  const ref = useRef(null);
  useOwnedField(ref, {
    text,
    syncGen,
    latest: () => {
      const rows = latestRows();
      return rows && cellAt(rows[rowIdx], colIdx);
    },
    read: domNodeToMarkdown,
    paint: (el, t) => {
      const caret = getCaretOffset(el);
      el.innerHTML = inlineMarkdownToHtml(t, noteTitleSet);
      if (caret >= 0) placeCaret(el, Math.min(caret, caretLength(el)));
    },
  });
  return (
    <Tag
      ref={(el) => {
        ref.current = el;
        cellRefs.current[`${rowIdx}-${colIdx}`] = el;
      }}
      scope={Tag === "th" ? "col" : undefined}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onInput(e, rowIdx, colIdx)}
      onKeyDown={(e) => onKeyDown(e, rowIdx, colIdx)}
      onFocus={onFocus}
      onPaste={(e) => onPaste(e, rowIdx, colIdx)}
      onContextMenu={(e) => onContextMenu(e, rowIdx, colIdx)}
      style={style}
    />
  );
}

export default memo(function TableBlock({
  block,
  noteId,
  blockIndex,
  syncGen,
  noteDataRef,
  onUpdateTableCell,
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
  // Rows are ragged (a row holds exactly the cells its Markdown line holds);
  // the grid is drawn as wide as the widest row, and a row gains a cell only
  // when one is written into it (utils/tableShape.ts).
  const colCount = tableColumnCount(rows) || 2;
  const alignments = block.alignments || [];
  // The rows as the keystroke ref holds them: what a cell is judged against.
  const latestRows = useCallback(
    () => latestBlock(noteDataRef, noteId, block)?.rows,
    [noteDataRef, noteId, block],
  );

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

  /* ── Cell editing ─────────────────────────────────────── */

  // Every structural change is a function of the rows the keystroke ref
  // holds (`onUpdateTableRows(noteId, blockIndex, reshape)`), so a cell
  // edit still pending is inside it; the rendered `rows` are for geometry
  // and focus only.
  const handleCellInput = useCallback(
    (e, rowIdx, colIdx) => {
      onUpdateTableCell(noteId, blockIndex, rowIdx, colIdx, domNodeToMarkdown(e.currentTarget));
    },
    [noteId, blockIndex, onUpdateTableCell],
  );

  const addRow = useCallback(() => {
    onUpdateTableRows(noteId, blockIndex, (cur) => ({
      rows: [...cur, new Array(tableColumnCount(cur) || 2).fill("")],
    }));
  }, [noteId, blockIndex, onUpdateTableRows]);

  const setAlignment = useCallback(
    (colIdx, align) => {
      onUpdateTableRows(noteId, blockIndex, (cur, aligns) => {
        const newAligns = [...aligns];
        while (newAligns.length <= colIdx) newAligns.push("left");
        newAligns[colIdx] = align;
        return { rows: cur, alignments: newAligns };
      });
    },
    [noteId, blockIndex, onUpdateTableRows],
  );

  const focusCell = useCallback(
    (rowIdx, colIdx) => cellRefs.current[`${rowIdx}-${colIdx}`]?.focus(),
    [],
  );
  // A cell that does not exist yet (the row Enter or Tab has just added) is
  // focused as soon as it has rendered, not after a timer a fast typist
  // could beat.
  const focusOnRender = useRef(null);
  useLayoutEffect(() => {
    if (!focusOnRender.current) return;
    const { row, col } = focusOnRender.current;
    if (cellRefs.current[`${row}-${col}`]) {
      focusOnRender.current = null;
      focusCell(row, col);
    }
  });

  const handleCellKeyDown = useCallback(
    (e, rowIdx, colIdx) => {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const nextCol = colIdx + 1;
        const nextRow = rowIdx + (nextCol >= colCount ? 1 : 0);
        const targetCol = nextCol >= colCount ? 0 : nextCol;
        if (nextRow < rows.length) {
          focusCell(nextRow, targetCol);
        } else {
          addRow();
          focusOnRender.current = { row: rows.length, col: 0 };
        }
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const prevCol = colIdx - 1;
        const prevRow = rowIdx + (prevCol < 0 ? -1 : 0);
        const targetCol = prevCol < 0 ? colCount - 1 : prevCol;
        if (prevRow >= 0) focusCell(prevRow, targetCol);
      } else if (e.key === "Enter" && !e.shiftKey) {
        // A row is one line: Enter moves down a row (a new one after the
        // last), never into a second line of the cell. Shift+Enter is the
        // browser's line break, which the file holds as `<br>` (review
        // 2026-09-07, §3.1).
        e.preventDefault();
        if (rowIdx < rows.length - 1) {
          focusCell(rowIdx + 1, colIdx);
        } else {
          addRow();
          focusOnRender.current = { row: rows.length, col: colIdx };
        }
      }
    },
    [rows, colCount, addRow, focusCell],
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
        onUpdateTableRows(noteId, blockIndex, (cur) => {
          const width = tableColumnCount(cur) || 2;
          let newRows = cur;
          pastedRows.forEach((pRow, ri) => {
            const targetRow = rowIdx + ri;
            while (newRows.length <= targetRow) newRows = [...newRows, new Array(width).fill("")];
            pRow.forEach((val, ci) => {
              newRows = withCell(newRows, targetRow, colIdx + ci, val);
            });
          });
          return { rows: newRows };
        });
      }
    },
    [noteId, blockIndex, onUpdateTableRows],
  );

  /* ── Selection highlight helper ───────────────────────── */

  const isRowSelected = (rowIdx) => selectedRow === rowIdx;
  const isColSelected = (colIdx) => selectedCol === colIdx;

  const cellHighlightStyle = (rowIdx, colIdx) => {
    if (isRowSelected(rowIdx) || isColSelected(colIdx)) {
      return { background: `${accentColor || theme.ACCENT.primary}20` };
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
          zIndex: Z.ELEMENT_OVERLAY,
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
          zIndex: Z.ELEMENT_OVERLAY,
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
              {Array.from({ length: colCount }, (_, colIdx) => cellAt(rows[0], colIdx)).map(
                (cell, colIdx) => (
                  <TableCell
                    key={colIdx}
                    tag="th"
                    rowIdx={0}
                    colIdx={colIdx}
                    text={cell}
                    syncGen={syncGen}
                    latestRows={latestRows}
                    noteTitleSet={noteTitleSet}
                    cellRefs={cellRefs}
                    onInput={handleCellInput}
                    onKeyDown={handleCellKeyDown}
                    onFocus={clearSelection}
                    onPaste={handleCellPaste}
                    onContextMenu={handleCellContextMenu}
                    style={{
                      fontWeight: 600,
                      // Header cells carry no fill at rest — bold weight plus the border
                      // grid is the whole signal. Only an active column selection tints.
                      background: isColSelected(colIdx)
                        ? `${accentColor || theme.ACCENT.primary}20`
                        : "transparent",
                      textAlign: alignments[colIdx] || "left",
                    }}
                  />
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, rOffset) => {
              const rowIdx = rOffset + 1;
              return (
                <tr key={rowIdx}>
                  {Array.from({ length: colCount }, (_, colIdx) => cellAt(row, colIdx)).map(
                    (cell, colIdx) => (
                      <TableCell
                        key={colIdx}
                        tag="td"
                        rowIdx={rowIdx}
                        colIdx={colIdx}
                        text={cell}
                        syncGen={syncGen}
                        latestRows={latestRows}
                        noteTitleSet={noteTitleSet}
                        cellRefs={cellRefs}
                        onInput={handleCellInput}
                        onKeyDown={handleCellKeyDown}
                        onFocus={clearSelection}
                        onPaste={handleCellPaste}
                        onContextMenu={handleCellContextMenu}
                        style={{
                          textAlign: alignments[colIdx] || "left",
                          ...cellHighlightStyle(rowIdx, colIdx),
                        }}
                      />
                    ),
                  )}
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
                        background: `${accentColor || theme.ACCENT.primary}08`,
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
            color: accentColor || theme.ACCENT.primary,
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
          color: accentColor || theme.ACCENT.primary,
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
            background: accentColor || theme.ACCENT.primary,
            color: theme.ACCENT.onAccent,
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 10,
            pointerEvents: "none",
            zIndex: Z.DROPDOWN,
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
});
