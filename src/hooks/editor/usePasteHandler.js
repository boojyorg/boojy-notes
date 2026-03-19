import { useCallback } from "react";
import { isEditableBlock, placeCaret } from "../../utils/domHelpers";
import {
  sanitizeInlineHtml,
  htmlToInlineMarkdown,
  stripMarkdownFormatting,
} from "../../utils/inlineFormatting";
import { genBlockId } from "../../utils/storage";

export function usePasteHandler({
  noteDataRef,
  activeNoteRef,
  blockRefs,
  commitNoteData,
  focusBlockId,
  focusCursorPos,
  syncGeneration,
  saveAndInsertImage,
  reReadBlockFromDom,
  getBlock,
}) {
  const handleEditorPaste = useCallback((e) => {
    const currentNote = activeNoteRef.current;
    const files = e.clipboardData?.files;
    if (files?.length > 0) {
      // Check if cursor is inside a code block — don't handle file paste there
      const sel = window.getSelection();
      const info = sel?.rangeCount ? getBlock(sel.anchorNode) : null;
      const blocks = noteDataRef.current[currentNote]?.content?.blocks || [];
      if (info && blocks[info.blockIndex]?.type === "code") {
        // Let code block handle its own paste
        return;
      }

      const allFiles = Array.from(files);
      const imageFile = allFiles.find((f) => f.type.startsWith("image/"));
      if (imageFile) {
        e.preventDefault();
        const afterIndex = info ? info.blockIndex : blocks.length - 1;
        saveAndInsertImage(currentNote, afterIndex, imageFile);
        return;
      }
      // Non-image file paste
      if (allFiles.length > 0) {
        e.preventDefault();
        const afterIndex = info ? info.blockIndex : blocks.length - 1;
        for (const file of allFiles) {
          saveAndInsertImage(currentNote, afterIndex, file);
        }
        return;
      }
    }

    const textData = e.clipboardData.getData("text/plain");

    // Smart paste: URL over selected text → create markdown link
    if (/^https?:\/\/\S+$/.test(textData.trim())) {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const url = textData.trim();

      if (!sel.isCollapsed) {
        // Selection exists: wrap selected text as [text](url)
        const selectedText = sel.toString();
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const a = document.createElement("a");
        a.href = url;
        a.className = "external-link";
        a.setAttribute("data-url", url);
        a.textContent = selectedText;
        const icon = document.createElement("span");
        icon.className = "external-link-icon";
        icon.contentEditable = "false";
        icon.textContent = "\u2197";
        a.appendChild(icon);
        range.insertNode(a);
        range.setStartAfter(a);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // No selection: insert bare URL as link
        const range = sel.getRangeAt(0);
        const a = document.createElement("a");
        a.href = url;
        a.className = "external-link bare-url";
        a.setAttribute("data-url", url);
        a.textContent = url;
        const icon = document.createElement("span");
        icon.className = "external-link-icon";
        icon.contentEditable = "false";
        icon.textContent = "\u2197";
        a.appendChild(icon);
        range.insertNode(a);
        range.setStartAfter(a);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      reReadBlockFromDom();
      return;
    }

    // Check for internal block-level paste
    const boojyData = e.clipboardData.getData("text/boojy-blocks");
    if (boojyData) {
      let pastedBlocks;
      try {
        pastedBlocks = JSON.parse(boojyData);
      } catch {
        pastedBlocks = null;
      }

      const hasFullBlock = pastedBlocks?.some((b) => b.fullBlock);
      if (pastedBlocks?.length > 0 && hasFullBlock) {
        e.preventDefault();
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);

        // Get cursor position and before/after text
        let startIdx, deleteCount, beforeText, afterText;

        if (!range.collapsed) {
          const startInfo = getBlock(range.startContainer);
          const endInfo = getBlock(range.endContainer);
          if (!startInfo || !endInfo) return;
          startIdx = startInfo.blockIndex;
          deleteCount = endInfo.blockIndex - startIdx;

          const preR = document.createRange();
          preR.selectNodeContents(startInfo.el);
          preR.setEnd(range.startContainer, range.startOffset);
          const preDiv = document.createElement("div");
          preDiv.appendChild(preR.cloneContents());
          beforeText = htmlToInlineMarkdown(sanitizeInlineHtml(preDiv.innerHTML));

          const postR = document.createRange();
          postR.selectNodeContents(endInfo.el);
          postR.setStart(range.endContainer, range.endOffset);
          const postDiv = document.createElement("div");
          postDiv.appendChild(postR.cloneContents());
          afterText = htmlToInlineMarkdown(sanitizeInlineHtml(postDiv.innerHTML));
        } else {
          const info = getBlock(sel.anchorNode);
          if (!info) return;
          startIdx = info.blockIndex;
          deleteCount = 0;

          const preR = document.createRange();
          preR.selectNodeContents(info.el);
          preR.setEnd(range.startContainer, range.startOffset);
          const preDiv = document.createElement("div");
          preDiv.appendChild(preR.cloneContents());
          beforeText = htmlToInlineMarkdown(sanitizeInlineHtml(preDiv.innerHTML));

          const postR = document.createRange();
          postR.selectNodeContents(info.el);
          postR.setStart(range.endContainer, range.endOffset);
          const postDiv = document.createElement("div");
          postDiv.appendChild(postR.cloneContents());
          afterText = htmlToInlineMarkdown(sanitizeInlineHtml(postDiv.innerHTML));
        }

        const blocks = noteDataRef.current[currentNote].content.blocks;
        const currentBlock = blocks[startIdx];
        const newBlocks = [];

        // First: handle before-text + first pasted block
        if (!beforeText.trim()) {
          // Before cursor is empty: replace current block with first pasted block
          const first = pastedBlocks[0];
          const replaced = { ...currentBlock, type: first.type, text: first.text };
          if (first.checked !== undefined) replaced.checked = first.checked;
          else delete replaced.checked;
          if (first.indent) replaced.indent = first.indent;
          newBlocks.push(replaced);
        } else {
          // Keep current block with before-text
          newBlocks.push({ ...currentBlock, text: beforeText });
          // First pasted block as new block
          const first = pastedBlocks[0];
          const nb = { id: genBlockId(), type: first.type, text: first.text };
          if (first.checked !== undefined) nb.checked = first.checked;
          newBlocks.push(nb);
        }

        // Remaining pasted blocks
        for (let i = 1; i < pastedBlocks.length; i++) {
          const pb = pastedBlocks[i];
          const nb = { id: genBlockId(), type: pb.type, text: pb.text };
          if (pb.checked !== undefined) nb.checked = pb.checked;
          if (pb.indent) nb.indent = pb.indent;
          newBlocks.push(nb);
        }

        // Append after-text to last block or create new P block
        if (afterText.trim()) {
          const last = newBlocks[newBlocks.length - 1];
          if (last.type === "p" || last.type === currentBlock.type) {
            last.text = (last.text || "") + afterText;
          } else {
            newBlocks.push({ id: genBlockId(), type: "p", text: afterText });
          }
        }

        const lastBlock = newBlocks[newBlocks.length - 1];

        commitNoteData((prev) => {
          const next = { ...prev };
          const n = { ...next[currentNote] };
          const blks = [...n.content.blocks];
          blks.splice(startIdx, 1 + deleteCount, ...newBlocks);
          n.content = { ...n.content, blocks: blks };
          next[currentNote] = n;
          return next;
        });
        syncGeneration.current++;
        focusBlockId.current = lastBlock.id;
        focusCursorPos.current = (lastBlock.text || "").length;
        // Re-place cursor after all layout effects and innerHTML syncs settle
        const deferredId = lastBlock.id;
        const deferredPos = (lastBlock.text || "").length;
        requestAnimationFrame(() => {
          setTimeout(() => {
            const el = blockRefs.current[deferredId];
            if (el) placeCaret(el, deferredPos);
          }, 0);
        });
        return;
      }
    }

    e.preventDefault();
    const htmlData = e.clipboardData.getData("text/html");
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);

    if (!range.collapsed) {
      const startInfo = getBlock(range.startContainer);
      const endInfo = getBlock(range.endContainer);
      if (startInfo && endInfo && startInfo.blockIndex !== endInfo.blockIndex) {
        const startEl = startInfo.el;
        const endEl = endInfo.el;
        const preRange = document.createRange();
        preRange.selectNodeContents(startEl);
        preRange.setEnd(range.startContainer, range.startOffset);
        const preDiv = document.createElement("div");
        preDiv.appendChild(preRange.cloneContents());
        const beforeText = htmlToInlineMarkdown(sanitizeInlineHtml(preDiv.innerHTML));
        const postRange = document.createRange();
        postRange.selectNodeContents(endEl);
        postRange.setStart(range.endContainer, range.endOffset);
        const postDiv = document.createElement("div");
        postDiv.appendChild(postRange.cloneContents());
        const afterText = htmlToInlineMarkdown(sanitizeInlineHtml(postDiv.innerHTML));
        const pastedMd = htmlData ? htmlToInlineMarkdown(sanitizeInlineHtml(htmlData)) : textData;
        const startIdx = startInfo.blockIndex;
        const endIdx = endInfo.blockIndex;
        const startBlockId = noteDataRef.current[currentNote].content.blocks[startIdx].id;
        commitNoteData((prev) => {
          const next = { ...prev };
          const n = { ...next[currentNote] };
          const blks = [...n.content.blocks];
          blks[startIdx] = { ...blks[startIdx], text: beforeText + pastedMd + afterText };
          blks.splice(startIdx + 1, endIdx - startIdx);
          n.content = { ...n.content, blocks: blks };
          next[currentNote] = n;
          return next;
        });
        syncGeneration.current++;
        focusBlockId.current = startBlockId;
        focusCursorPos.current = (beforeText + pastedMd).length;
        return;
      }
    }

    if (htmlData) {
      const sanitized = sanitizeInlineHtml(htmlData);
      document.execCommand("insertHTML", false, sanitized);
    } else {
      document.execCommand("insertText", false, textData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks
  }, []);

  const handleEditorCopy = useCallback((e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);

    // Clone selected content and serialize to HTML string
    const frag = range.cloneContents();
    const wrapper = document.createElement("div");
    wrapper.appendChild(frag);
    const rawHtml = wrapper.innerHTML;

    // Sanitize and convert to clean formats
    const cleanHtml = sanitizeInlineHtml(rawHtml);
    const markdown = htmlToInlineMarkdown(cleanHtml);
    const plainText = stripMarkdownFormatting(markdown);

    e.preventDefault();
    e.clipboardData.setData("text/plain", plainText);
    e.clipboardData.setData("text/html", cleanHtml);

    // Encode block structure for internal paste
    const startInfo = getBlock(range.startContainer);
    const endInfo = getBlock(range.endContainer);
    const noteId = activeNoteRef.current;
    const blocks = noteDataRef.current[noteId]?.content?.blocks;
    if (!startInfo || !endInfo || !blocks) return;

    const startIdx = startInfo.blockIndex;
    const endIdx = endInfo.blockIndex;
    const copiedBlocks = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const block = blocks[i];
      const el = blockRefs.current[block.id];
      if (!el || !isEditableBlock(block)) continue;

      let text;
      let fullBlock = false;

      if (startIdx === endIdx) {
        // Single block selection
        const div = document.createElement("div");
        div.appendChild(range.cloneContents());
        text = htmlToInlineMarkdown(sanitizeInlineHtml(div.innerHTML));
        const preR = document.createRange();
        preR.selectNodeContents(el);
        preR.setEnd(range.startContainer, range.startOffset);
        const postR = document.createRange();
        postR.selectNodeContents(el);
        postR.setStart(range.endContainer, range.endOffset);
        fullBlock = preR.toString().length === 0 && postR.toString().length === 0;
      } else if (i === startIdx) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.setStart(range.startContainer, range.startOffset);
        const div = document.createElement("div");
        div.appendChild(r.cloneContents());
        text = htmlToInlineMarkdown(sanitizeInlineHtml(div.innerHTML));
        const preR = document.createRange();
        preR.selectNodeContents(el);
        preR.setEnd(range.startContainer, range.startOffset);
        fullBlock = preR.toString().length === 0;
      } else if (i === endIdx) {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.setEnd(range.endContainer, range.endOffset);
        const div = document.createElement("div");
        div.appendChild(r.cloneContents());
        text = htmlToInlineMarkdown(sanitizeInlineHtml(div.innerHTML));
        const postR = document.createRange();
        postR.selectNodeContents(el);
        postR.setStart(range.endContainer, range.endOffset);
        fullBlock = postR.toString().length === 0;
      } else {
        text = block.text || "";
        fullBlock = true;
      }

      const entry = { type: block.type, text, fullBlock };
      if (block.checked !== undefined) entry.checked = block.checked;
      if (block.indent) entry.indent = block.indent;
      copiedBlocks.push(entry);
    }

    if (copiedBlocks.length > 0) {
      e.clipboardData.setData("text/boojy-blocks", JSON.stringify(copiedBlocks));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks
  }, []);

  return { handleEditorPaste, handleEditorCopy };
}
