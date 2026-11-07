import { type MutableRefObject, useCallback } from "react";
import { flushSync } from "react-dom";
import type { Block, NoteData } from "../../types/notes";
import { markdownAfter, markdownBefore } from "../../utils/crossBlockEdit";
import { getBlockFromNode, isEditableBlock } from "../../utils/domHelpers";
import { editBlocks } from "../../utils/editBlocks";
import { addFootnote, nextFootnoteNumber } from "../../utils/footnoteTarget";
import { LITERAL_SELECTOR } from "../../utils/footnotes";
import { settleTypedSpaces } from "../../utils/inlineFormatting";
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
  focusBlockId,
  focusCursorPos,
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

  const insertFootnote = useCallback((): boolean => {
    const spot = footnoteSpot();
    if (!spot) return false;
    const { noteId, blockIndex, el, node, offset } = spot;
    const blocks = noteDataRef.current[noteId].content.blocks as Block[];
    const label = String(nextFootnoteNumber(blocks));
    const before = markdownBefore(el, node, offset);
    const after = markdownAfter(el, node, offset);
    const text = settleTypedSpaces(`${before}[^${label}]${after}`, blocks[blockIndex].text);
    const id = genBlockId();
    focusBlockId.current = id;
    focusCursorPos.current = 0;
    // The edited block repaints from the ref (the bump), its reference drawn,
    // and the caret moves, before the next keystroke: from the menu bar this
    // is no key event, so React would render later, and a letter typed in
    // between would land in the old line and its read-back drop the reference.
    syncGeneration.current++;
    flushSync(() =>
      commitNoteData(
        editBlocks(noteId, (b) => {
          addFootnote(b, blockIndex, text, label, id);
        }),
      ),
    );
    return true;
  }, [footnoteSpot, noteDataRef, syncGeneration, commitNoteData, focusBlockId, focusCursorPos]);

  return { insertFootnote, canInsertFootnote: () => footnoteSpot() !== null };
}
