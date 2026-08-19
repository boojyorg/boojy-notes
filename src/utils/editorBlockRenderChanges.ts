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
}

/**
 * Detect block properties that React must paint itself. Plain text is omitted
 * because the uncontrolled contentEditable DOM already owns it while typing.
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

    if (
      previousBlock.type === "code" &&
      (previousBlock.text !== nextBlock.text || previousBlock.lang !== nextBlock.lang)
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
