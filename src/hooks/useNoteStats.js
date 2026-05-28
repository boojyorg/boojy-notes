import { useDeferredValue, useMemo } from "react";
import { stripMarkdownFormatting } from "../utils/inlineFormatting";

const EMPTY_STATS = { wordCount: 0, charCount: 0, charCountNoSpaces: 0, readingTime: 1 };

/**
 * Word / character counts and reading-time estimate for a note's blocks.
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
    return {
      wordCount: wc,
      charCount: plainText.length,
      charCountNoSpaces: plainText.replace(/\s/g, "").length,
      readingTime: Math.max(1, Math.ceil(wc / 200)),
    };
  }, [deferredBlocks]);
}
