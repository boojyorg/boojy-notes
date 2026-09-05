import { useCallback, useMemo, useRef } from "react";
import { placeCaret } from "../utils/domHelpers";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";

/**
 * Wikilink wiring for the editor:
 *   - the note-title set used to detect broken `[[links]]`,
 *   - click / Cmd-click navigation, and autocomplete insertion.
 * (The backlink index and the panel under the note were removed 2026-09-05.)
 *
 * Extracted from BoojyNotes. Two subtleties are preserved verbatim:
 *   1. `noteTitlesKey` short-circuits on `textOnlyEdit` so plain typing doesn't
 *      rebuild the title set every keystroke.
 *   2. `handleWikilinkSelect` writes the rendered HTML to the block DOM directly
 *      because it fires from WikilinkMenu's *native* keydown listener, where React
 *      won't re-render the text-optimised editor (so the syncGen resync never runs).
 */
export function useWikilinkHandlers({
  noteData,
  noteDataRef,
  textOnlyEdit,
  openNote,
  createNote,
  wikilinkMenuRef,
  setWikilinkMenu,
  syncGeneration,
  commitNoteData,
  blockRefs,
  focusBlockId,
  focusCursorPos,
}) {
  // Note title set for broken wikilink detection
  const lastTitlesKey = useRef("");
  const noteTitlesKey = useMemo(() => {
    if (textOnlyEdit.current) {
      textOnlyEdit.current = false;
      return lastTitlesKey.current;
    }
    const key = Object.values(noteData)
      .map((n) => (n.title || "").trim().toLowerCase())
      .filter(Boolean)
      .sort()
      .join("\0");
    lastTitlesKey.current = key;
    return key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteData]);
  const noteTitleSet = useMemo(() => new Set(noteTitlesKey.split("\0")), [noteTitlesKey]);

  // Wikilink click handler
  const handleWikilinkClick = useCallback(
    (targetTitle) => {
      const lc = targetTitle.trim().toLowerCase();
      const found = Object.entries(noteDataRef.current).find(
        ([, n]) => (n.title || "").toLowerCase() === lc,
      );
      if (found) {
        openNote(found[0]);
      } else {
        createNote(null, targetTitle);
      }
    },
    [openNote, createNote, noteDataRef],
  );

  // Cmd-click used to open the target in a split pane; with the single-active-note
  // model it behaves exactly like a plain click.
  const handleWikilinkCmdClick = handleWikilinkClick;

  // Wikilink autocomplete select handler
  const handleWikilinkSelect = useCallback(
    (title) => {
      const menu = wikilinkMenuRef.current;
      if (!menu) return;
      const { noteId, blockIndex } = menu;
      const blocks = noteDataRef.current[noteId]?.content?.blocks;
      if (!blocks || !blocks[blockIndex]) return;
      const oldText = blocks[blockIndex].text || "";
      const match = oldText.match(/\[\[([^\]]*)$/);
      if (match) {
        const newText = oldText.slice(0, match.index) + `[[${title}]]`;
        // Update state for persistence.
        syncGeneration.current++;
        commitNoteData((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const b = [...n.content.blocks];
          b[blockIndex] = { ...b[blockIndex], text: newText };
          n.content = { ...n.content, blocks: b };
          next[noteId] = n;
          return next;
        });
        // This handler fires from WikilinkMenu's *native* keydown listener, where
        // React won't re-render the (text-optimised) editor — so the syncGen
        // DOM-resync effect never runs and the link would stay invisible. Write
        // the rendered HTML to the block directly (same approach useInputHandler
        // uses for markdown conversions) and put the caret after the link —
        // through placeCaret, which anchors it *outside* the link so the next
        // keystroke is prose, not part of the alias. The queued focus below
        // re-places it the same way after the re-render repaints the block.
        const el = blockRefs.current[blocks[blockIndex].id];
        if (el) {
          el.innerHTML = inlineMarkdownToHtml(newText, noteTitleSet);
          placeCaret(el, el.textContent.length);
        }
        focusBlockId.current = blocks[blockIndex].id;
        focusCursorPos.current = newText.length;
      }
      setWikilinkMenu(null);
    },
    [
      commitNoteData,
      syncGeneration,
      noteDataRef,
      focusBlockId,
      focusCursorPos,
      setWikilinkMenu,
      wikilinkMenuRef,
      blockRefs,
      noteTitleSet,
    ],
  );

  return {
    noteTitleSet,
    handleWikilinkClick,
    handleWikilinkCmdClick,
    handleWikilinkSelect,
  };
}
