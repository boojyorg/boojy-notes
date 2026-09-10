import { useRef, useCallback, useLayoutEffect, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import { inlineMarkdownToHtml, domNodeToMarkdown } from "../utils/inlineFormatting";
import { caretLength, getCaretOffset, placeCaret } from "../utils/domHelpers";
import { cellAt, tableColumnCount, withCell } from "../utils/tableShape";
import { BAND_REACH, bandFill } from "../utils/selectionBand";
import { useTableInteractions } from "../hooks/useTableInteractions";
import TableContextMenu from "./TableContextMenu";
import { PlusIcon } from "./Icons";
import { Z } from "../constants/zIndex";

/** The add-row and add-column bars' thickness: a generous hit box for a hairline. */
export const ADD_BAR = 20;
/** The invisible row and column strips left of and above the grid. */
const EDGE_ZONE = 24;

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

/**
 * Whether a collapsed caret in `el` sits on its first (`"top"`) or last
 * (`"bottom"`) line, the paragraph handler's measure: the caret's rect against
 * the cell's content box, within one line height. An empty cell has no rect
 * at all (Chromium reports zeros), and is one line, so both edges are true.
 */
function caretOnLine(el, edge) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  // jsdom has no Range.getBoundingClientRect; a cell it cannot measure is one line.
  if (typeof range.getBoundingClientRect !== "function") return true;
  const rect = range.getBoundingClientRect();
  if (rect.top === 0 && rect.bottom === 0) return true;
  const cs = getComputedStyle(el);
  const line = Number.parseFloat(cs.lineHeight) || 20;
  const box = el.getBoundingClientRect();
  if (edge === "top") return rect.top - (box.top + (Number.parseFloat(cs.paddingTop) || 0)) < line;
  return box.bottom - (Number.parseFloat(cs.paddingBottom) || 0) - rect.bottom < line;
}

