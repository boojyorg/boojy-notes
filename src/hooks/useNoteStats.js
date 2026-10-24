import { useDeferredValue, useMemo } from "react";
import { stripMarkdownFormatting } from "../utils/inlineFormatting";

const EMPTY_STATS = { wordCount: 0 };

/**
 * The word count of a note's blocks (the ··· menu shows it).
 * Defers off the latest blocks so heavy typing stays responsive.
 */
export function useNoteStats(noteBlocks) {
  const deferredBlocks = useDeferredValue(noteBlocks);
  return useMemo(() => {
    if (!deferredBlocks) return EMPTY_STATS;
    const plainText = deferredBlocks
      .filter((b) => b.text)
      .map((b) => stripMarkdownFormatting(b.text))
      .join(" ");
    const wc = plainText.trim() ? plainText.trim().split(/\s+/).filter(Boolean).length : 0;
    return { wordCount: wc };
  }, [deferredBlocks]);
}
