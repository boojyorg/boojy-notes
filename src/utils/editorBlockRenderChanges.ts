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
  src?: string;
  alt?: string;
  width?: number;
  filename?: string;
  size?: number | null;
  target?: string;
  heading?: string | null;
}

/**
 * Detect block properties that React must paint itself. Text is omitted
 * because the field it is typed into already holds it: a paragraph's
 * contentEditable, and equally a code block's textarea, which paints its
 * own highlight overlay as it is typed into. What React paints is the
 * structure around a field: a table's rows, a code block's language, a
 * callout's type and the title that follows a type change.
 *
 * A media block has no field of its own, so React paints all of it: a resized
 * image's width, a replaced image's src. Left out, the commit reached state and
 * the file while the block kept the props it had, and the *next* resize read
 * its start size from those — the image jumped back to the size before the
 * first drag (2026-09-19). Replace image changed nothing on screen at all.
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
      previousBlock.type === "image" &&
      (previousBlock.src !== nextBlock.src ||
        previousBlock.alt !== nextBlock.alt ||
        previousBlock.width !== nextBlock.width)
    ) {
      return true;
    }

    if (
      previousBlock.type === "file" &&
      (previousBlock.src !== nextBlock.src ||
        previousBlock.filename !== nextBlock.filename ||
        previousBlock.size !== nextBlock.size)
    ) {
      return true;
    }

    if (
      previousBlock.type === "embed" &&
      (previousBlock.target !== nextBlock.target || previousBlock.heading !== nextBlock.heading)
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
