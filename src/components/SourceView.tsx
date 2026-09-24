import { type MutableRefObject, useLayoutEffect, useRef, useState } from "react";
import { blocksToMarkdown, markdownToBlocks } from "../utils/markdown";
import { paintMarkdown } from "../utils/sourceView";

type Block = { id: string; type: string; text?: string };
type Note = { content: { blocks: Block[] } };
type NoteData = Record<string, Note>;

/**
 * Where the caret is in the view, how far down the scroller its line sits, and
 * whether the note was at its top (where it stays, rather than holding the
 * line's height: the formatted view is taller, and holding the height scrolled
 * a short note's heading under the path band).
 */
export type SourcePlace = { offset: number; top: number; atTop: boolean };

export interface SourceViewApi {
  /** The caret's offset in the file text and its line's height in the scroller. */
  capture: () => SourcePlace | null;
}

interface SourceViewProps {
  noteId: string;
  noteDataRef: MutableRefObject<NoteData>;
  commitTextChange: (updater: (prev: NoteData) => NoteData) => void;
  scrollerRef: MutableRefObject<HTMLElement | null>;
  /** Where to put the caret on the way in (from the formatted view), consumed once. */
  entryRef: MutableRefObject<SourcePlace | null>;
  apiRef: MutableRefObject<SourceViewApi | null>;
}

/**
 * The note as its file (2026-09-24, from the canvas Tyr judged): the Markdown
 * as written, in monospace, editable. Opened from the ··· menu, View in the
 * menu bar or ⌘/, closed the same ways or by the lit `</>` in the chrome row.
 *
 * A textarea over a painted layer, as a code block is: the field holds the text
 * and the caret, transparent; the layer under it draws the same text with the
 * markers muted (`paintMarkdown`). What the field holds goes to the note on
 * every input, read back with the app's own reader (`markdownToBlocks`) through
 * `commitTextChange`, so a burst of typing is one undo entry, the note saves as
 * typing does, and the quit flush finds it. Switching alone commits nothing,
 * so it never changes a byte.
 *
 * The field is repainted only when the note's blocks are not the ones it last
 * committed: an undo, a redo, an outside change. Judged by the blocks'
 * identity rather than by text, a file the reader and writer would respell
 * (`---` under a line gains its blank) is never respelled under the caret.
 */
export default function SourceView({
  noteId,
  noteDataRef,
  commitTextChange,
  scrollerRef,
  entryRef,
  apiRef,
}: SourceViewProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const layerRef = useRef<HTMLPreElement>(null);
  // The blocks the field's text stands for: the ones it last painted or committed.
  const ownBlocks = useRef<Block[] | null>(null);

  const fit = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  };
  const paintLayer = (text: string) => {
    if (layerRef.current) layerRef.current.innerHTML = paintMarkdown(text);
  };

  // Painted from the keystroke ref on mount and whenever the note's blocks
  // are not the field's own. No deps: it runs on every render, which the
  // editor gives only on a structural change, an undo or an outside change.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const blocks = noteDataRef.current?.[noteId]?.content?.blocks;
    if (!field || !blocks || blocks === ownBlocks.current) return;
    const text = blocksToMarkdown(blocks);
    const first = ownBlocks.current === null;
    ownBlocks.current = blocks;
    if (field.value === text) return;
    const { selectionStart, selectionEnd } = field;
    field.value = text;
    paintLayer(text);
    fit();
    if (!first && document.activeElement === field) {
      field.setSelectionRange(
        Math.min(selectionStart, text.length),
        Math.min(selectionEnd, text.length),
      );
    }
  });

  // On the way in: the caret where it was in the formatted view, and its line
  // at the height its block stood, so the switch does not move the page. The
  // place is taken once, when the view is made: an effect that consumed the
  // shared ref ran twice in development (StrictMode) and the second run put
  // the caret at the top.
  const [entry] = useState(() => entryRef.current);
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    entryRef.current = null;
    const offset = Math.min(entry?.offset ?? 0, field.value.length);
    field.focus({ preventScroll: true });
    field.setSelectionRange(offset, offset);
    const scroller = scrollerRef.current;
    const line = lineTop(layerRef.current, offset);
    if (!entry || !scroller) return;
    if (entry.atTop) {
      scroller.scrollTop = 0;
      const after = lineTop(layerRef.current, offset);
      const bottom = scroller.getBoundingClientRect().bottom - BOTTOM_AIR;
      if (after != null && after > bottom) scroller.scrollTop += after - bottom;
    } else if (line != null) {
      scroller.scrollTop = scrollTopFor(scroller, line, entry.top);
    }
  }, [entry, entryRef, scrollerRef]);

  apiRef.current = {
    capture: () => {
      const field = fieldRef.current;
      const scroller = scrollerRef.current;
      if (!field || !scroller) return null;
      const offset = field.selectionStart;
      const line = lineTop(layerRef.current, offset);
      return {
        offset,
        top: (line ?? 0) - scroller.getBoundingClientRect().top,
        atTop: scroller.scrollTop <= 0,
      };
    },
  };

  const onInput = () => {
    const field = fieldRef.current;
    if (!field) return;
    const text = field.value;
    paintLayer(text);
    fit();
    const blocks = markdownToBlocks(text) as Block[];
    ownBlocks.current = blocks;
    commitTextChange((prev) => {
      const note = prev[noteId];
      if (!note) return prev;
      return { ...prev, [noteId]: { ...note, content: { ...note.content, blocks } } };
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab is a character here, as in any text editor, never a trip out of
    // the field. Typed through the browser, so the input event commits it.
    if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      document.execCommand("insertText", false, "\t");
    }
  };

  return (
    // `data-editor`: the note's own field, so Cmd+Z is the note's undo
    // (useAppKeyboard), as it is in a code block's textarea.
    <div className="source-view" data-editor data-testid="source-view">
      <pre ref={layerRef} className="source-layer" aria-hidden="true" />
      <textarea
        ref={fieldRef}
        className="source-field"
        aria-label="Markdown"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onInput={onInput}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/** Room kept under a caret line brought into view from below. */
const BOTTOM_AIR = 80;

/**
 * The scroll that puts a line now at viewport `line` at `top` below the
 * scroller's own top. Set, never added: a second run of the same effect must
 * land in the same place.
 */
function scrollTopFor(scroller: HTMLElement, line: number, top: number): number {
  const at = line - scroller.getBoundingClientRect().top;
  return scroller.scrollTop + at - top;
}

/** The top of the line holding `offset` in the painted layer, in viewport pixels. */
function lineTop(layer: HTMLElement | null, offset: number): number | null {
  if (!layer) return null;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  let left = offset;
  let node = walker.nextNode() as Text | null;
  let last: Text | null = null;
  while (node) {
    if (left <= node.data.length) {
      const range = document.createRange();
      range.setStart(node, left);
      range.setEnd(node, Math.min(left + 1, node.data.length));
      // A browser measures a range; a test DOM may not, and the switch
      // then keeps the scroll it has.
      const rect = range.getClientRects?.()[0] ?? range.getBoundingClientRect?.();
      return rect ? rect.top : null;
    }
    left -= node.data.length;
    last = node;
    node = walker.nextNode() as Text | null;
  }
  return last
    ? (last.parentElement?.getBoundingClientRect().bottom ?? null)
    : layer.getBoundingClientRect().top;
}
