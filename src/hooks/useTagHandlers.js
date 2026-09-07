import { useCallback } from "react";
import { CARET_ANCHOR } from "../utils/domHelpers";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";

/**
 * Tag interactions: clicking a tag chip filters the sidebar to `#tag`, and
 * picking a tag from the autocomplete menu replaces the in-progress `#…` token
 * and restores the caret right after it.
 *
 * Extracted from BoojyNotes. A completion paints the block itself and sets
 * focusBlockId/focusCursorPos for the caret; see handleTagSelect for why.
 */
export function useTagHandlers({
  setSearch,
  openSearch,
  tagMenuRef,
  noteDataRef,
  blockRefs,
  noteTitleSetRef,
  commitNoteData,
  syncGeneration,
  focusBlockId,
  focusCursorPos,
  setTagMenu,
}) {
  // Tag click handler: searches for #tagname (the palette on desktop, the
  // sidebar field on mobile, which has no palette to open).
  const handleTagClick = useCallback(
    (tagName) => {
      setSearch(`#${tagName}`);
      openSearch?.();
    },
    [setSearch, openSearch],
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
        // A structural commit, as the wikilink completion is: it publishes the
        // new text to React state at once. The debounced text commit left state
        // at `#rev` while the menu's own close re-rendered the editor, and the
        // syncGen repaint then painted that stale text back over the block, so
        // the disk said `#review` and the screen said `#rev` (review
        // 2026-09-06, H3). One undo entry for the completion, as for a link.
        commitNoteData((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const b = [...n.content.blocks];
          b[blockIndex] = { ...b[blockIndex], text: newText };
          n.content = { ...n.content, blocks: b };
          next[noteId] = n;
          return next;
        });
        // Enter arrives from TagMenu's *native* window listener, so the block
        // is painted here, the way the wikilink menu and useInputHandler do
        // it. The space that ends the tag is the block's last character, and
        // under `white-space: normal` a trailing space collapses: a caret
        // placed in it has no width and Chromium moved the next character
        // into the tag span (`#reviewd`). So the caret is parked on an anchor
        // after the space, the zero-width scaffolding placeCaret uses after a
        // link: text typed there lands after the space, outside the tag, and
        // the walkers drop the anchor. Probed in the real app (2026-09-07): a
        // non-breaking space instead, after or inside the span, reached the
        // file as U+00A0. Nothing is queued for the focus effect when the
        // block was painted here; a repaint and re-placement from state would
        // put the caret back in the collapsed space. The queued focus and the
        // syncGen bump are the fallback when it was not.
        const el = blockRefs?.current?.[blocks[blockIndex].id];
        if (el) {
          el.innerHTML = inlineMarkdownToHtml(newText, noteTitleSetRef?.current) + CARET_ANCHOR;
          const last = el.lastChild;
          const range = document.createRange();
          range.setStart(last, last.textContent.length);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          syncGeneration.current++;
          focusBlockId.current = blocks[blockIndex].id;
          focusCursorPos.current = newText.length;
        }
      }
      setTagMenu(null);
    },
    [
      commitNoteData,
      syncGeneration,
      noteDataRef,
      blockRefs,
      noteTitleSetRef,
      focusBlockId,
      focusCursorPos,
      setTagMenu,
      tagMenuRef,
    ],
  );

  return { handleTagClick, handleTagSelect };
}
