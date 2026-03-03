import { getBlockFromNode } from "../utils/domHelpers";
import { sanitizeInlineHtml, htmlToInlineMarkdown } from "../utils/inlineFormatting";

export function useInlineFormatting({
  blockRefs, editorRef, noteDataRef, activeNote, updateBlockText, setToolbarState,
  onOpenLinkEditor,
}) {
  const reReadBlockFromDom = (sel) => {
    if (!sel) sel = window.getSelection();
    if (!sel.rangeCount) return;
    const blocks = noteDataRef.current[activeNote]?.content?.blocks;
    const info = getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current);
    if (!info) return;
    const rawHtml = sanitizeInlineHtml(info.el.innerHTML);
    const text = htmlToInlineMarkdown(rawHtml).replace(/[\n\r]+$/, "").replace(/^[\n\r]+/, "");
    updateBlockText(activeNote, info.blockIndex, text);
  };

  const toggleInlineCode = (sel) => {
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    let node = sel.anchorNode;
    let codeEl = null;
    while (node && node !== editorRef.current) {
      if (node.nodeName === "CODE") { codeEl = node; break; }
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
      } catch (_) {
        const frag = range.extractContents();
        code.appendChild(frag);
        range.insertNode(code);
      }
      const r = document.createRange();
      r.selectNodeContents(code);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const toggleWrappingTag = (sel, tagName) => {
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    let node = sel.anchorNode;
    let existing = null;
    while (node && node !== editorRef.current) {
      if (node.nodeName === tagName) { existing = node; break; }
      node = node.parentNode;
    }
    if (existing) {
      const textNode = document.createTextNode(existing.textContent);
      existing.parentNode.replaceChild(textNode, existing);
      const r = document.createRange();
      r.selectNodeContents(textNode);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      const el = document.createElement(tagName.toLowerCase());
      try {
        range.surroundContents(el);
      } catch (_) {
        const frag = range.extractContents();
        el.appendChild(frag);
        range.insertNode(el);
      }
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  };

  const toggleStrikethrough = (sel) => toggleWrappingTag(sel, "DEL");
  const toggleHighlight = (sel) => toggleWrappingTag(sel, "MARK");

  const getLinkContext = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    let node = sel.anchorNode;
    let linkEl = null;
    while (node && node !== editorRef.current) {
      if (node.nodeName === "A") { linkEl = node; break; }
      node = node.parentNode;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerEl = editorRef.current?.closest("[style*='position: relative']") || editorRef.current?.parentElement;
    const containerRect = containerEl?.getBoundingClientRect() || { top: 0, left: 0 };
    const savedRange = range.cloneRange();
    if (linkEl) {
      // Strip icon text from link text
      const textContent = Array.from(linkEl.childNodes)
        .filter(n => !n.classList?.contains("external-link-icon"))
        .map(n => n.textContent)
        .join("");
      return {
        existingLink: linkEl,
        url: linkEl.getAttribute("href") || "",
        text: textContent,
        position: { top: rect.bottom - containerRect.top + 4, left: rect.left - containerRect.left },
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
  };

  const applyFormat = (format) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    if (format === "bold") {
      document.execCommand("bold");
    } else if (format === "italic") {
      document.execCommand("italic");
    } else if (format === "code") {
      toggleInlineCode(sel);
    } else if (format === "strikethrough") {
      toggleStrikethrough(sel);
    } else if (format === "highlight") {
      toggleHighlight(sel);
    } else if (format === "link") {
      // Open link editor popover instead of using prompt()
      if (onOpenLinkEditor) {
        onOpenLinkEditor();
        return; // Don't dismiss toolbar yet — popover will handle it
      }
    }
    reReadBlockFromDom(sel);
    setToolbarState(null);
  };

  const detectActiveFormats = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return { bold: false, italic: false, code: false, link: false, strikethrough: false, highlight: false };
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
  };

  return { applyFormat, detectActiveFormats, reReadBlockFromDom, toggleInlineCode, getLinkContext };
}
