import { useCallback, useEffect } from "react";

/**
 * Search-result navigation: clears any multi-selection when a search begins,
 * and scrolls to + briefly highlights the matched block when a result is opened.
 *
 * Extracted from BoojyNotes to keep the root component focused on wiring.
 */
export function useSearchNavigation({
  search,
  clearSelectionRef,
  blockRefs,
  accentColor,
  openNote,
}) {
  // Wire search → clear multi-select
  useEffect(() => {
    if (search && clearSelectionRef.current) clearSelectionRef.current();
  }, [search, clearSelectionRef]);

  const scrollToSearchMatch = useCallback(
    (noteId, matchBlockId) => {
      if (!matchBlockId) return;
      setTimeout(() => {
        const el = blockRefs.current[matchBlockId];
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.style.background = `${accentColor}18`;
        el.style.borderRadius = "6px";
        el.style.transition = "background 0s";
        setTimeout(() => {
          el.style.transition = "background 0.5s ease-out";
          el.style.background = "transparent";
        }, 1200);
        setTimeout(() => {
          el.style.borderRadius = "";
          el.style.transition = "";
        }, 1700);
      }, 150);
    },
    [accentColor, blockRefs],
  );

  const handleSearchResultOpen = useCallback(
    (noteId, matchBlockId) => {
      openNote(noteId);
      if (matchBlockId) scrollToSearchMatch(noteId, matchBlockId);
    },
    [openNote, scrollToSearchMatch],
  );

  return { scrollToSearchMatch, handleSearchResultOpen };
}
