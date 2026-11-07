import { type MutableRefObject, useCallback } from "react";
import { flushSync } from "react-dom";
import type { Block, NoteData } from "../../types/notes";
import { markdownAfter, markdownBefore } from "../../utils/crossBlockEdit";
import {
  caretOffsetAt,
  caretRect,
  getBlockFromNode,
  isEditableBlock,
  placeCaret,
} from "../../utils/domHelpers";
import { editBlocks } from "../../utils/editBlocks";
import { addFootnote, nextFootnoteNumber } from "../../utils/footnoteTarget";
import { FOOTNOTE_REF_CLASS, LITERAL_SELECTOR } from "../../utils/footnotes";
import {
  FOOTNOTE_DRAFT_EVENT,
  type FootnoteDraft,
  draftEdit,
  rectOf,
} from "../../utils/footnoteDraft";
import { genBlockId } from "../../utils/storage";

/**
 * What a reference may never land inside: a code span, a comment or a
 * footnote, a link, a tag, a formula. Asked there, it goes just after it.
 */
const SEALED = `${LITERAL_SELECTOR}, code, a, .wikilink, .inline-tag, [data-math]`;

interface Where {
  noteId: string;
  blockIndex: number;
  el: HTMLElement;
  node: Node;
  offset: number;
}

interface Deps {
  noteDataRef: MutableRefObject<NoteData>;
  activeNoteRef: MutableRefObject<string | null>;
  editorRef: MutableRefObject<HTMLElement | null>;
  blockRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  commitNoteData: (updater: (prev: NoteData) => NoteData) => void;
  syncGeneration: MutableRefObject<number>;
  focusBlockId: MutableRefObject<string | null>;
  focusCursorPos: MutableRefObject<number | null>;
}

/**
 * Insert footnote (the Format menu, the right-click menu): `[^n]` at the
 * caret, or just after the selection, and an empty `[^n]:` at the note's end
 * (`addFootnote`), in one commit, so one undo takes both back; the caret goes
 * to the definition. `n` is one above every number already a label
 * (`nextFootnoteNumber`). Only in a text block, the selection inside one
 * block; a block with its own field (a cell, a callout) is left alone.
 */
export function useFootnoteCommands({
  noteDataRef,
  activeNoteRef,
  editorRef,
  blockRefs,
  commitNoteData,
  syncGeneration,
}: Deps) {
  /** Where the reference would go now, or null where Insert footnote cannot act. */
  const footnoteSpot = useCallback((): Where | null => {
    const noteId = activeNoteRef.current;
    const sel = window.getSelection();
    if (!noteId || !sel?.rangeCount || !editorRef.current) return null;
    const range = sel.getRangeAt(0);
    const blocks = noteDataRef.current[noteId]?.content?.blocks as Block[] | undefined;
    if (!blocks) return null;
    const at = getBlockFromNode(range.endContainer, editorRef.current, blocks, blockRefs.current);
    const el = at?.el as HTMLElement | undefined;
    if (!at || !el || !isEditableBlock(blocks[at.blockIndex])) return null;
    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
    let node: Node = range.endContainer;
    let offset = range.endOffset;
    // The outermost sealed run holding the spot: a tag inside a link is the link's.
    const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    let sealed: Element | null = null;
    for (
      let e = start?.closest(SEALED) ?? null;
      e && e !== el && el.contains(e);
      e = e.parentElement?.closest(SEALED) ?? null
    ) {
      sealed = e;
    }
    if (sealed?.parentNode) {
      node = sealed.parentNode;
      offset = Array.prototype.indexOf.call(node.childNodes, sealed) + 1;
    }
    return { noteId, blockIndex: at.blockIndex, el, node, offset };
  }, [activeNoteRef, editorRef, noteDataRef, blockRefs]);

  /**
   * Insert footnote (the menus): nothing is written yet. The panel opens at
   * the caret with the next number (`FOOTNOTE_DRAFT_EVENT`); its Done makes
   * the reference and the definition in one commit (`commitFootnoteDraft`).
   */
  const insertFootnote = useCallback((): boolean => {
    const spot = footnoteSpot();
    if (!spot) return false;
    const { noteId, blockIndex, el, node, offset } = spot;
    const blocks = noteDataRef.current[noteId].content.blocks as Block[];
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const draft: FootnoteDraft = {
      kind: "menu",
      noteId,
      blockId: blocks[blockIndex].id,
      label: String(nextFootnoteNumber(blocks)),
      before: markdownBefore(el, node, offset),
      after: markdownAfter(el, node, offset),
      rect: rectOf(caretRect(range, el)),
    };
    document.dispatchEvent(new CustomEvent(FOOTNOTE_DRAFT_EVENT, { detail: draft }));
    return true;
  }, [footnoteSpot, noteDataRef]);

  /**
   * A draft's Done: its reference (unless typed already) and its definition,
   * `text`, in one commit, so one undo takes back what the panel made and
   * nothing typed. Refused (false) when the line no longer reads as it did
   * where the reference goes. The caret goes back after the reference when
   * the note is still the open one.
   */
  const commitFootnoteDraft = useCallback(
    (draft: FootnoteDraft, defText: string): boolean => {
      const blocks = noteDataRef.current[draft.noteId]?.content?.blocks as Block[] | undefined;
      const edit = blocks && draftEdit(blocks, draft);
      if (!edit) return false;
      const { blockIndex, text, label, refsBefore } = edit;
      syncGeneration.current++;
      flushSync(() =>
        commitNoteData(
          editBlocks(draft.noteId, (b) => {
            const at = addFootnote(b, blockIndex, text, label, genBlockId());
            b[at] = { ...b[at], text: defText } as Block;
          }),
        ),
      );
      if (activeNoteRef.current !== draft.noteId) return true;
      const el = blockRefs.current[draft.blockId];
      const ref = el?.querySelectorAll(`.${FOOTNOTE_REF_CLASS}`)[refsBefore];
      if (el && ref?.parentNode) {
        const at = caretOffsetAt(
          el,
          ref.parentNode,
          [...ref.parentNode.childNodes].indexOf(ref as ChildNode),
        );
        el.focus({ preventScroll: true });
        placeCaret(el, at + 1, { reveal: false });
      }
      return true;
    },
    [noteDataRef, activeNoteRef, blockRefs, syncGeneration, commitNoteData],
  );

  return {
    insertFootnote,
    commitFootnoteDraft,
    canInsertFootnote: () => footnoteSpot() !== null,
  };
}
