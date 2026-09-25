// What a key does in a menu, the one rule every menu shares: arrows move and
// wrap, skipping disabled rows; Home and End go to the ends; Enter (and Space,
// where Space isn't typing) chooses; Escape closes; a letter jumps to the next
// row that starts with it. The menus differ only in where they listen.

/** The next row from `from` by `step` (±1), wrapping, past disabled rows.
 *  From no row (-1), down is the first and up the last. -1 when none can act. */
export function stepIndex(from: number, step: 1 | -1, count: number, disabled?: boolean[]): number {
  if (count <= 0) return -1;
  let at = from < 0 ? (step === 1 ? -1 : count) : from;
  for (let i = 0; i < count; i++) {
    at = (at + step + count) % count;
    if (!disabled?.[at]) return at;
  }
  return -1;
}

/** The first (or last) row that can act. */
export function endIndex(which: "first" | "last", count: number, disabled?: boolean[]): number {
  return stepIndex(-1, which === "first" ? 1 : -1, count, disabled);
}

/**
 * The row a type-ahead buffer names: the first label starting with it, or,
 * for a repeated single letter, the next label starting with that letter
 * (pressing `s` twice walks SQL → …, as a native menu does).
 */
export function typeAheadIndex(labels: string[], buffer: string, from: number): number {
  const query = buffer.toLowerCase();
  const repeated = buffer.length > 1 && [...buffer].every((c) => c === buffer[0]);
  const needle = repeated ? buffer[0].toLowerCase() : query;
  const start = repeated || buffer.length === 1 ? from + 1 : 0;
  for (let i = 0; i < labels.length; i++) {
    const at = (start + i + labels.length) % labels.length;
    if (labels[at].toLowerCase().startsWith(needle)) return at;
  }
  return -1;
}
