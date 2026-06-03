import { useCallback, useMemo, useRef } from "react";
import { buildBacklinkIndex, getBacklinksForNote } from "../utils/backlinkIndex";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";

/**
 * Wikilink + backlink wiring for the editor:
 *   - the note-title set used to detect broken `[[links]]`,
 *   - the backlink index + the current note's backlinks,
 *   - click / Cmd-click navigation, and autocomplete insertion.
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
  activeNote,
  note,
  textOnlyEdit,
  openNote,
  createNote,
  splitState,
  getOtherPaneId,
  openNoteInPane,
  splitPaneWithNote,
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

  // Backlink index
  const backlinkIndex = useMemo(
    () => buildBacklinkIndex(noteDataRef.current),
    [noteTitlesKey, activeNote], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const noteTitle = note?.title;
  const currentBacklinks = useMemo(
    () => (noteTitle ? getBacklinksForNote(backlinkIndex, noteTitle) : []),
    [backlinkIndex, noteTitle],
  );

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

  const handleWikilinkCmdClick = useCallback(
    (targetTitle) => {
      const lc = targetTitle.trim().toLowerCase();
      const found = Object.entries(noteDataRef.current).find(
        ([, n]) => (n.title || "").toLowerCase() === lc,
      );
      const noteId = found ? found[0] : null;
      if (!noteId) {
        createNote(null, targetTitle);
        return;
      }
      if (splitState.splitMode) {
        const otherPaneId = getOtherPaneId();
        if (otherPaneId) openNoteInPane(noteId, otherPaneId);
      } else {
        splitPaneWithNote("vertical", noteId);
      }
    },
    [
      splitState.splitMode,
      getOtherPaneId,
      openNoteInPane,
      splitPaneWithNote,
      createNote,
      noteDataRef,
    ],
  );

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
        // Update state for persistence/sync.
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
        // uses for markdown conversions) and drop the caret at the end.
        const el = blockRefs.current[blocks[blockIndex].id];
        if (el) {
          el.innerHTML = inlineMarkdownToHtml(newText, noteTitleSet);
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
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
    backlinkIndex,
    currentBacklinks,
    handleWikilinkClick,
    handleWikilinkCmdClick,
    handleWikilinkSelect,
  };
}
