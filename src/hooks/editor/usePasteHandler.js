import { useCallback } from "react";
import { isEditableBlock, placeCaret } from "../../utils/domHelpers";
import {
  sanitizeInlineFragment,
  sanitizeInlineHtml,
  htmlToInlineMarkdown,
  inlineMarkdownToHtml,
  stripMarkdownFormatting,
} from "../../utils/inlineFormatting";
import { genBlockId } from "../../utils/storage";
import { markdownToBlocks } from "../../utils/markdown";
import { markdownAfter, markdownBefore } from "../../utils/crossBlockEdit";
import {
  buildPastedBlocks,
  isStructuredMarkdownLine,
  isTextBlockType,
  stripIncidentalLineEnding,
} from "../../utils/pasteBlocks";

export function usePasteHandler({
  noteDataRef,
  noteTitleSetRef,
  activeNoteRef,
  blockRefs,
  commitNoteData,
  focusBlockId,
  focusCursorPos,
  syncGeneration,
  saveAndInsertImage,
  reReadBlockFromDom,
  getBlock,
  scopeOf,
  ownEdit,
}) {
  /**
   * Paint a destination block that survived the paste with the same id and
   * type. The editor skips React renders for text-only changes (the page
   * already has the text while typing), so a paste that only changes a
   * block's text would otherwise reach state and disk but never the page,
   * and the next keystroke would read the stale page back over it.
   */
  const repaintKeptBlock = (currentBlock, newBlocks) => {
    const kept = newBlocks.find((b) => b.id === currentBlock.id);
    if (!kept || kept.type !== currentBlock.type || !isTextBlockType(kept.type)) return;
    const el = blockRefs.current[kept.id];
    if (!el) return;
    el.innerHTML = kept.text ? inlineMarkdownToHtml(kept.text, noteTitleSetRef?.current) : "<br>";
  };

  const handleEditorPaste = useCallback((e) => {
    const currentNote = activeNoteRef.current;
    const blocks = noteDataRef.current[currentNote]?.content?.blocks || [];
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const scope = range ? scopeOf(range) : null;
    const ownsItself = (point) => !!point && !isEditableBlock(blocks[point.blockIndex]);
    // A block that owns its own field (a code block's textarea, a table
    // cell, a callout) keeps its native paste; the editor keeps out.
    if (scope?.kind === "block" && ownsItself(scope.start)) return;

    const files = e.clipboardData?.files;
    if (files?.length > 0) {
      const afterIndex = scope?.start ? scope.start.blockIndex : blocks.length - 1;
      const allFiles = Array.from(files);
      const imageFile = allFiles.find((f) => f.type.startsWith("image/"));
      e.preventDefault();
      if (imageFile) {
        saveAndInsertImage(currentNote, afterIndex, imageFile);
        return;
      }
      for (const file of allFiles) {
        saveAndInsertImage(currentNote, afterIndex, file);
      }
      return;
    }

    // Text lands in one text block, or in a run of them, or nowhere. With no
    // caret in any block, or a selection reaching outside every block, there
    // is nothing to paste into; a selection reaching from a text block into
    // a block that owns itself is refused. Neither is left to Chromium.
    e.preventDefault();
    if (!scope || scope.kind === "outside") return;
    const crossing = scope.kind === "cross";
    if (ownsItself(scope.start) || ownsItself(scope.end)) return;

    // One terminal line ending is incidental (copying a whole line brings its
    // break along); strip it so a one-line copy pastes inline.
    const textData = stripIncidentalLineEnding(e.clipboardData.getData("text/plain"));

    // Smart paste: URL over selected text → create markdown link. Across
    // blocks a link cannot span the selection, so the URL replaces it.
    if (/^https?:\/\/\S+$/.test(textData.trim())) {
      const url = textData.trim();
      if (crossing) {
        ownEdit(scope, { kind: "insertText", text: url }, range);
        return;
      }
      if (!sel.isCollapsed) {
        // Selection exists: wrap selected text as [text](url)
        const selectedText = sel.toString();
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

    // Where a block-level paste lands: the start block keeps its Markdown
    // before the selection, the end block its Markdown after, and every
    // block between goes with the selection.
    const startIdx = scope.start.blockIndex;
    const deleteCount = scope.end.blockIndex - startIdx;
    const beforeText = markdownBefore(scope.start.el, range.startContainer, range.startOffset);
    const afterText = markdownAfter(scope.end.el, range.endContainer, range.endOffset);
    const currentBlock = blocks[startIdx];

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
        const {
          blocks: newBlocks,
          focusId,
          focusPos,
        } = buildPastedBlocks(currentBlock, pastedBlocks, beforeText, afterText, genBlockId);

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
        repaintKeptBlock(currentBlock, newBlocks);
        focusBlockId.current = focusId;
        focusCursorPos.current = focusPos;
        // Re-place cursor after React re-render mounts the new block
        const deferredId = focusId;
        const deferredPos = focusPos;
        let attempts = 0;
        const tryPlace = () => {
          const el = blockRefs.current[deferredId];
          if (el && el.isConnected) {
            placeCaret(el, deferredPos);
          } else if (++attempts < 10) {
            requestAnimationFrame(tryPlace);
          }
        };
        requestAnimationFrame(tryPlace);
        return;
      }
    }

    // Multi-line external paste, or a single structured Markdown line landing
    // in an empty block: parse as markdown blocks. A single line anywhere else
    // pastes inline below.
    const caretInEmptyBlock = () => !crossing && scope.start.el.textContent.trim() === "";
    if (textData.includes("\n") || (isStructuredMarkdownLine(textData) && caretInEmptyBlock())) {
      const pastedBlocks = markdownToBlocks(textData);
      if (!pastedBlocks.length) return;
      const {
        blocks: newBlocks,
        focusId,
        focusPos,
      } = buildPastedBlocks(currentBlock, pastedBlocks, beforeText, afterText, genBlockId);

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
      repaintKeptBlock(currentBlock, newBlocks);
      focusBlockId.current = focusId;
      focusCursorPos.current = focusPos;
      {
        const targetId = focusId;
        const targetPos = focusPos;
        let attempts = 0;
        const tryPlace = () => {
          const el = blockRefs.current[targetId];
          if (el && el.isConnected) {
            placeCaret(el, targetPos);
          } else if (++attempts < 10) {
            requestAnimationFrame(tryPlace);
          }
        };
        requestAnimationFrame(tryPlace);
      }
      return;
    }

    // Single-line external paste: inline. Across blocks the app makes the
    // replacement; within one, plain text is Chromium's own insertion and
    // rich text is the app's, the sanitised nodes put in at the caret and the
    // block read back as after a keystroke. `execCommand("insertHTML")` split
    // the line into blocks when the sanitiser returned a wrapper, and rewrote
    // the space beside the insertion into a non-breaking space that reached
    // the file as U+00A0.
    const htmlData = e.clipboardData.getData("text/html");
    if (crossing) {
      const text = htmlData ? htmlToInlineMarkdown(sanitizeInlineHtml(htmlData)) : textData;
      ownEdit(scope, { kind: "insertText", text }, range);
      return;
    }
    if (!htmlData) {
      document.execCommand("insertText", false, textData);
      return;
    }
    const frag = sanitizeInlineFragment(htmlData);
    const last = frag.lastChild;
    if (!last) return;
    range.deleteContents();
    range.insertNode(frag);
    range.setStartAfter(last);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    reReadBlockFromDom();
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks
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
    let endIdx = endInfo.blockIndex;
    if (endIdx > startIdx && endInfo.el) {
      // A triple-click (and some drags) ends at the very start of the next
      // block without selecting any of it; that block is not part of the copy.
      const tail = document.createRange();
      tail.selectNodeContents(endInfo.el);
      tail.setEnd(range.endContainer, range.endOffset);
      if (tail.toString().length === 0) endIdx--;
    }
    // A selection inside one block is a text selection, as in every other
    // editor: it copies as text, not as a block, so pasting the text of a
    // list item onto a blank line gives the text without the list. Structure
    // travels only when the selection spans two or more blocks.
    if (startIdx === endIdx) return;
    const copiedBlocks = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const block = blocks[i];
      const el = blockRefs.current[block.id];
      if (!isEditableBlock(block)) {
        // Preserve non-editable blocks (code, table, callout, image, file) in full
        const entry = { ...block, fullBlock: true };
        delete entry.id;
        copiedBlocks.push(entry);
        continue;
      }
      if (!el) continue;

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
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks
  }, []);

  /**
   * Cut is copy plus the app's own deletion. The copy has to cancel the
   * event to own the clipboard, which cancels Chromium's deletion with it;
   * the removal is then made in state, within one block or across several,
   * so it is never Chromium's to make across roots. A block that owns its
   * field (a table cell, a callout) keeps its native cut.
   */
  const handleEditorCut = useCallback((e) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const scope = scopeOf(range);
    const blocks = noteDataRef.current[activeNoteRef.current]?.content?.blocks || [];
    if (scope.kind === "block" && !isEditableBlock(blocks[scope.start.blockIndex])) return;
    e.preventDefault();
    if (scope.kind === "outside") return;
    handleEditorCopy(e);
    ownEdit(scope, { kind: "delete" }, range);
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks
  }, []);

  return { handleEditorPaste, handleEditorCopy, handleEditorCut };
}
