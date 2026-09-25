/**
 * Tables written with their pipes lined up, the way Obsidian's Advanced
 * Tables and most Markdown tools write them:
 *
 *     | Script  | Description          |
 *     | :-----: | -------------------- |
 *     | `build` | Production build     |
 *
 * Columns are measured in the columns a monospace font gives the text, so
 * Chinese, Japanese and Korean characters and emoji count two.
 */

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function graphemes(s: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(s), (g) => g.segment);
  return Array.from(s);
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** Whether a code point is one an East Asian or emoji font draws two columns wide. */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** The columns one grapheme takes in a monospace font: 0, 1 or 2. */
function graphemeWidth(g: string): number {
  const cp = g.codePointAt(0) ?? 0;
  if (cp === 0x200b || cp === 0x200d || (cp >= 0x300 && cp <= 0x36f)) return 0;
  if (isWide(cp)) return 2;
  // An emoji drawn as a picture: a pictograph asked for as one (U+FE0F) or a
  // sequence of them.
  if (PICTOGRAPHIC.test(g) && (g.includes("️") || g.length > 2 || cp >= 0x1f000)) return 2;
  return 1;
}

/** The columns a string takes in a monospace font. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const g of graphemes(s)) w += graphemeWidth(g);
  return w;
}

/**
 * The display columns of a row line's cell pipes, escaped pipes (`\|`) left
 * out, as the row reader splits it; null for a line that does not start and
 * end with a pipe.
 */
export function pipeColumns(line: string): number[] | null {
  if (!line.startsWith("|") || !line.endsWith("|")) return null;
  const out: number[] = [];
  const gs = graphemes(line);
  let col = 0;
  for (let i = 0; i < gs.length; i++) {
    const g = gs[i];
    if (g === "\\" && i + 1 < gs.length) {
      col += graphemeWidth(g) + graphemeWidth(gs[i + 1]);
      i++;
      continue;
    }
    if (g === "|") out.push(col);
    col += graphemeWidth(g);
  }
  return out;
}

/**
 * Whether a table's lines (header, separator, rows) have their pipes lined
 * up: every line's pipes at the same columns, two cells or more.
 */
export function isAligned(lines: string[]): boolean {
  const first = pipeColumns(lines[0] ?? "");
  if (!first || first.length < 3) return false;
  return lines.every((line) => {
    const cols = pipeColumns(line);
    return !!cols && cols.length === first.length && cols.every((c, i) => c === first[i]);
  });
}

/** How an aligned table's separator is spelled: `| --- |` or `|-----|`, and which columns wrote `:---`. */
export interface SeparatorStyle {
  spaced: boolean;
  explicitLeft: boolean[];
}

/** The style of a separator line as written. */
export function separatorStyle(separator: string, cells: string[]): SeparatorStyle {
  return {
    spaced: /^\|\s/.test(separator),
    explicitLeft: cells.map((c) => {
      const t = c.trim();
      return t.startsWith(":") && !t.endsWith(":");
    }),
  };
}

/** The content width of each column of an aligned table, from its header line. */
export function columnWidths(header: string): number[] {
  const cols = pipeColumns(header) ?? [];
  const out: number[] = [];
  for (let i = 0; i + 1 < cols.length; i++) out.push(Math.max(0, cols[i + 1] - cols[i] - 3));
  return out;
}

/** A cell padded to its column's width, placed as its column is aligned. */
function pad(cell: string, width: number, align: string | undefined): string {
  const room = Math.max(0, width - displayWidth(cell));
  if (align === "right") return " ".repeat(room) + cell;
  if (align === "center") {
    const before = Math.floor(room / 2);
    return " ".repeat(before) + cell + " ".repeat(room - before);
  }
  return cell + " ".repeat(room);
}

/**
 * The widths a table needs: each column as wide as its widest cell, never
 * narrower than `floor` (the widths it is written at, so an edit never
 * narrows a column by itself); a column with no floor is at least its
 * shortest separator: `---`, `---:`, `:---:`.
 */
export function neededWidths(
  rows: string[][],
  floor: number[] = [],
  aligns: string[] = [],
): number[] {
  const width = Math.max(floor.length, ...rows.map((r) => r.length));
  const out: number[] = [];
  for (let c = 0; c < width; c++) {
    // A column as written keeps its width; only one the app sizes afresh
    // takes the shortest separator's.
    const least = aligns[c] === "center" ? 5 : aligns[c] === "right" ? 4 : 3;
    let w = floor[c] ?? least;
    for (const row of rows) if (c < row.length) w = Math.max(w, displayWidth(row[c]));
    out.push(w);
  }
  return out;
}

/** One row line, its cells (already escaped) padded to the widths. A short row stays short. */
export function alignedRow(cells: string[], widths: number[], aligns: string[]): string {
  const row = cells.length > 0 ? cells : [""];
  return `| ${row.map((c, i) => pad(c, widths[i] ?? 3, aligns[i])).join(" | ")} |`;
}

/** The separator line for the widths, in the table's own style. */
export function alignedSeparator(
  widths: number[],
  aligns: string[],
  style: SeparatorStyle = { spaced: true, explicitLeft: [] },
): string {
  const cells = widths.map((w, i) => {
    const inner = style.spaced ? w : w + 2;
    const a = aligns[i];
    if (a === "center") return `:${"-".repeat(inner - 2)}:`;
    if (a === "right") return `${"-".repeat(inner - 1)}:`;
    if (style.explicitLeft[i]) return `:${"-".repeat(inner - 1)}`;
    return "-".repeat(inner);
  });
  return style.spaced ? `| ${cells.join(" | ")} |` : `|${cells.join("|")}|`;
}
