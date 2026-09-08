import type { Block } from "../types/notes";

interface EditorRenderBlock {
  id: string;
  type: Block["type"];
  indent?: number;
  checked?: boolean;
  text?: string;
  lang?: string;
  rows?: string[][];
  alignments?: string[];
  calloutType?: string;
  title?: string;
}

/**
 * Detect block properties that React must paint itself. Text is omitted
 * because the field it is typed into already holds it: a paragraph's
 * contentEditable, and equally a code block's textarea, which paints its
 * own highlight overlay as it is typed into. What React paints is the
 * structure around a field: a table's rows, a code block's language, a
 * callout's type and the title that follows a type change.
 */
export function haveEditorBlockRenderChanges(
  previous: readonly EditorRenderBlock[] | undefined,
  next: readonly EditorRenderBlock[] | undefined,
): boolean {
  if (previous === next) return false;
  if (!previous || !next || previous.length !== next.length) return true;

  for (let i = 0; i < previous.length; i++) {
    const previousBlock = previous[i];
    const nextBlock = next[i];

    if (
      previousBlock.id !== nextBlock.id ||
      previousBlock.type !== nextBlock.type ||
      previousBlock.indent !== nextBlock.indent ||
      previousBlock.checked !== nextBlock.checked
    ) {
      return true;
    }

    if (previousBlock.type === "code" && previousBlock.lang !== nextBlock.lang) {
      return true;
    }

    if (
      previousBlock.type === "callout" &&
      (previousBlock.calloutType !== nextBlock.calloutType ||
        previousBlock.title !== nextBlock.title)
    ) {
      return true;
    }

    if (
      previousBlock.type === "table" &&
      (previousBlock.rows !== nextBlock.rows || previousBlock.alignments !== nextBlock.alignments)
    ) {
      return true;
    }
  }

  return false;
}
