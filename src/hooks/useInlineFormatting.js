import { getBlockFromNode } from "../utils/domHelpers";
import { sanitizeInlineHtml, htmlToInlineMarkdown } from "../utils/inlineFormatting";

export function useInlineFormatting({
  blockRefs, editorRef, noteDataRef, activeNote, updateBlockText, setToolbarState,
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

  const applyFormat = (format) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    if (format === "bold") {
      document.execCommand("bold");
    } else if (format === "italic") {
      document.execCommand("italic");
    } else if (format === "code") {
      toggleInlineCode(sel);
    } else if (format === "link") {
      let node = sel.anchorNode;
      let linkEl = null;
      while (node && node !== editorRef.current) {
        if (node.nodeName === "A") { linkEl = node; break; }
        node = node.parentNode;
      }
      if (linkEl) {
        const textNode = document.createTextNode(linkEl.textContent);
        linkEl.parentNode.replaceChild(textNode, linkEl);
      } else if (!sel.isCollapsed) {
        const url = prompt("Enter URL:");
        if (url) {
          const range = sel.getRangeAt(0);
          const a = document.createElement("a");
          a.href = url;
          try {
            range.surroundContents(a);
          } catch (_) {
            const frag = range.extractContents();
            a.appendChild(frag);
            range.insertNode(a);
          }
        }
      }
    }
    reReadBlockFromDom(sel);
    setToolbarState(null);
  };

  const detectActiveFormats = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return { bold: false, italic: false, code: false, link: false };
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
    };
  };

  return { applyFormat, detectActiveFormats, reReadBlockFromDom, toggleInlineCode };
}
