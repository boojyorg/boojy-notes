import { useCallback } from "react";
import {
  findNearestBlock,
  isEditableBlock,
  isSelectableBlock,
  placeCaret,
} from "../../utils/domHelpers";

/**
 * Where Backspace at the start of a block, or ArrowUp from its first line,
 * lands: the nearest block above that holds a caret or is selected as a whole
 * (a divider or an image). -1 at the top. Blocks that are neither (code,
 * table, callout, file) are stepped over as before.
 */
function landingBefore(blocks, index) {
  let i = index - 1;
  while (i >= 0 && !isEditableBlock(blocks[i]) && !isSelectableBlock(blocks[i])) i--;
  return i;
}

/** The ArrowDown counterpart of landingBefore. -1 at the bottom. */
function landingAfter(blocks, index) {
  let i = index + 1;
  while (i < blocks.length && !isEditableBlock(blocks[i]) && !isSelectableBlock(blocks[i])) i++;
  return i < blocks.length ? i : -1;
}
import { sanitizeInlineHtml, htmlToInlineMarkdown } from "../../utils/inlineFormatting";
import { genBlockId } from "../../utils/storage";
import { filterSlashCommands } from "../../constants/data";

/** Blocks whose Markdown may span lines, so Shift+Enter puts a soft break inside them. */
const SOFT_BREAK_TYPES = new Set(["p", "bullet", "numbered", "checkbox", "blockquote"]);

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
  moveBlock,
  selectBlock,
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
      // Same helper the menu renders from — arrowing must never index a
      // different list than the one on screen.
      const filtered = filterSlashCommands(sm.filter);
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
      // Indent is a LIST-ONLY feature: markdown's nested-list syntax can express
      // indented bullets/numbered/checkboxes, but it has no clean way to indent a
      // paragraph/heading/blockquote — so indenting those was silently lost on
      // save (round-trip data loss). Per the markdown-source-of-truth constraint
      // (docs/SPEC-markdown-source-of-truth.md): if it can't round-trip, we don't
      // ship it. The round-trip test (tests/utils/markdown.test.js) guards this.
      const INDENTABLE = ["bullet", "numbered", "checkbox"];
      if (!INDENTABLE.includes(block.type)) return;
      updateBlockIndent(noteId, blockIndex, e.shiftKey ? -1 : 1);
      return;
    }

    // Cmd/Ctrl+Shift+ArrowUp/Down — move the current block up/down. This is the
    // keyboard-accessible equivalent of the pointer hold-drag (useBlockDrag), and
    // the markdown-native "move a line" operation: reordering the block array
    // re-serialises to clean markdown losslessly (docs/SPEC-markdown-source-of-truth.md).
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const target = blockIndex + (e.key === "ArrowUp" ? -1 : 1);
      // Boundary: nothing to move into — bail without committing a no-op history step.
      if (target < 0 || target >= blocks.length) return;
      moveBlock(noteId, blockIndex, target);
      return;
    }

    const text = el
      ? htmlToInlineMarkdown(sanitizeInlineHtml(el.innerHTML)).replace(/\n$/, "")
      : "";

    // Shift+Enter — a line break inside the block, never a new block. Chromium
    // inserts the <br> and fires `input`, so the ordinary commit path stores
    // it as a newline in the block's text: a conventional soft break on disk.
    // Headings have no second line in Markdown, so there Shift+Enter is Enter.
    if (e.key === "Enter" && e.shiftKey && SOFT_BREAK_TYPES.has(blocks[blockIndex].type)) {
      e.preventDefault();
      document.execCommand?.("insertLineBreak");
      return;
    }

    // Enter — split block
    if (e.key === "Enter") {
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
        const prevIdx = landingBefore(blocks, blockIndex);
        if (prevIdx >= 0 && isSelectableBlock(blocks[prevIdx])) {
          // A divider or image above: select it rather than stepping over it.
          // The next Backspace removes it; this empty row stays until then.
          selectBlock(blocks[prevIdx].id);
          return;
        }
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
            const prevIdx = landingBefore(blocks, blockIndex);
            if (prevIdx >= 0 && isSelectableBlock(blocks[prevIdx])) {
              // Never merge text across a divider or image the user can see:
              // select it, and let the next Backspace remove it.
              e.preventDefault();
              selectBlock(blocks[prevIdx].id);
              return;
            }
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
            const prevIdx = landingBefore(blocks, blockIndex);
            if (prevIdx >= 0 && isSelectableBlock(blocks[prevIdx])) {
              selectBlock(blocks[prevIdx].id);
            } else if (prevIdx >= 0) {
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
          const nextIdx = landingAfter(blocks, blockIndex);
          if (nextIdx >= 0) {
            e.preventDefault();
            if (isSelectableBlock(blocks[nextIdx])) {
              selectBlock(blocks[nextIdx].id);
            } else {
              const nextEl = blockRefs.current[blocks[nextIdx].id];
              if (nextEl) placeCaret(nextEl, 0);
            }
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
