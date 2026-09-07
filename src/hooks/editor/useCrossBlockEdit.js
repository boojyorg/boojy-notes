import { useCallback } from "react";
import {
  applyAcrossBlocks,
  intentOf,
  markdownAfter,
  markdownBefore,
  rangeScope,
  reachAcross,
} from "../../utils/crossBlockEdit";
import { genBlockId } from "../../utils/storage";

/**
 * The one owner of every edit that is not confined to one block root.
 *
 * The editor is a single contentEditable wrapping every block root, so
 * Chromium will happily merge, split or format across two React-owned
 * roots; the next React commit then meets DOM it did not make and throws,
 * or the screen and state quietly part ways. The rule: an edit whose reach
 * crosses a block boundary is the app's, made through state, and Chromium
 * never mutates across roots.
 *
 * `beforeinput` is the seam, because it is the one event that says what
 * Chromium is about to touch (`getTargetRanges()`): a forward Delete at the
 * end of a block reports a range into the next block, and a Backspace
 * beside a code block reports a range that swallows it, neither visible at
 * keydown. Every native edit reaches it; only `execCommand` does not, which
 * is why the script paths (formatting, paste, cut) ask `scopeOf` before
 * they run, and why `ownEdit` is shared with them.
 */
export function useCrossBlockEdit({
  noteDataRef,
  activeNoteRef,
  blockRefs,
  editorRef,
  commitNoteData,
  focusBlockId,
  focusCursorPos,
  syncGeneration,
  selectBlock,
  getBlock,
}) {
  const scopeOf = useCallback((range) => {
    const blocks = noteDataRef.current[activeNoteRef.current]?.content?.blocks;
    return rangeScope(range, editorRef.current, blocks, blockRefs.current);
    // Deps deliberately not exhaustive: all deps are stable refs
  }, []);

  /**
   * Make the edit `intent` over `scope` (a block or cross scope) in state:
   * the start block keeps its Markdown before `points`, the end block its
   * Markdown after, everything between goes. True when something changed;
   * false when the app refuses (an end that is not a text block).
   */
  const ownEdit = useCallback((scope, intent, points) => {
    if (scope.kind === "outside") return false;
    const noteId = activeNoteRef.current;
    const blocks = noteDataRef.current[noteId].content.blocks;
    const { start, end } = scope;
    if (!start.el || !end.el) return false;
    const before = markdownBefore(start.el, points.startContainer, points.startOffset);
    const after = markdownAfter(end.el, points.endContainer, points.endOffset);
    const result = applyAcrossBlocks(
      blocks,
      start.blockIndex,
      end.blockIndex,
      before,
      after,
      intent,
      genBlockId,
    );
    if (!result) return false;
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      n.content = { ...n.content, blocks: result.blocks };
      next[noteId] = n;
      return next;
    });
    syncGeneration.current++;
    focusBlockId.current = result.focusId;
    focusCursorPos.current = result.focusPos;
    return true;
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks
  }, []);

  const handleEditorBeforeInput = useCallback((e) => {
    // No target range means a field that owns itself (a code block's
    // textarea); nothing to judge.
    const target = e.getTargetRanges?.()[0];
    if (!target) return;
    const scope = scopeOf(target);
    if (scope.kind === "block") return;
    // Never across roots, whatever the edit is.
    e.preventDefault();
    if (scope.kind === "outside") return;

    const sel = window.getSelection();
    if (sel?.isCollapsed) {
      // A collapsed caret only reaches across on a Delete or Backspace.
      if (!e.inputType.startsWith("delete")) return;
      const caret = sel.rangeCount ? getBlock(sel.anchorNode) : null;
      if (!caret) return;
      const farIdx =
        caret.blockIndex === scope.start.blockIndex ? scope.end.blockIndex : scope.start.blockIndex;
      const blocks = noteDataRef.current[activeNoteRef.current].content.blocks;
      const reach = reachAcross(blocks, caret.blockIndex, farIdx);
      if (!reach) return;
      if (reach.kind === "select") {
        selectBlock(reach.blockId);
        return;
      }
      ownEdit(scope, { kind: "delete" }, target);
      return;
    }

    const intent = intentOf(e.inputType, e.data ?? e.dataTransfer?.getData("text/plain") ?? null);
    if (intent) ownEdit(scope, intent, target);
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks
  }, []);

  return { scopeOf, ownEdit, handleEditorBeforeInput };
}
