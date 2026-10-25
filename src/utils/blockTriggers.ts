import type { BlockType } from "../types/notes";

/**
 * What a typed marker opens, and what its argument says.
 *
 * **Every marker waits for a space**: `# `, `- `, `> `, `[] `,
 * ` ``` `, `--- `, `||| `, `$$ `. One rule with no exceptions, and the reason it
 * matters rather than just reads well: three of these carry an argument, and a
 * marker that fires on its last character can never be given one, nor be
 * typed literally. **Enter does what the space does**, for the
 * same markers — otherwise Enter on a bare `---` leaves a paragraph that every
 * Markdown reader turns back into a divider on the next open, which is the
 * worst of both.
 *
 * The argument is read from the marker itself: the fence's info string is its
 * language, and a table's pipes are the row you are drawing (a row of N cells
 * is written with N+1 pipes, which is why `|||` has always meant two columns).
 * A divider has no argument — the dash count is only CommonMark's "three or
 * more", so `-----` opens the same divider `---` does.
 */

/** The space that ends a marker; Chromium holds a typed trailing one as U+00A0. */
const SP = "[ \\u00a0]";
/** A line kind's marker ends in any space (a soft break after `#` opens the heading too). */
const S = "[\\s\\u00a0]";

/** `` ```js `` typed with its space: the space is the trigger, never a tab or a newline. */
export const TYPED_FENCE_RE = new RegExp(`^\`\`\`(\\S*)${SP}$`);
/** `` ```js `` on its own, for the Enter that opens it. */
export const BARE_FENCE_RE = /^```(\S*)$/;
/** `--- `, and any longer run: CommonMark's thematic break is three dashes or more. */
export const TYPED_DIVIDER_RE = new RegExp(`^-{3,}${SP}$`);
/** `---` on its own, for Enter. */
export const BARE_DIVIDER_RE = /^-{3,}$/;
/** `||| `: three pipes or more, the row whose cells the table will have. */
export const TYPED_TABLE_RE = new RegExp(`^(\\|{3,})${SP}$`);
/** `|||` on its own, for Enter. */
export const BARE_TABLE_RE = /^(\|{3,})$/;

/** `$$ `: a display formula, its source opened. */
export const TYPED_MATH_RE = new RegExp(`^\\$\\$${SP}$`);

/** Whether a bare `$$` is under the caret, for the Enter that opens a formula. */
export function isBareMath(text: string): boolean {
  return text === "$$";
}

/** The widest table a typed run of pipes may ask for; the column is too narrow past it. */
export const MAX_TYPED_COLUMNS = 8;

/** The info string of a fence typed with its space, or null when `text` is not one. */
export function typedFenceLang(text: string): string | null {
  return TYPED_FENCE_RE.exec(text)?.[1]?.trim() ?? null;
}

/** The info string of a bare fence, or null: the Enter form of the above. */
export function bareFenceLang(text: string): string | null {
  return BARE_FENCE_RE.exec(text)?.[1]?.trim() ?? null;
}

/** Whether a bare `---` is under the caret, for the Enter that opens the divider. */
export function isBareDivider(text: string): boolean {
  return BARE_DIVIDER_RE.test(text);
}

/**
 * The number of columns a run of pipes asks for, or null when `text` is not
 * one: the cells of the row those pipes draw, clamped to what the column can
 * show. `|||` is two, as it has always been.
 */
export function typedTableColumns(text: string): number | null {
  return columnsFrom(TYPED_TABLE_RE.exec(text)?.[1]);
}

/** The Enter form of `typedTableColumns`. */
export function bareTableColumns(text: string): number | null {
  return columnsFrom(BARE_TABLE_RE.exec(text)?.[1]);
}

function columnsFrom(pipes: string | undefined): number | null {
  if (!pipes) return null;
  return Math.min(pipes.length - 1, MAX_TYPED_COLUMNS);
}

/** A line kind's marker: `#`…`######`, `-` or `*`, `1.`, `[]` or `[ ]`, `>`. */
const LINE_MARKER = `(#{1,6}|[-*]|1\\.|\\[${S}?\\]|>)`;
/** A line kind's marker typed with its space on an empty line. */
const TYPED_LINE_MARKER_RE = new RegExp(`^${LINE_MARKER}${S}$`);
/**
 * A line kind's marker typed at the start of a paragraph that already has
 * text: `- ` before `Full stack or frontend?` makes that line the bullet, as
 * it does on an empty line, rather than staying text written as `\- `. Only
 * the kinds a line can be; a fence, a divider or a table makes a block of its
 * own and still wants an empty line. Cmd+Z straight after brings the literal
 * marker back, for the rare line that starts with one.
 */
export const LINE_MARKER_ON_TEXT_RE = new RegExp(`^${LINE_MARKER}${S}(?=\\S)`);

/** `![] `: an image, through the menu's own picker. */
export const TYPED_IMAGE_RE = new RegExp(`^!\\[\\]${S}$`);

/** The kind a line marker makes. */
export function lineKind(marker: string): BlockType {
  if (marker.startsWith("#")) return `h${marker.length}` as BlockType;
  if (marker === "-" || marker === "*") return "bullet";
  if (marker === "1.") return "numbered";
  if (marker === ">") return "blockquote";
  return "checkbox";
}

/**
 * The block an empty line's typed marker opens, or null: a line kind, or a
 * divider, fence or formula. A table and an image go through the menu's
 * commands instead (`TYPED_TABLE_RE`, `TYPED_IMAGE_RE`).
 */
export function typedBlockType(text: string): BlockType | null {
  const line = TYPED_LINE_MARKER_RE.exec(text);
  if (line) return lineKind(line[1]);
  if (TYPED_DIVIDER_RE.test(text)) return "spacer";
  if (TYPED_FENCE_RE.test(text)) return "code";
  if (TYPED_MATH_RE.test(text)) return "math";
  return null;
}
