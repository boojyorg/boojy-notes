import { useLayoutEffect, useRef } from "react";
import { settleTypedSpaces } from "../utils/inlineFormatting";

const NEVER = Symbol("never painted");

/**
 * A special block's own field, painted the way a paragraph's contentEditable
 * is. A table cell, a callout's title or body and a code block's textarea are
 * the browser's while the user types into them, and each commits what it
 * holds on every input (the text grain, `commitTextChange`), so the field
 * runs ahead of React state by the commit debounce, and a render can carry
 * a text one keystroke behind the field (the commit publishes in a
 * transition, which React may finish after the next keystroke). The field is
 * therefore judged against the latest text committed, `latest()`, read from
 * the keystroke ref, never against the text this render carries: it is
 * painted only when it does not already hold the latest text (on mount,
 * when a row is inserted above a cell, when a type change renames a
 * callout), and, forced, on a sync-generation bump (undo, redo, an outside
 * change), the one case where the same text must still be repainted. Judged
 * against the render's text, a render behind the field would repaint it and
 * lose the keystrokes since.
 *
 * `read(el)` is what the field holds as Markdown (`domNodeToMarkdown`, or a
 * textarea's value), judged as the commit settles it: a U+00A0 Chromium typed
 * is the space it committed (`settleTypedSpaces`), never a difference, or a
 * pause after a trailing space repainted it away. `paint(el, text)` puts the
 * latest text into it, keeping the caret where the caller can. `text` is this render's text, the trigger.
 */
export function useOwnedField(ref, { text, syncGen, latest, read, paint }) {
  // The generation the field was last painted for; NEVER before the mount paint.
  const paintedFor = useRef(NEVER);
  // The caller's closures as of this render, so the effect keys on the text
  // and the generation alone.
  const fns = useRef({ latest, read, paint });
  fns.current = { latest, read, paint };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = fns.current.latest();
    if (target === undefined) return; // the block is gone
    if (
      paintedFor.current === syncGen &&
      settleTypedSpaces(fns.current.read(el), target) === target
    )
      return;
    paintedFor.current = syncGen;
    fns.current.paint(el, target);
  }, [ref, text, syncGen]);
}

/**
 * The block as the keystroke ref holds it (found by id, so a stale index
 * cannot mislead), or `block` as rendered when no ref is given; undefined
 * once the block is gone from the note.
 */
export function latestBlock(noteDataRef, noteId, block) {
  if (!noteDataRef) return block;
  const blocks = noteDataRef.current?.[noteId]?.content?.blocks;
  if (!blocks) return block;
  return blocks.find((b) => b.id === block.id);
}
