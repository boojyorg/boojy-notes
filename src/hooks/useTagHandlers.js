import { useCallback } from "react";
import { makeCaretAnchor } from "../utils/domHelpers";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";
import { TAG_TAIL_RE } from "../utils/tags";
import { editBlocks } from "../utils/editBlocks";

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
  setTagFilter,
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
  // Tag click: the palette opens with the tag as its filter chip, the notes
  // carrying that exact tag listed and the field empty for further typing.
  const handleTagClick = useCallback(
    (tagName) => {
      setTagFilter(tagName, "");
      setSearch("");
      openSearch();
    },
    [setSearch, setTagFilter, openSearch],
  );

  // Tag autocomplete select handler
  const handleTagSelect = useCallback(
    (tag) => {
      const menu = tagMenuRef.current;
      if (!menu) return;
      const { noteId, blockIndex } = menu;
      const blocks = noteDataRef.current[noteId]?.content?.blocks;
      if (!blocks?.[blockIndex]) return;
      const oldText = blocks[blockIndex].text || "";
      const match = oldText.match(TAG_TAIL_RE);
      if (match) {
        const newText = oldText.slice(0, match.index + match[1].length) + `#${tag} `;
        // A structural commit, as the wikilink completion is: it publishes the
        // new text to React state at once; a debounced commit would leave state
        // at `#rev` for the menu's close to repaint over `#review`. One undo entry for the completion, as for a link.
        commitNoteData(
          editBlocks(noteId, (b) => {
            b[blockIndex] = { ...b[blockIndex], text: newText };
          }),
        );
        // The block is painted here for the caret, not for the paint: the
        // commit's render would repaint it from the ref, but the repaint puts
        // the caret back at its offset, which is inside the collapsed space.
        // The space that ends the tag is the block's last character, and
        // under `white-space: normal` a trailing space collapses: a caret
        // placed in it has no width and Chromium moves the next character
        // into the tag span (`#reviewd`). So the caret is parked on an anchor
        // after the space, the marked zero-width scaffolding placeCaret uses
        // after a link: text typed there lands after the space, outside the tag, and
        // the walkers drop the anchor. A non-breaking space instead would reach
        // the file as U+00A0. Nothing is queued for the focus effect when the
        // block was painted here; a repaint and re-placement from state would
        // put the caret back in the collapsed space. The queued focus and the
        // syncGen bump are the fallback when it was not.
        const el = blockRefs?.current?.[blocks[blockIndex].id];
        if (el) {
          el.innerHTML = inlineMarkdownToHtml(newText, noteTitleSetRef?.current);
          const anchor = makeCaretAnchor();
          el.appendChild(anchor);
          const range = document.createRange();
          range.setStart(anchor.firstChild, 1);
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
