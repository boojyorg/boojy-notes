import { getBlockFromNode, cleanOrphanNodes, findNearestBlock, placeCaret, isEditableBlock } from "../utils/domHelpers";
import { sanitizeInlineHtml, htmlToInlineMarkdown } from "../utils/inlineFormatting";
import { genBlockId } from "../utils/storage";
import { SLASH_COMMANDS } from "../constants/data";

export function useEditorHandlers({
  noteDataRef, activeNote,
  commitNoteData, commitTextChange,
  blockRefs, editorRef, focusBlockId, focusCursorPos,
  slashMenuRef, setSlashMenu,
  syncGeneration,
  updateBlockText, insertBlockAfter, deleteBlock, saveAndInsertImage,
  reReadBlockFromDom, toggleInlineCode,
  mouseIsDown, setToolbarState,
}) {
  // Helper to get blocks and call getBlockFromNode with current refs
  const getBlock = (node) => {
    const blocks = noteDataRef.current[activeNote]?.content?.blocks;
    return getBlockFromNode(node, editorRef.current, blocks, blockRefs.current);
  };

  // --- Slash command execution ---
  const executeSlashCommand = async (noteId, blockIndex, command) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    const el = blockRefs.current[block.id];

    if (command.type === "image") {
      if (el) el.innerHTML = "<br>";
      commitNoteData(prev => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks[blockIndex] = { ...blks[blockIndex], text: "" };
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      if (!window.electronAPI) return;
      try {
        const picked = await window.electronAPI.pickImageFile();
        if (!picked) { focusBlockId.current = block.id; focusCursorPos.current = 0; return; }
        const relPath = await window.electronAPI.saveImage({ noteId, fileName: picked.fileName, dataBase64: picked.dataBase64 });
        const imgBlock = { id: genBlockId(), type: "image", src: relPath, alt: picked.fileName.replace(/\.[^.]+$/, ""), text: "" };
        const paraBlock = { id: genBlockId(), type: "p", text: "" };
        commitNoteData(prev => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blks = [...n.content.blocks];
          blks.splice(blockIndex, 1, imgBlock, paraBlock);
          n.content = { ...n.content, blocks: blks };
          next[noteId] = n;
          return next;
        });
        focusBlockId.current = paraBlock.id;
        focusCursorPos.current = 0;
      } catch (err) {
        console.error("Image slash command failed", err);
        focusBlockId.current = block.id;
        focusCursorPos.current = 0;
      }
      return;
    }

    if (el) el.innerHTML = "<br>";
    commitNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blks = [...n.content.blocks];
      const updated = { ...blks[blockIndex], text: "", type: command.type };
      if (command.type === "checkbox") updated.checked = false;
      if (command.type === "spacer") { delete updated.text; delete updated.checked; }
      if (command.type !== "checkbox") delete updated.checked;
      blks[blockIndex] = updated;
      n.content = { ...n.content, blocks: blks };
      next[noteId] = n;
      return next;
    });
    if (command.type === "spacer") {
      insertBlockAfter(noteId, blockIndex, "p", "");
    } else {
      focusBlockId.current = block.id;
      focusCursorPos.current = 0;
    }
  };

  // --- Block input handler ---
  const handleBlockInput = (noteId, blockIndex) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const el = blockRefs.current[blocks[blockIndex]?.id];
    if (!el) return;
    const rawHtml = sanitizeInlineHtml(el.innerHTML);
    const text = htmlToInlineMarkdown(rawHtml).replace(/[\n\r]+$/, "").replace(/^[\n\r]+/, "");
    updateBlockText(noteId, blockIndex, text);

    const S = "[\\s\\u00a0]";
    const mdPatterns = [
      { regex: new RegExp(`^###${S}$`), type: "h3" },
      { regex: new RegExp(`^##${S}$`), type: "h2" },
      { regex: new RegExp(`^#${S}$`), type: "h1" },
      { regex: new RegExp(`^[-*]${S}$`), type: "bullet" },
      { regex: new RegExp(`^\\[\\]${S}$`), type: "checkbox" },
      { regex: new RegExp(`^\\[${S}\\]${S}$`), type: "checkbox" },
      { regex: new RegExp(`^1\\.${S}$`), type: "numbered" },
      { regex: /^---$/, type: "spacer" },
    ];
    const currentBlock = noteDataRef.current[noteId].content.blocks[blockIndex];
    for (const pat of mdPatterns) {
      if (pat.regex.test(text)) {
        el.innerHTML = "<br>";
        commitNoteData(prev => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blks = [...n.content.blocks];
          const updated = { ...blks[blockIndex], text: "", type: pat.type };
          if (pat.type === "checkbox") updated.checked = false;
          if (pat.type === "spacer") { delete updated.text; delete updated.checked; }
          if (pat.type !== "checkbox") delete updated.checked;
          blks[blockIndex] = updated;
          n.content = { ...n.content, blocks: blks };
          next[noteId] = n;
          return next;
        });
        if (pat.type === "spacer") {
          insertBlockAfter(noteId, blockIndex, "p", "");
        } else {
          focusBlockId.current = currentBlock.id;
          focusCursorPos.current = 0;
        }
        return;
      }
    }

    const trimmed = text.trim();
    if (trimmed === "/") {
      const rect = el.getBoundingClientRect();
      setSlashMenu({ noteId, blockIndex, filter: "", selectedIndex: 0, rect: { top: rect.bottom + 4, left: rect.left } });
    } else if (slashMenuRef.current && slashMenuRef.current.blockIndex === blockIndex) {
      if (trimmed.startsWith("/")) {
        setSlashMenu(prev => prev ? { ...prev, filter: trimmed.slice(1), selectedIndex: 0 } : null);
      } else {
        setSlashMenu(null);
      }
    }
  };

  // --- Block keyboard handler ---
  const handleBlockKeyDown = (noteId, blockIndex, e) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    const el = blockRefs.current[block.id];
    if (!el) return;

    // Slash menu navigation
    if (slashMenuRef.current && slashMenuRef.current.blockIndex === blockIndex) {
      const sm = slashMenuRef.current;
      const filtered = SLASH_COMMANDS.filter(c => c.label.toLowerCase().includes(sm.filter.toLowerCase()));
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashMenu(prev => prev ? { ...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filtered.length - 1) } : null); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashMenu(prev => prev ? { ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) } : null); return; }
      if (e.key === "Enter") { e.preventDefault(); if (filtered.length > 0) executeSlashCommand(noteId, blockIndex, filtered[sm.selectedIndex] || filtered[0]); setSlashMenu(null); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlashMenu(null); return; }
    }

    const text = el ? htmlToInlineMarkdown(sanitizeInlineHtml(el.innerHTML)).replace(/\n$/, "") : "";

    // Enter — split block
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const blockType = blocks[blockIndex].type;
      const isList = blockType === "bullet" || blockType === "checkbox" || blockType === "numbered";

      if (isList && text.trim() === "") {
        el.innerHTML = "<br>";
        commitNoteData(prev => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blks = [...n.content.blocks];
          const updated = { ...blks[blockIndex], type: "p", text: "" };
          delete updated.checked;
          blks[blockIndex] = updated;
          n.content = { ...n.content, blocks: blks };
          next[noteId] = n;
          return next;
        });
        focusBlockId.current = blocks[blockIndex].id;
        focusCursorPos.current = 0;
        return;
      }

      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(range.startContainer, range.startOffset);
      const preDiv = document.createElement("div");
      preDiv.appendChild(preRange.cloneContents());
      const beforeText = htmlToInlineMarkdown(sanitizeInlineHtml(preDiv.innerHTML));
      const postRange = document.createRange();
      postRange.selectNodeContents(el);
      postRange.setStart(range.endContainer, range.endOffset);
      const postDiv = document.createElement("div");
      postDiv.appendChild(postRange.cloneContents());
      const afterText = htmlToInlineMarkdown(sanitizeInlineHtml(postDiv.innerHTML));
      updateBlockText(noteId, blockIndex, beforeText);
      syncGeneration.current++;
      insertBlockAfter(noteId, blockIndex, isList ? blockType : "p", afterText);
    }

    // Backspace
    if (e.key === "Backspace") {
      if (text === "") {
        if (blocks.length <= 1) return;
        e.preventDefault();
        let prevIdx = blockIndex - 1;
        while (prevIdx >= 0 && !isEditableBlock(blocks[prevIdx])) prevIdx--;
        if (prevIdx >= 0) {
          focusBlockId.current = blocks[prevIdx].id;
          focusCursorPos.current = (blocks[prevIdx].text || "").length;
        }
        deleteBlock(noteId, blockIndex);
        return;
      }
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (range.collapsed) {
          const preRange = document.createRange();
          preRange.selectNodeContents(el);
          preRange.setEnd(range.startContainer, range.startOffset);
          if (preRange.toString().length === 0) {
            let prevIdx = blockIndex - 1;
            while (prevIdx >= 0 && !isEditableBlock(blocks[prevIdx])) prevIdx--;
            if (prevIdx >= 0) {
              e.preventDefault();
              const prevBlock = blocks[prevIdx];
              const prevText = prevBlock.text || "";
              const cursorPos = prevText.length;
              updateBlockText(noteId, prevIdx, prevText + text);
              deleteBlock(noteId, blockIndex);
              syncGeneration.current++;
              focusBlockId.current = prevBlock.id;
              focusCursorPos.current = cursorPos;
            }
          }
        }
      }
    }

    // Arrow up
    if (e.key === "ArrowUp") {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (rect.top - elRect.top < 5) {
          e.preventDefault();
          if (blockIndex === 0) {
            // titleRef is not available here — use focusBlockId to signal title focus
            // Actually we don't have titleRef. The main file handles title focus via
            // a special convention. For now, we'll try to get the title element.
            const titleEl = editorRef.current?.parentElement?.querySelector("h1[contenteditable]");
            if (titleEl) titleEl.focus();
          } else {
            let prevIdx = blockIndex - 1;
            while (prevIdx >= 0 && !isEditableBlock(blocks[prevIdx])) prevIdx--;
            if (prevIdx >= 0) {
              const prevEl = blockRefs.current[blocks[prevIdx].id];
              if (prevEl) placeCaret(prevEl, (blocks[prevIdx].text || "").length);
            }
          }
        }
      }
    }

    // Arrow down
    if (e.key === "ArrowDown") {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom - rect.bottom < 5) {
          let nextIdx = blockIndex + 1;
          while (nextIdx < blocks.length && !isEditableBlock(blocks[nextIdx])) nextIdx++;
          if (nextIdx < blocks.length) {
            e.preventDefault();
            const nextEl = blockRefs.current[blocks[nextIdx].id];
            if (nextEl) placeCaret(nextEl, 0);
          }
        }
      }
    }
  };

  // --- Cross-block key handler ---
  const handleCrossBlockKeyDown = (e, startInfo, endInfo) => {
    const blocks = noteDataRef.current[activeNote].content.blocks;
    const range = window.getSelection().getRangeAt(0);
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

    const startIdx = startInfo.blockIndex;
    const endIdx = endInfo.blockIndex;
    const startBlockId = blocks[startIdx].id;

    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      commitNoteData(prev => {
        const next = { ...prev };
        const n = { ...next[activeNote] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText + afterText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        n.content = { ...n.content, blocks: blks };
        next[activeNote] = n;
        return next;
      });
      syncGeneration.current++;
      focusBlockId.current = startBlockId;
      focusCursorPos.current = beforeText.length;
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const newBlockId = genBlockId();
      const startType = blocks[startIdx].type;
      const isList = startType === "bullet" || startType === "checkbox" || startType === "numbered";
      commitNoteData(prev => {
        const next = { ...prev };
        const n = { ...next[activeNote] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        const newBlock = { id: newBlockId, type: isList ? startType : "p", text: afterText };
        if (startType === "checkbox") newBlock.checked = false;
        blks.splice(startIdx + 1, 0, newBlock);
        n.content = { ...n.content, blocks: blks };
        next[activeNote] = n;
        return next;
      });
      syncGeneration.current++;
      focusBlockId.current = newBlockId;
      focusCursorPos.current = 0;
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      commitNoteData(prev => {
        const next = { ...prev };
        const n = { ...next[activeNote] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText + e.key + afterText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        n.content = { ...n.content, blocks: blks };
        next[activeNote] = n;
        return next;
      });
      syncGeneration.current++;
      focusBlockId.current = startBlockId;
      focusCursorPos.current = beforeText.length + e.key.length;
      return;
    }
  };

  // --- Editor wrapper event handlers ---
  const handleEditorKeyDown = (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) {
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (blocks && blocks.length > 0) {
        const first = blocks.find(b => isEditableBlock(b));
        if (first) {
          const el = blockRefs.current[first.id];
          if (el?.isConnected && placeCaret(el, 0)) {
            return;
          }
        }
      }
      return;
    }
    const range = sel.getRangeAt(0);

    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "b") {
      e.preventDefault();
      document.execCommand("bold");
      reReadBlockFromDom(sel);
      return;
    }
    if (mod && e.key === "i") {
      e.preventDefault();
      document.execCommand("italic");
      reReadBlockFromDom(sel);
      return;
    }
    if (mod && e.key === "`") {
      e.preventDefault();
      toggleInlineCode(sel);
      reReadBlockFromDom(sel);
      return;
    }

    if (!range.collapsed) {
      const startInfo = getBlock(range.startContainer);
      const endInfo = getBlock(range.endContainer);
      if (startInfo && endInfo && startInfo.blockIndex !== endInfo.blockIndex) {
        handleCrossBlockKeyDown(e, startInfo, endInfo);
        return;
      }
    }

    const info = getBlock(sel.anchorNode);
    if (!info) {
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      const target = findNearestBlock(sel, blocks, blockRefs.current);
      if (!target) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertBlockAfter(activeNote, target.blockIndex, "p", "");
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const el = blockRefs.current[target.blockId];
        if (el?.isConnected) {
          placeCaret(el, (blocks[target.blockIndex].text || "").length);
        } else {
          const bid = target.blockId;
          const pos = (blocks[target.blockIndex].text || "").length;
          requestAnimationFrame(() => {
            const fresh = blockRefs.current[bid];
            if (fresh) placeCaret(fresh, pos);
          });
        }
        return;
      }
      return;
    }
    handleBlockKeyDown(activeNote, info.blockIndex, e);
  };

  const handleEditorInput = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const info = getBlock(sel.anchorNode);
    if (!info) {
      requestAnimationFrame(() => {
        const freshSel = window.getSelection();
        if (!freshSel.rangeCount) return;
        const freshInfo = getBlock(freshSel.anchorNode);
        if (freshInfo) {
          handleBlockInput(activeNote, freshInfo.blockIndex);
          return;
        }
        cleanOrphanNodes(editorRef.current);
        const blocks = noteDataRef.current[activeNote]?.content?.blocks;
        if (!blocks || blocks.length === 0) return;
        const lastBlock = blocks[blocks.length - 1];
        const el = blockRefs.current[lastBlock.id];
        if (el?.isConnected) placeCaret(el, (lastBlock.text || "").length);
      });
      return;
    }
    handleBlockInput(activeNote, info.blockIndex);
  };

  const handleEditorMouseUp = () => {
    mouseIsDown.current = false;
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (sel.rangeCount && !sel.getRangeAt(0).collapsed) return;
      if (sel.rangeCount) {
        const info = getBlock(sel.anchorNode);
        if (info) return;
      }
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      if (sel.rangeCount) {
        const target = findNearestBlock(sel, blocks, blockRefs.current);
        if (target) {
          const el = blockRefs.current[target.blockId];
          if (el?.isConnected) { placeCaret(el, (blocks[target.blockIndex].text || "").length); return; }
        }
      }
      const first = blocks.find(b => isEditableBlock(b));
      if (!first) return;
      const el = blockRefs.current[first.id];
      if (el?.isConnected) placeCaret(el, 0);
    });
  };

  const handleEditorMouseDown = () => {
    mouseIsDown.current = true;
  };

  const handleEditorFocus = () => {
    if (mouseIsDown.current) return;
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const info = getBlock(sel.anchorNode);
        if (info) return;
      }
      const blocks = noteDataRef.current[activeNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      const first = blocks.find(b => isEditableBlock(b));
      if (!first) return;
      const el = blockRefs.current[first.id];
      if (el?.isConnected) placeCaret(el, 0);
    });
  };

  const handleEditorPaste = (e) => {
    const files = e.clipboardData?.files;
    if (files?.length > 0) {
      const imageFile = Array.from(files).find(f => f.type.startsWith("image/"));
      if (imageFile) {
        e.preventDefault();
        const sel = window.getSelection();
        const info = sel?.rangeCount ? getBlock(sel.anchorNode) : null;
        const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
        const afterIndex = info ? info.blockIndex : (blocks.length - 1);
        saveAndInsertImage(activeNote, afterIndex, imageFile);
        return;
      }
    }

    e.preventDefault();
    const htmlData = e.clipboardData.getData("text/html");
    const textData = e.clipboardData.getData("text/plain");
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
        const startBlockId = noteDataRef.current[activeNote].content.blocks[startIdx].id;
        commitNoteData(prev => {
          const next = { ...prev };
          const n = { ...next[activeNote] };
          const blks = [...n.content.blocks];
          blks[startIdx] = { ...blks[startIdx], text: beforeText + pastedMd + afterText };
          blks.splice(startIdx + 1, endIdx - startIdx);
          n.content = { ...n.content, blocks: blks };
          next[activeNote] = n;
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
  };

  const handleEditorDragOver = (e) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleEditorDrop = (e) => {
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    const imageFile = Array.from(files).find(f => f.type.startsWith("image/"));
    if (!imageFile) return;
    e.preventDefault();
    const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
    let afterIndex = blocks.length - 1;
    if (editorRef.current) {
      let closestIdx = blocks.length - 1;
      let closestDist = Infinity;
      for (let i = 0; i < blocks.length; i++) {
        const el = blockRefs.current[blocks[i].id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(e.clientY - (rect.top + rect.bottom) / 2);
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
      }
      afterIndex = closestIdx;
    }
    saveAndInsertImage(activeNote, afterIndex, imageFile);
  };

  return {
    handleEditorKeyDown, handleEditorInput,
    handleEditorMouseUp, handleEditorMouseDown, handleEditorFocus,
    handleEditorPaste, handleEditorDragOver, handleEditorDrop,
    executeSlashCommand,
  };
}