/**
 * The table block. A GFM pipe table drawn as a grid that sizes to its content
 * (Obsidian's model: Markdown holds no column width, so there is none to
 * store), capped at the column and scrolling sideways past it. Each cell is a
 * real field (TableCell). Addressed as a whole like the divider
 * (`isSelectableBlock`): Escape from a cell selects it, and so does a Backspace
 * or forward Delete arriving from a neighbour; selected, the band appears and
 * Backspace removes it, Enter opens a paragraph under it. The arrows walk the
 * grid: in from the paragraph above, cell to cell, out at the last row.
 *
 * The root registers itself in the block ref map so the gutter grip can lift
 * it; it must not share EditableBlock's `elRef`, whose repaint effect would
 * paint the block's empty `text` over the grid.
 *
 * The add-row and add-column bars are hairlines with a Plus at the grid's own
 * bottom and right edges, revealed in CSS while the table is hovered or a cell
 * has focus (`.table-outer:hover`, `:focus-within`), so a new table, whose
 * first cell is focused, shows both at once and a table at rest shows none.
 * Click adds one; drag adds several (useTableInteractions). The row and column
 * strips left of and above the grid stay invisible (click selects, hold to
 * drag); judged after this pass (2026-09-10).
 */
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
  isSelected,
  onSelect,
  onBlockNav,
  onDelete,
  registerRef,
}) {
  const { theme } = useTheme();
  const accent = accentColor || theme.ACCENT.primary;
  const cellRefs = useRef({});
  const tableRef = useRef(null);
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    registerRef?.(block.id, rootRef.current);
    return () => registerRef?.(block.id, null);
  }, [block.id, registerRef]);

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
  // The caret into a cell at an offset (`"end"` for its end), for the arrows.
  const caretInto = useCallback((rowIdx, colIdx, at) => {
    const cell = cellRefs.current[`${rowIdx}-${colIdx}`];
    if (!cell) return false;
    cell.focus();
    const len = caretLength(cell);
    placeCaret(cell, at === "end" ? len : Math.min(at, len));
    return true;
  }, []);
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

  // Escape from a cell: the whole table is selected, and the keys go to the
  // editor root (handleSelectedBlockKey), so the next Backspace removes the
  // table and not a character of the cell.
  const selectWhole = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    rootRef.current?.parentElement?.closest('[contenteditable="true"]')?.focus();
    onSelect?.();
  }, [onSelect]);

  const handleCellKeyDown = useCallback(
    (e, rowIdx, colIdx) => {
      const lastRow = rows.length - 1;
      const lastCol = colCount - 1;
      if (e.key === "Escape") {
        e.preventDefault();
        selectWhole();
      } else if (e.key === "Tab" && !e.shiftKey) {
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
        if (rowIdx < lastRow) {
          focusCell(rowIdx + 1, colIdx);
        } else {
          addRow();
          focusOnRender.current = { row: rows.length, col: colIdx };
        }
      } else if (!plainArrow(e)) {
        // A modified arrow is the browser's: Shift extends the selection,
        // Cmd/Ctrl and Alt jump by line and word inside the cell (END_OF_LINE
        // in a cell used to hop to the next cell before this guard).
      } else if (e.key === "ArrowUp" && caretOnLine(e.currentTarget, "top")) {
        // The arrows walk the grid, and leave it at its edges (2026-09-10).
        // Inside a cell they are the browser's own; only a caret on the
        // cell's first or last line, or at its first or last character, moves
        // between cells.
        e.preventDefault();
        if (rowIdx > 0) caretInto(rowIdx - 1, colIdx, getCaretOffset(e.currentTarget));
        else onBlockNav?.(blockIndex, "prev");
      } else if (e.key === "ArrowDown" && caretOnLine(e.currentTarget, "bottom")) {
        e.preventDefault();
        if (rowIdx < lastRow) caretInto(rowIdx + 1, colIdx, getCaretOffset(e.currentTarget));
        else onBlockNav?.(blockIndex, "next");
      } else if (e.key === "ArrowLeft" && collapsedAt(e.currentTarget, 0)) {
        e.preventDefault();
        if (colIdx > 0) caretInto(rowIdx, colIdx - 1, "end");
        else if (rowIdx > 0) caretInto(rowIdx - 1, lastCol, "end");
        else onBlockNav?.(blockIndex, "prev");
      } else if (e.key === "ArrowRight" && collapsedAt(e.currentTarget, "end")) {
        e.preventDefault();
        if (colIdx < lastCol) caretInto(rowIdx, colIdx + 1, 0);
        else if (rowIdx < lastRow) caretInto(rowIdx + 1, 0, 0);
        else onBlockNav?.(blockIndex, "next");
      }
    },
    [rows, colCount, addRow, focusCell, caretInto, selectWhole, onBlockNav, blockIndex],
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
      return { background: `${accent}20` };
    }
    return {};
  };

  /* ── Render ────────────────────────────────────────────── */

  const band = isSelected ? bandFill(accent, theme.name) : null;

  return (
    <div
      ref={rootRef}
      className="table-outer"
      data-block-id={block.id}
      data-block-type="table"
      data-selected={isSelected ? "true" : undefined}
      contentEditable="false"
      suppressContentEditableWarning
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        outline: "none",
        margin: "8px 0",
        // As wide as the grid, never wider than the column: the bars hug the
        // table's own edges, and a wide table scrolls inside the scroller.
        width: "fit-content",
        maxWidth: "100%",
        userSelect: "none",
      }}
    >
      {/* Left edge zone — the row strip, left of the grid */}
      <div
        className="table-left-zone"
        style={{
          position: "absolute",
          left: -EDGE_ZONE,
          top: 0,
          width: EDGE_ZONE,
          bottom: ADD_BAR,
          cursor: "grab",
          zIndex: Z.ELEMENT_OVERLAY,
        }}
        onPointerDown={handleLeftZonePointerDown}
      />

      {/* Top edge zone — the column strip, above the grid */}
      <div
        className="table-top-zone"
        style={{
          position: "absolute",
          left: -EDGE_ZONE,
          top: -EDGE_ZONE,
          right: 0,
          height: EDGE_ZONE,
          cursor: "grab",
          zIndex: Z.ELEMENT_OVERLAY,
        }}
        onPointerDown={handleTopZonePointerDown}
      />

      {/* The grid, with the add-column bar at its right edge */}
      <div style={{ position: "relative" }}>
        <div
          className="table-scroller"
          style={{
            overflowX: "auto",
            borderRadius: 8,
            border: `1px solid ${theme.BG.divider}`,
            // The selection band: the tint behind the cells, reaching past
            // the grid by the divider's reach.
            background: band || "transparent",
            boxShadow: band ? `0 0 0 ${BAND_REACH}px ${band}` : "none",
          }}
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
                        background: isColSelected(colIdx) ? `${accent}20` : "transparent",
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
                          background: `${accent}08`,
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
        </div>

        {/* Add-column bar — a hairline with a Plus down the grid's right edge */}
        <div
          className="table-add-bar table-right-zone"
          role="button"
          aria-label="Add column"
          style={{
            position: "absolute",
            left: "100%",
            top: 0,
            bottom: 0,
            width: ADD_BAR,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onPointerDown={handleRightZonePointerDown}
          onClick={handleRightZoneClick}
        >
          <span
            className="table-add-line"
            style={{ position: "absolute", left: "50%", top: 6, bottom: 6, width: 1 }}
          />
          <span className="table-add-plus">
            <PlusIcon size={14} />
          </span>
        </div>
      </div>

      {/* Add-row bar — a hairline with a Plus along the grid's bottom edge */}
      <div
        className="table-add-bar table-bottom-zone"
        role="button"
        aria-label="Add row"
        style={{
          position: "relative",
          height: ADD_BAR,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        onPointerDown={handleBottomZonePointerDown}
        onClick={handleBottomZoneClick}
      >
        <span
          className="table-add-line"
          style={{ position: "absolute", top: "50%", left: 6, right: 6, height: 1 }}
        />
        <span className="table-add-plus">
          <PlusIcon size={14} />
        </span>
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
            background: accent,
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
          onDeleteTable={onDelete}
          onDismiss={closeContextMenu}
        />
      )}
    </div>
  );
});

/** An arrow key with no modifier: the only kind that moves between cells. */
function plainArrow(e) {
  return e.key.startsWith("Arrow") && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/** Whether the selection is a collapsed caret at offset `at` (`"end"` for the cell's end) of `el`. */
function collapsedAt(el, at) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
  const offset = getCaretOffset(el);
  if (offset < 0) return false;
  return at === "end" ? offset >= caretLength(el) : offset === at;
}
