import { useCallback } from "react";
import {
  findNearestBlock,
  isEditableBlock,
  isSelectableBlock,
  ownedField,
  placeCaret,
} from "../../utils/domHelpers";

/**
 * Where Backspace at the start of a block, or ArrowUp from its first line,
 * lands: the nearest block above that holds a caret or is addressed as a whole
 * (a divider, an image, a table). -1 at the top. Blocks that are neither
 * (code, callout, file) are stepped over as before.
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
import {
  LIST_TYPES,
  SOFT_BREAK_TYPES,
  markdownAfter,
  markdownBefore,
} from "../../utils/crossBlockEdit";
import { filterSlashCommands } from "../../constants/data";

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
  tagMenuRef,
  setTagMenu,
  syncGeneration,
  updateBlockText,
  insertBlockAfter,
  deleteBlock,
  applyFormat,
  scopeOf,
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
      // The tag menu belongs to the `#…` token under the caret. It leaves
      // Enter to the editor when the tag is already complete, and the caret
      // is about to leave the block; without this the menu stayed open over
      // the old block and its next Enter completed into it.
      if (tagMenuRef?.current) setTagMenu(null);
      const blockType = blocks[blockIndex].type;
      const isList = LIST_TYPES.has(blockType);

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
      const beforeText = markdownBefore(el, range.startContainer, range.startOffset);
      const afterText = markdownAfter(el, range.endContainer, range.endOffset);
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
            if (prevIdx >= 0 && blocks[prevIdx].type === "table") {
              // The arrows walk a table's cells rather than stopping on it:
              // arriving from below lands in its last row.
              ownedField(editorRef.current, blocks[prevIdx].id, "end")?.focus();
            } else if (prevIdx >= 0 && isSelectableBlock(blocks[prevIdx])) {
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
            if (blocks[nextIdx].type === "table") {
              // Into the first cell; the arrows then walk the grid.
              ownedField(editorRef.current, blocks[nextIdx].id)?.focus();
            } else if (isSelectableBlock(blocks[nextIdx])) {
              selectBlock(blocks[nextIdx].id);
            } else {
              const nextEl = blockRefs.current[blocks[nextIdx].id];
              if (nextEl) placeCaret(nextEl, 0);
            }
          }
        }
      }
    }
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks passed via shared object
  }, []);

  // --- Editor wrapper keydown handler ---
  const handleEditorKeyDown = useCallback((e) => {
    // A key a menu has already consumed is not the editor's to handle. The
    // tag and wikilink menus take Enter, the arrows and Escape in a
    // capture-phase window listener and prevent the default; without this
    // the editor's own Enter handler still ran on the DOM text and split the
    // block instead of completing the tag (review 2026-09-06, H3). One rule
    // for every menu, in place of a per-menu guard.
    if (e.defaultPrevented) return;
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
    const getBlockAt = (i) => noteDataRef.current[currentNote]?.content?.blocks?.[i];

    // Inline formatting goes through applyFormat, which knows which block
    // roots the selection touches and formats each of them within itself.
    const mod = e.ctrlKey || e.metaKey;
    const format = !mod
      ? null
      : e.shiftKey
        ? { S: "strikethrough", s: "strikethrough", H: "highlight", h: "highlight" }[e.key]
        : { b: "bold", i: "italic", "`": "code", k: "link", K: "link" }[e.key];
    if (format) {
      e.preventDefault();
      applyFormat(format);
      return;
    }

    // Which block roots the selection touches decides who handles the key.
    // Inside one text block: the handlers below. Inside a block that owns
    // itself (a table cell, a callout field): that block, not the editor.
    // Across roots, or with one end outside every root: nothing here. An
    // edit key becomes a beforeinput that useCrossBlockEdit owns, and a
    // navigation key collapses the selection natively; Tab is swallowed so
    // focus does not leave the editor.
    const scope = scopeOf(range);
    if (scope.kind === "block" && !isEditableBlock(getBlockAt(scope.start.blockIndex))) return;
    if (scope.kind === "cross" || (scope.kind === "outside" && !range.collapsed)) {
      if (e.key === "Tab") e.preventDefault();
      return;
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
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks
  }, []);

  return { handleBlockKeyDown, handleEditorKeyDown };
}
