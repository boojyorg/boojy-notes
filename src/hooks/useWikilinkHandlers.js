import { useCallback, useMemo, useRef } from "react";

/**
 * Wikilink wiring for the editor:
 *   - the note-title set used to detect broken `[[links]]`,
 *   - click / Cmd-click navigation, and autocomplete insertion.
 * (The backlink index and the panel under the note were removed 2026-09-05.)
 *
 * Extracted from BoojyNotes. `noteTitlesKey` short-circuits on `textOnlyEdit`
 * so plain typing doesn't rebuild the title set every keystroke.
 * `handleWikilinkSelect` used to write the rendered HTML to the block itself,
 * on the belief that a sync-generation bump from WikilinkMenu's *native*
 * keydown listener never repainted; proven false in the real app on
 * 2026-09-09 (`wikilink.spec.ts`), and the block now paints itself from the
 * keystroke ref like every other programmatic change (the UI rule, "One
 * owner for note state").
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
        // The commit renders the editor at once, the bump has the block repaint
        // itself from the keystroke ref, and the queued focus puts the caret
        // after the link through placeCaret, which anchors it *outside* the link
        // so the next keystroke is prose, not part of the alias. From a native
        // listener (WikilinkMenu's window keydown) as from a React one.
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
    ],
  );

  return {
    noteTitleSet,
    handleWikilinkClick,
    handleWikilinkSelect,
  };
}
