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
