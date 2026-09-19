// @ts-check

/**
 * What a typed marker opens, and what its argument says.
 *
 * **Every marker waits for a space** (2026-09-19): `# `, `- `, `> `, `[] `,
 * ` ``` `, `--- `, `||| `. One rule with no exceptions, and the reason it
 * matters rather than just reads well: three of these carry an argument, and a
 * marker that fires on its last character can never be given one. ` ```js `
 * put the language in the body, `||||` could not ask for a third column, and
 * neither could be typed literally. **Enter does what the space does**, for the
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
