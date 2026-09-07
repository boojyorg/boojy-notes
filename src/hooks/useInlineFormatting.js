import { useCallback, useRef } from "react";
import {
  caretOffsetAt,
  caretRangeAt,
  getBlockFromNode,
  isEditableBlock,
} from "../utils/domHelpers";
import { domNodeToMarkdown } from "../utils/inlineFormatting";
import { rangeScope } from "../utils/crossBlockEdit";

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

  const toggleInlineCode = useCallback(
    (sel) => {
      if (!sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      let node = sel.anchorNode;
      let codeEl = null;
      while (node && node !== editorRef.current) {
        if (node.nodeName === "CODE") {
          codeEl = node;
          break;
        }
        node = node.parentNode;
      }
      if (codeEl) {
        const textNode = document.createTextNode(codeEl.textContent);
        codeEl.parentNode.replaceChild(textNode, codeEl);
        const r = document.createRange();
        r.selectNodeContents(textNode);
        sel.removeAllRanges();
        sel.addRange(r);
      } else {
        const code = document.createElement("code");
        try {
          range.surroundContents(code);
        } catch {
          const frag = range.extractContents();
          code.appendChild(frag);
          range.insertNode(code);
        }
        const r = document.createRange();
        r.selectNodeContents(code);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    },
    [editorRef],
  );

  const toggleWrappingTag = useCallback(
    (sel, tagName) => {
      if (!sel.rangeCount || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      let node = sel.anchorNode;
      let existing = null;
      while (node && node !== editorRef.current) {
        if (node.nodeName === tagName) {
          existing = node;
          break;
        }
        node = node.parentNode;
      }
      if (existing) {
        // Unwrap (move children out) rather than flattening to textContent, so any
        // nested formatting (e.g. **bold** inside ~~strike~~) survives toggling off.
        const parent = existing.parentNode;
        const r = document.createRange();
        if (existing.firstChild) {
          const first = existing.firstChild;
          const last = existing.lastChild;
          while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
          parent.removeChild(existing);
          r.setStartBefore(first);
          r.setEndAfter(last);
        } else {
          const placeholder = document.createTextNode("");
          parent.replaceChild(placeholder, existing);
          r.selectNodeContents(placeholder);
        }
        sel.removeAllRanges();
        sel.addRange(r);
      } else {
        const el = document.createElement(tagName.toLowerCase());
        try {
          range.surroundContents(el);
        } catch {
          const frag = range.extractContents();
          el.appendChild(frag);
          range.insertNode(el);
        }
        const r = document.createRange();
        r.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    },
    [editorRef],
  );

  const toggleStrikethrough = useCallback(
    (sel) => toggleWrappingTag(sel, "DEL"),
    [toggleWrappingTag],
  );
  const toggleHighlight = useCallback((sel) => toggleWrappingTag(sel, "MARK"), [toggleWrappingTag]);

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

  const getLinkContext = useCallback(() => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    // A link lives inside one text block: no editor for a selection that
    // spans blocks, sits outside every block, or is in a block that owns its
    // own field.
    if (!textBlockScope(sel.getRangeAt(0))) return null;
    let node = sel.anchorNode;
    let linkEl = null;
    while (node && node !== editorRef.current) {
      if (node.nodeName === "A") {
        linkEl = node;
        break;
      }
      node = node.parentNode;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerEl =
      editorRef.current?.closest("[style*='position: relative']") ||
      editorRef.current?.parentElement;
    const containerRect = containerEl?.getBoundingClientRect() || { top: 0, left: 0 };
    const savedRange = range.cloneRange();
    if (linkEl) {
      // Strip icon text from link text
      const textContent = Array.from(linkEl.childNodes)
        .filter((n) => !n.classList?.contains("external-link-icon"))
        .map((n) => n.textContent)
        .join("");
      return {
        existingLink: linkEl,
        url: linkEl.getAttribute("href") || "",
        text: textContent,
        position: {
          top: rect.bottom - containerRect.top + 4,
          left: rect.left - containerRect.left,
        },
        savedRange,
      };
    }
    // No existing link — use selection text
    const selectedText = sel.isCollapsed ? "" : sel.toString();
    return {
      existingLink: null,
      url: "",
      text: selectedText,
      position: { top: rect.bottom - containerRect.top + 4, left: rect.left - containerRect.left },
      savedRange,
    };
  }, [editorRef]);

  const applyFormat = useCallback(
    (format) => {
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      if (format === "link") {
        // Open link editor popover instead of using prompt()
        onOpenLinkEditor?.();
        return; // Don't dismiss toolbar yet — popover will handle it
      }
      const range = sel.getRangeAt(0);
      const scope = textBlockScope(range);
      if (!scope) return;
      const run = () => {
        if (format === "bold") document.execCommand("bold");
        else if (format === "italic") document.execCommand("italic");
        else if (format === "code") toggleInlineCode(sel);
        else if (format === "strikethrough") toggleStrikethrough(sel);
        else if (format === "highlight") toggleHighlight(sel);
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
      setToolbarState(null);
    },
    [
      reReadBlockFromDom,
      toggleInlineCode,
      toggleStrikethrough,
      toggleHighlight,
      onOpenLinkEditor,
      setToolbarState,
    ],
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

  return { applyFormat, detectActiveFormats, reReadBlockFromDom, toggleInlineCode, getLinkContext };
}
