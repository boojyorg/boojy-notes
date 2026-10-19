/** The phone's bar above the keyboard (PhoneKeyBar): its rules, kept pure. */

import { hasOwnField } from "../utils/domHelpers";

export type BarMode = "blocks" | "format" | "heading" | "list" | "more";

const LIST_KINDS = new Set(["bullet", "numbered", "checkbox"]);

/** Whether a block of this kind is a list item, whose row the bar shows by itself. */
export const isListKind = (kind: string | null) => LIST_KINDS.has(kind ?? "");

/**
 * Which row a change of selection leaves open. A selection opens the text
 * styles; when it collapses they give way again, unless Aa opened them
 * (`held`), so B can be turned on before typing. The heading row is left to
 * its own ✕ and choices, and so is the list row opened by hand until the
 * caret is in a list, where it is the list's own row (`shownRow`).
 */
export function barModeAfterSelection(
  mode: BarMode,
  ranged: boolean,
  held: boolean,
  inList: boolean,
): BarMode {
  if (ranged) return "format";
  if (mode === "format" && !held) return "blocks";
  if (mode === "list" && inList) return "blocks";
  return mode;
}

/**
 * The row on screen: the one opened, else the list's while the caret is in a
 * list item, unless its ✕ put it away (`dismissed`) until the caret leaves.
 */
export function shownRow(mode: BarMode, inList: boolean, dismissed: boolean): BarMode {
  if (mode !== "blocks") return mode;
  return inList && !dismissed ? "list" : "blocks";
}

/** What the bar's buttons can act on where the caret is (`barReach`). */
export interface Reach {
  /** Heading, list, task and quote: turning the line into another kind. */
  kinds: boolean;
  /** Bold, italic and the other text styles. */
  styles: boolean;
  link: boolean;
}

/**
 * A block with its own field (a table cell, a callout, a code block) keeps its
 * kind, so the kind buttons grey there. Text styles act only in a field that
 * owns its formatting (`data-inline-field`: a cell, a callout's body), and a
 * link in none, as on the desktop's selection toolbar. Greyed, not hidden, so
 * no button moves.
 */
export function barReach(kind: string | null, inlineField: boolean): Reach {
  const field = hasOwnField({ type: kind });
  return { kinds: !field, styles: !field || inlineField, link: !field };
}

/** The menu bar's command for a block kind, where its name is not the kind's. */
const KIND_COMMANDS: Record<string, string> = { checkbox: "todo", blockquote: "quote" };

/** A list, task or quote button on a block already of that kind turns it back into text. */
export function kindCommand(kind: string, current: string | null) {
  return current === kind ? "body" : (KIND_COMMANDS[kind] ?? kind);
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

/** How much shorter than its tallest the window must be for the keyboard to be up. */
export const KEYBOARD_MIN = 150;

/**
 * Whether the keyboard is up: the window is well below the tallest it has
 * been at this width. Android shrinks the window for the keyboard and keeps
 * its width; turning the phone changes the width, so each orientation keeps
 * its own tallest and a landscape window is never taken for a keyboard.
 */
export function keyboardUp(tallest: Map<number, number>, width: number, height: number): boolean {
  const most = Math.max(tallest.get(width) ?? 0, height);
  tallest.set(width, most);
  return height < most - KEYBOARD_MIN;
}
