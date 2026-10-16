/** The phone's bar above the keyboard (PhoneKeyBar): its rules, kept pure. */

export type BarMode = "blocks" | "format" | "heading";

/**
 * Which row a change of selection leaves showing. A selection opens the text
 * styles; when it collapses they give way again, unless Aa opened them
 * (`held`), so B can be turned on before typing. The heading row is left to
 * its own ‹ and choices.
 */
export function barModeAfterSelection(mode: BarMode, ranged: boolean, held: boolean): BarMode {
  if (ranged) return "format";
  if (mode === "format" && !held) return "blocks";
  return mode;
}

/** A list or task button on a block already of that kind turns it back into text. */
export function kindCommand(
  kind: "bullet" | "numbered" | "checkbox" | string,
  current: string | null,
) {
  const command = kind === "checkbox" ? "todo" : kind;
  return current === kind ? "body" : command;
}

/** A heading level, or text again when the line already has that level. */
export function headingCommand(level: number, current: string | null) {
  return current === `h${level}` ? "body" : `h${level}`;
}

/**
 * Bold or italic turned on (or off) with nothing selected changes no text:
 * it is a promise about the next letters, kept only while the caret stays
 * where it was made. The browser's own answer outlives a caret moved by a
 * tap, so the bar keeps the promise itself.
 */
export interface Pending {
  node: Node | null;
  offset: number;
  on: Record<string, boolean>;
}

export interface Caret {
  node: Node | null;
  offset: number;
  collapsed: boolean;
}

const sameSpot = (p: Pending, c: Caret) =>
  c.collapsed && c.node === p.node && c.offset === p.offset;

/** The styles to light: those around the caret, as a promise still in force overrides them. */
export function litFormats(
  around: Set<string>,
  pending: Pending | null,
  caret: Caret,
): { formats: Set<string>; pending: Pending | null } {
  if (!pending || !sameSpot(pending, caret)) return { formats: around, pending: null };
  const formats = new Set(around);
  for (const [format, on] of Object.entries(pending.on)) {
    if (on) formats.add(format);
    else formats.delete(format);
  }
  return { formats, pending };
}

/** The promise after a style is pressed with nothing selected at `caret`. */
export function promise(
  pending: Pending | null,
  caret: Caret,
  format: string,
  on: boolean,
): Pending {
  const kept = pending && sameSpot(pending, caret) ? pending.on : {};
  return { node: caret.node, offset: caret.offset, on: { ...kept, [format]: on } };
}
