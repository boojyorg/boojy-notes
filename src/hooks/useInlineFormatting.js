import { useCallback, useRef } from "react";
import {
  caretOffsetAt,
  caretRangeAt,
  getBlockFromNode,
  isEditableBlock,
} from "../utils/domHelpers";
import { domNodeToMarkdown } from "../utils/inlineFormatting";
import { rangeScope } from "../utils/crossBlockEdit";
import { applyDomFormat, formatInlineField, inlineFieldFor } from "../utils/inlineFormatCommands";

/** No inline format active — what the toolbars show when there is no selection. */
export const EMPTY_FORMATS = {
  bold: false,
  italic: false,
  code: false,
  link: false,
  strikethrough: false,
  highlight: false,
};

export function useInlineFormatting({
  blockRefs,
  editorRef,
  noteDataRef,
  activeNote,
  updateBlockText,
  setToolbarState,
  onOpenLinkEditor,
}) {
  const activeNoteRef = useRef(activeNote);
  activeNoteRef.current = activeNote;

  const reReadBlockFromDom = useCallback(
    (sel) => {
      if (!sel) sel = window.getSelection();
      if (!sel.rangeCount) return;
      const blocks = noteDataRef.current[activeNoteRef.current]?.content?.blocks;
      const info = getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current);
      // A block with no registered element owns its own text (a table cell,
      // a callout field); the editor never reads it back.
      if (!info?.el) return;
      const text = domNodeToMarkdown(info.el)
        .replace(/[\n\r]+$/, "")
        .replace(/^[\n\r]+/, "");
      updateBlockText(activeNoteRef.current, info.blockIndex, text);
    },
    [blockRefs, editorRef, noteDataRef, updateBlockText],
  );

  /**
   * Which block roots a range touches, when the app may format there: the
   * scope for one text block or a run of them, null for a selection outside
   * every block or inside a block that owns its own field.
   */
  const textBlockScope = (range) => {
    const blocks = noteDataRef.current[activeNoteRef.current]?.content?.blocks;
    const scope = rangeScope(range, editorRef.current, blocks, blockRefs.current);
    if (scope.kind === "outside") return null;
    if (scope.kind === "block" && !isEditableBlock(blocks[scope.start.blockIndex])) return null;
    return scope;
  };

  /**
   * What Cmd+K or the toolbar's Link is about: the link the caret is in (an
   * `<a>` or a `[[wikilink]]` span, climbed to from the range's start, so a
   * selection that begins inside a link is that link), else the selection.
   * The anchor is a viewport rect: the picker is a fixed popover
   * (`LinkPicker`), placed by `useMenuPosition` as every menu is.
   */
  const getLinkContext = useCallback(() => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    // A link lives inside one text block: no editor for a selection that
    // spans blocks, sits outside every block, or is in a block that owns its
    // own field.
    const range = sel.getRangeAt(0);
    if (!textBlockScope(range)) return null;
    let node = range.startContainer;
    let linkEl = null;
    while (node && node !== editorRef.current) {
      if (node.nodeName === "A" || (node.nodeType === 1 && node.classList.contains("wikilink"))) {
        linkEl = node;
        break;
      }
      node = node.parentNode;
    }
    const toAnchor = (r) => ({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    if (linkEl) {
      const r = document.createRange();
      r.selectNode(linkEl);
      return {
        existingLink: linkEl,
        anchor: toAnchor(linkEl.getBoundingClientRect()),
        savedRange: r,
      };
    }
    return {
      existingLink: null,
      anchor: toAnchor(range.getBoundingClientRect()),
      savedRange: range.cloneRange(),
    };
  }, [editorRef]);

  const applyFormat = useCallback(
    (format) => {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      // A field that holds inline Markdown owns its own formatting: the format
      // is applied inside the field and the field commits it as it commits a
      // keystroke (`formatInlineField`). The editor reads no block back here —
      // a cell's text is the cell's, not the table block's — and Link is not
      // offered, so the toolbar shows no glyph for it.
      const field = inlineFieldFor(sel.anchorNode, editorRef.current);
      if (field) {
        if (formatInlineField(sel, format, field)) {
          setToolbarState((prev) => (prev ? { ...prev } : prev));
        }
        return;
      }
      if (format === "link") {
        // Open link editor popover instead of using prompt()
        onOpenLinkEditor?.();
        return; // Don't dismiss toolbar yet — popover will handle it
      }
      const range = sel.getRangeAt(0);
      const scope = textBlockScope(range);
      if (!scope) return;
      const run = () => {
        // A collapsed caret keeps `execCommand`: the pending style it sets for
        // the next keystroke has no structural equivalent (residue, rare).
        // Everything else is a structural wrap (`applyDomFormat`), because the
        // command decides its direction from the computed style and un-bolded
        // a heading's word.
        if (sel.isCollapsed && (format === "bold" || format === "italic")) {
          document.execCommand(format);
        } else {
          applyDomFormat(sel, format, editorRef.current);
        }
        reReadBlockFromDom(sel);
      };
      if (scope.kind === "block") {
        run();
      } else {
        // Across blocks, each block is formatted within itself: the format
        // is applied to the part of the selection inside each root and that
        // root alone is read back, so Chromium never wraps two roots in one
        // element. The selection is then restored as the one run it was.
        const { startContainer, startOffset, endContainer, endOffset } = range;
        const startEl = scope.start.el;
        const endEl = scope.end.el;
        const startPos = caretOffsetAt(startEl, startContainer, startOffset);
        const endPos = caretOffsetAt(endEl, endContainer, endOffset);
        const blocks = noteDataRef.current[activeNoteRef.current].content.blocks;
        for (let i = scope.start.blockIndex; i <= scope.end.blockIndex; i++) {
          const el = isEditableBlock(blocks[i]) ? blockRefs.current[blocks[i].id] : null;
          if (!el) continue;
          const part = document.createRange();
          part.selectNodeContents(el);
          if (i === scope.start.blockIndex) part.setStart(startContainer, startOffset);
          if (i === scope.end.blockIndex) part.setEnd(endContainer, endOffset);
          if (part.collapsed) continue;
          sel.removeAllRanges();
          sel.addRange(part);
          run();
        }
        const from = caretRangeAt(startEl, startPos);
        const to = caretRangeAt(endEl, endPos);
        if (from && to) {
          const whole = document.createRange();
          whole.setStart(from.startContainer, from.startOffset);
          whole.setEnd(to.startContainer, to.startOffset);
          sel.removeAllRanges();
          sel.addRange(whole);
        }
      }
      // The toolbar stays where it is (the selection is still there) and
      // re-reads the active formats: a fresh state object with the same
      // position. Clearing it here made it vanish and come back a beat later.
      setToolbarState((prev) => (prev ? { ...prev } : prev));
    },
    [reReadBlockFromDom, editorRef, onOpenLinkEditor, setToolbarState],
  );

  const detectActiveFormats = useCallback(() => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return EMPTY_FORMATS;
    const isFormatActive = (tags) => {
      let node = sel.anchorNode;
      while (node && node !== editorRef.current) {
        if (tags.includes(node.nodeName)) return true;
        node = node.parentNode;
      }
      return false;
    };
    return {
      bold: isFormatActive(["STRONG", "B"]),
      italic: isFormatActive(["EM", "I"]),
      code: isFormatActive(["CODE"]),
      link: isFormatActive(["A"]),
      strikethrough: isFormatActive(["DEL", "S"]),
      highlight: isFormatActive(["MARK"]),
    };
  }, [editorRef]);

  return { applyFormat, detectActiveFormats, reReadBlockFromDom, getLinkContext };
}
