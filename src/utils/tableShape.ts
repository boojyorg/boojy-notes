/**
 * A table's rows are ragged on disk and stay ragged in memory: a row holds
 * exactly the cells its Markdown line holds, one more or one fewer than the
 * header included. The grid the user sees is the widest row wide; a cell a
 * row does not have is drawn empty, and a row only gains cells when one of
 * them is actually written. Reading a file never rectangularises it.
 */

/** The number of columns to draw: the widest row's cell count. */
export function tableColumnCount(rows: string[][]): number {
  let width = 0;
  for (const row of rows) if (row.length > width) width = row.length;
  return width;
}

/** The cell at a column, or the empty string for a column the row does not reach. */
export function cellAt(row: string[] | undefined, col: number): string {
  return row?.[col] ?? "";
}

/**
 * A copy of `rows` with one cell written. A row shorter than the column is
 * padded with empty cells up to it, so no hole is ever left for the
 * serializer to trip on; every other row is left exactly as it was.
 */
export function withCell(rows: string[][], rowIdx: number, col: number, value: string): string[][] {
  return rows.map((row, r) => {
    if (r !== rowIdx) return row;
    const next = [...row];
    while (next.length <= col) next.push("");
    next[col] = value;
    return next;
  });
}

/**
 * A copy of `row` with the cell at `from` moved to `to`, the way a column
 * drag reorders every row. A row that does not reach both positions is
 * padded for the move and then trimmed back to its own length, so a short
 * row moves what it has and grows only when a real cell lands past its end.
 */
export function moveCell(row: string[], from: number, to: number): string[] {
  const needed = Math.max(from, to) + 1;
  const next = [...row];
  while (next.length < needed) next.push("");
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  while (next.length > row.length && next[next.length - 1] === "") next.pop();
  return next;
}

/**
 * A copy of `rows` with one empty column inserted at a visual column, the way
 * the table's own controls add one. An explicit column operation may pad a
 * row: a row shorter than `at` is padded up to it first, so the new cell
 * lands in the column the user asked for in every row, wide rows and short
 * rows alike. Nothing here runs on a passive open or save; those keep every
 * row's width exactly. The header cell is empty too (2026-09-10): the `Col N`
 * label it used to carry reached the file as text the user never typed, and
 * Obsidian and Notion add an empty column.
 */
export function withColumnInserted(rows: string[][], at: number): string[][] {
  return rows.map((row) => {
    const next = [...row];
    while (next.length < at) next.push("");
    next.splice(at, 0, "");
    return next;
  });
}

/** A copy of `arr` with the item at `from` moved to index `to`. */
function moved<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * A copy of `rows` with row `from` moved to index `to`, the header (row 0)
 * included: a row that lands first is the header, as Markdown reads it.
 */
export function withRowMoved(rows: string[][], from: number, to: number): string[][] {
  return moved(rows, from, to);
}

/** A column moved in every row (`moveCell`) and in the alignments. */
export function withColumnMoved(
  rows: string[][],
  alignments: string[],
  from: number,
  to: number,
): { rows: string[][]; alignments: string[] } {
  const aligns = [...alignments];
  while (aligns.length <= Math.max(from, to)) aligns.push("left");
  return { rows: rows.map((row) => moveCell(row, from, to)), alignments: moved(aligns, from, to) };
}

/** A copy of the row at `at`, inserted under it. */
export function withRowDuplicated(rows: string[][], at: number): string[][] {
  const next = [...rows];
  next.splice(at + 1, 0, [...rows[at]]);
  return next;
}

/**
 * A copy of the column at `at`, inserted to its right with its alignment. A
 * row that does not reach the column has nothing to copy and nothing after
 * it to shift, so it stays as short as it is.
 */
export function withColumnDuplicated(
  rows: string[][],
  alignments: string[],
  at: number,
): { rows: string[][]; alignments: string[] } {
  const aligns = [...alignments];
  while (aligns.length <= at) aligns.push("left");
  aligns.splice(at + 1, 0, aligns[at]);
  return {
    rows: rows.map((row) => {
      if (row.length <= at) return row;
      const next = [...row];
      next.splice(at + 1, 0, row[at]);
      return next;
    }),
    alignments: aligns,
  };
}

/** The row at `at` emptied, keeping its cell count. */
export function withRowCleared(rows: string[][], at: number): string[][] {
  return rows.map((row, r) => (r === at ? row.map(() => "") : row));
}

/** The column at `at` emptied in every row that reaches it. */
export function withColumnCleared(rows: string[][], at: number): string[][] {
  return rows.map((row) => (row.length > at ? row.map((cell, c) => (c === at ? "" : cell)) : row));
}

/**
 * Where a row or column carried by its grip would land: the index it would
 * take. `spans` are the rows' (or columns') [start, end] along the drag axis,
 * `from` the one being carried, `start`/`end` the carried copy's own edges
 * now. It passes a neighbour once its leading edge crosses that neighbour's
 * middle, so one place is half a row of travel, not the pointer's full row.
 */
export function dropIndex(
  spans: [number, number][],
  from: number,
  start: number,
  end: number,
): number {
  const mid = (k: number) => (spans[k][0] + spans[k][1]) / 2;
  let to = from;
  while (to + 1 < spans.length && end > mid(to + 1)) to++;
  if (to !== from) return to;
  while (to - 1 >= 0 && start < mid(to - 1)) to--;
  return to;
}
