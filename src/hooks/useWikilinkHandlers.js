import { useCallback, useMemo, useRef } from "react";
import {
  noteLinkKeys,
  parseWikilinkTarget,
  unresolvedWikilinkMessage,
  wikilinkStatus,
} from "../utils/wikilinkTarget";

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
 * keystroke ref like every other programmatic change (the editor rule, "One
 * owner for note state").
 *
 * A click resolves the *note* a target names (`utils/wikilinkTarget`), so
 * `[[Beta#Intro]]` and `[[Work/Gamma]]` open Beta and the Gamma in Work (an
 * explicit path is the path, never a namesake elsewhere); the heading or
 * block is not jumped to. **A click that cannot open one note asks**
 * (2026-09-20, Tyr's decision): a name no note has, or one two notes share,
 * opens the link picker on the link (`openLinkFixerRef`) with Create note or
 * the candidates as its rows, and nothing is made or guessed until a row is
 * chosen. Before this a missing plain name was created at the root on click
 * and a shared name opened whichever note loaded first. A target of another
 * form that resolves to nothing (a heading in this note) says so.
 */
export function useWikilinkHandlers({
  noteData,
  noteDataRef,
  textOnlyEdit,
  openNote,
  wikilinkMenuRef,
  setWikilinkMenu,
  syncGeneration,
  commitNoteData,
  focusBlockId,
  focusCursorPos,
  showToast,
  // `(el, { fix: true })`: the picker on a link that names no note, or two.
  openLinkFixerRef,
}) {
  // Note title set for broken wikilink detection (its only consumer is
  // inlineMarkdownToHtml's `has`)
  const lastTitlesKey = useRef("");
  const noteTitlesKey = useMemo(() => {
    if (textOnlyEdit.current) {
      textOnlyEdit.current = false;
      return lastTitlesKey.current;
    }
    // Titles and `folder/title`s alike, so the renderer judges an explicit
    // path by the path (utils/wikilinkTarget). A title two notes share is
    // left out, so a plain `[[Goals]]` draws as unresolved: the click asks.
    const counts = new Map();
    for (const n of Object.values(noteData)) {
      if (n._draft) continue;
      for (const k of noteLinkKeys(n)) counts.set(k, (counts.get(k) || 0) + 1);
    }
    const key = [...counts.entries()]
      .filter(([k, c]) => c === 1 || k.includes("/"))
      .map(([k]) => k)
      .sort()
      .join("\0");
    lastTitlesKey.current = key;
    return key;
  }, [noteData]);
  const noteTitleSet = useMemo(() => new Set(noteTitlesKey.split("\0")), [noteTitlesKey]);

  // Wikilink click handler
  const handleWikilinkClick = useCallback(
    (target, el = null) => {
      const status = wikilinkStatus(target, noteDataRef.current);
      if (status.kind === "note") {
        openNote(status.id);
        return;
      }
      const parsed = parseWikilinkTarget(target);
      if (el && parsed.name && openLinkFixerRef?.current)
        openLinkFixerRef.current(el, { fix: true });
      else showToast?.(unresolvedWikilinkMessage(parsed), "info");
    },
    [openNote, noteDataRef, showToast, openLinkFixerRef],
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
