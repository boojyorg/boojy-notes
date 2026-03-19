import { useCallback } from "react";
import { findNearestBlock, isEditableBlock, placeCaret } from "../../utils/domHelpers";
import { sanitizeInlineHtml, htmlToInlineMarkdown } from "../../utils/inlineFormatting";
import { genBlockId } from "../../utils/storage";
import { SLASH_COMMANDS } from "../../constants/data";

export function useKeyboardHandlers({
  noteDataRef,
  activeNoteRef,
  blockRefs,
  editorRef,
  commitNoteData,
  focusBlockId,
  focusCursorPos,
  slashMenuRef,
  setSlashMenu,
  wikilinkMenuRef,
  syncGeneration,
  updateBlockText,
  insertBlockAfter,
  deleteBlock,
  reReadBlockFromDom,
  toggleInlineCode,
  applyFormat,
  onOpenLinkEditor,
  updateBlockIndent,
  getBlock,
  executeSlashCommand,
  handleBlockInput: _handleBlockInput,
}) {
  // --- Block keyboard handler ---
  const handleBlockKeyDown = useCallback((noteId, blockIndex, e) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    const el = blockRefs.current[block.id];
    if (!el) return;

    // Slash menu navigation
    if (slashMenuRef.current && slashMenuRef.current.blockIndex === blockIndex) {
      const sm = slashMenuRef.current;
      const filtered = SLASH_COMMANDS.filter((c) =>
        c.label.toLowerCase().includes(sm.filter.toLowerCase()),
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashMenu((prev) =>
          prev
            ? { ...prev, selectedIndex: Math.min(prev.selectedIndex + 1, filtered.length - 1) }
            : null,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashMenu((prev) =>
          prev ? { ...prev, selectedIndex: Math.max(prev.selectedIndex - 1, 0) } : null,
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filtered.length > 0)
          executeSlashCommand(noteId, blockIndex, filtered[sm.selectedIndex] || filtered[0]);
        setSlashMenu(null);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashMenu(null);
        return;
      }
    }

    // Wikilink menu — prevent Enter from inserting a newline (WikilinkMenu handles it via window listener)
    if (wikilinkMenuRef.current && wikilinkMenuRef.current.blockIndex === blockIndex) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape") {
        e.preventDefault();
        return;
      }
    }

    // Tab / Shift+Tab — indent / outdent block
    if (e.key === "Tab") {
      if (block.type === "code" || block.type === "table") return;
      e.preventDefault();
      const INDENTABLE = ["bullet", "numbered", "checkbox", "blockquote", "p", "h1", "h2", "h3"];
      if (!INDENTABLE.includes(block.type)) return;
      updateBlockIndent(noteId, blockIndex, e.shiftKey ? -1 : 1);
      return;
    }

    const text = el
      ? htmlToInlineMarkdown(sanitizeInlineHtml(el.innerHTML)).replace(/\n$/, "")
      : "";

    // Enter — split block
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const blockType = blocks[blockIndex].type;
      const isList =
        blockType === "bullet" ||
        blockType === "checkbox" ||
        blockType === "numbered" ||
        blockType === "blockquote";

      if (isList && text.trim() === "") {
        // If indented, decrease indent instead of converting to paragraph
        if ((block.indent || 0) > 0) {
          updateBlockIndent(noteId, blockIndex, -1);
          focusCursorPos.current = 0;
          return;
        }
        el.innerHTML = "<br>";
        commitNoteData((prev) => {
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
      insertBlockAfter(noteId, blockIndex, isList ? blockType : "p", afterText, {
        indent: isList ? block.indent || 0 : 0,
      });
    }

    // Backspace
    if (e.key === "Backspace") {
      if (text === "") {
        // If indented, decrease indent instead of deleting
        if ((block.indent || 0) > 0) {
          e.preventDefault();
          updateBlockIndent(noteId, blockIndex, -1);
          focusCursorPos.current = 0;
          return;
        }
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
            // Cursor at position 0: decrease indent if indented
            if ((block.indent || 0) > 0) {
              e.preventDefault();
              updateBlockIndent(noteId, blockIndex, -1);
              focusCursorPos.current = 0;
              return;
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks passed via shared object
  }, []);

  // --- Cross-block key handler ---
  const handleCrossBlockKeyDown = useCallback((e, startInfo, endInfo) => {
    const noteId = activeNoteRef.current;
    const blocks = noteDataRef.current[noteId].content.blocks;
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
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText + afterText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
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
      const isList =
        startType === "bullet" ||
        startType === "checkbox" ||
        startType === "numbered" ||
        startType === "blockquote";
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        const newBlock = { id: newBlockId, type: isList ? startType : "p", text: afterText };
        if (startType === "checkbox") newBlock.checked = false;
        blks.splice(startIdx + 1, 0, newBlock);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      syncGeneration.current++;
      focusBlockId.current = newBlockId;
      focusCursorPos.current = 0;
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks[startIdx] = { ...blks[startIdx], text: beforeText + e.key + afterText };
        blks.splice(startIdx + 1, endIdx - startIdx);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      syncGeneration.current++;
      focusBlockId.current = startBlockId;
      focusCursorPos.current = beforeText.length + e.key.length;
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks
  }, []);

  // --- Editor wrapper keydown handler ---
  const handleEditorKeyDown = useCallback((e) => {
    const currentNote = activeNoteRef.current;
    const sel = window.getSelection();
    if (!sel.rangeCount) {
      const blocks = noteDataRef.current[currentNote]?.content?.blocks;
      if (blocks && blocks.length > 0) {
        const first = blocks.find((b) => isEditableBlock(b));
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
    if (mod && e.shiftKey && (e.key === "S" || e.key === "s")) {
      e.preventDefault();
      applyFormat("strikethrough");
      return;
    }
    if (mod && e.shiftKey && (e.key === "H" || e.key === "h")) {
      e.preventDefault();
      applyFormat("highlight");
      return;
    }
    if (mod && (e.key === "k" || e.key === "K") && !e.shiftKey) {
      e.preventDefault();
      if (onOpenLinkEditor) onOpenLinkEditor();
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
      const blocks = noteDataRef.current[currentNote]?.content?.blocks;
      if (!blocks || blocks.length === 0) return;
      const target = findNearestBlock(sel, blocks, blockRefs.current);
      if (!target) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        insertBlockAfter(currentNote, target.blockIndex, "p", "");
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
    handleBlockKeyDown(currentNote, info.blockIndex, e);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks
  }, []);

  return { handleBlockKeyDown, handleCrossBlockKeyDown, handleEditorKeyDown };
}
