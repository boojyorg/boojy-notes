import { useCallback } from "react";

/**
 * Tag interactions: clicking a tag chip filters the sidebar to `#tag`, and
 * picking a tag from the autocomplete menu replaces the in-progress `#…` token
 * and restores the caret right after it.
 *
 * Extracted from BoojyNotes. The syncGeneration bump + focusBlockId/focusCursorPos
 * assignments drive the post-insert caret restore — preserved verbatim.
 */
export function useTagHandlers({
  setSearch,
  tagMenuRef,
  noteDataRef,
  commitTextChange,
  syncGeneration,
  focusBlockId,
  focusCursorPos,
  setTagMenu,
}) {
  // Tag click handler: sets sidebar search to #tagname
  const handleTagClick = useCallback(
    (tagName) => {
      setSearch(`#${tagName}`);
    },
    [setSearch],
  );

  // Tag autocomplete select handler
  const handleTagSelect = useCallback(
    (tag) => {
      const menu = tagMenuRef.current;
      if (!menu) return;
      const { noteId, blockIndex } = menu;
      const blocks = noteDataRef.current[noteId]?.content?.blocks;
      if (!blocks || !blocks[blockIndex]) return;
      const oldText = blocks[blockIndex].text || "";
      const match = oldText.match(/(^|[\s(])#([a-zA-Z][\w/-]*)$/);
      if (match) {
        const newText = oldText.slice(0, match.index + match[1].length) + `#${tag} `;
        commitTextChange((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const b = [...n.content.blocks];
          b[blockIndex] = { ...b[blockIndex], text: newText };
          n.content = { ...n.content, blocks: b };
          next[noteId] = n;
          return next;
        });
        syncGeneration.current++;
        focusBlockId.current = blocks[blockIndex].id;
        focusCursorPos.current = newText.length;
      }
      setTagMenu(null);
    },
    [
      commitTextChange,
      syncGeneration,
      noteDataRef,
      focusBlockId,
      focusCursorPos,
      setTagMenu,
      tagMenuRef,
    ],
  );

  return { handleTagClick, handleTagSelect };
}
