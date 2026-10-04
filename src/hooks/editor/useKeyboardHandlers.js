import { useCallback } from "react";
import {
  caretLength,
  caretOffsetAt,
  caretOnEmptyLastLine,
  caretRect,
  findNearestBlock,
  focusOwnedField,
  hasOwnField,
  isEditableBlock,
  isSelectableBlock,
  placeCaret,
  focusTitleEnd,
  focusBeyondNote,
  caretLandingAfter,
  caretLandingBefore,
  isBlockJump,
  landing,
  landingBefore,
} from "../../utils/domHelpers";
import { inlineFieldFor, inlineFormatForKey } from "../../utils/inlineFormatCommands";

import { sanitizeInlineHtml, htmlToInlineMarkdown } from "../../utils/inlineFormatting";
import {
  LIST_TYPES,
  SOFT_BREAK_TYPES,
  markdownAfter,
  markdownBefore,
} from "../../utils/crossBlockEdit";
import { SLASH_COMMANDS, filterSlashCommands } from "../../constants/data";
import { bareFenceLang, bareTableColumns, isBareDivider } from "../../utils/blockTriggers";
import { reorderFloor } from "../../utils/blockOrder";
import { measureBlockPlaces, settleBlocks } from "../../utils/blockSettle";
import { stepIndex } from "../../utils/menuKeys";
import { editBlocks } from "../../utils/editBlocks";

/**
 * Blocks a Backspace at their start turns into a plain paragraph before it
 * does anything else (Notion's rule, and Obsidian's in effect, where the key
 * deletes the `### `): the text and the caret stay, only the kind goes. A
 * second Backspace then merges or reaches across as a paragraph's would.
 */
const DEMOTES_TO_PARAGRAPH = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "bullet",
  "numbered",
  "checkbox",
  "blockquote",
]);

/** A text root that sits inside a row beside its marker (a list item, a task). */
function inRow(el) {
  return !!el && el.closest("[data-block-id]") !== el;
}

/** Where a caret lands at the end of a block: its visible length, never its Markdown's. */
function endOffset(blockRefs, block) {
  const el = blockRefs.current[block.id];
  return el ? caretLength(el) : (block.text || "").length;
}

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
  openCodeBlock,
  openDivider,
  deleteBlock,
  applyFormat,
  scopeOf,
  updateBlockIndent,
  indentBlockRange,
  moveBlock,
  selectBlock,
  selectBlockRun,
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
      // The menus' one arrow rule (utils/menuKeys.ts): wrap at the ends.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        setSlashMenu((prev) =>
          prev && filtered.length
            ? { ...prev, selectedIndex: stepIndex(prev.selectedIndex, dir, filtered.length) }
            : prev,
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
      // Anywhere else Tab leaves the note, as it does any text field; Shift+Tab
      // goes back to its name. Swallowing it (Notion's way) was a keyboard trap.
      const INDENTABLE = ["bullet", "numbered", "checkbox"];
      if (!INDENTABLE.includes(block.type)) {
        focusBeyondNote(e.shiftKey ? -1 : 1);
        return;
      }
      updateBlockIndent(noteId, blockIndex, e.shiftKey ? -1 : 1, true);
      return;
    }

    // Cmd/Ctrl+Shift+ArrowUp/Down — move the current block up/down. This is the
    // keyboard-accessible equivalent of the pointer hold-drag (useBlockDrag), and
    // the markdown-native "move a line" operation: reordering the block array
    // re-serialises to clean markdown losslessly (docs/SPEC-markdown-source-of-truth.md).
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const target = blockIndex + (e.key === "ArrowUp" ? -1 : 1);
      // Boundary: nothing to move into — bail without committing a no-op history
      // step. The top is the reorder floor: frontmatter is the file's head, and
      // the first block under it is the first block there is to move.
      if (target < reorderFloor(blocks) || target >= blocks.length) return;
      // The two blocks trade places by gliding, as a dropped block settles.
      const places = measureBlockPlaces(editorRef.current);
      moveBlock(noteId, blockIndex, target);
      settleBlocks(editorRef.current, places);
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

      // A marker on its own line opens its block on Enter as well as on the
      // space: ```js then Enter is the motion every Markdown
      // editor teaches, and Enter on a bare `---` or `|||` must not leave a
      // paragraph that the next open reads as the block anyway. Paragraphs
      // only — Enter inside a list item means a new item, and hijacking it
      // there would be a surprise.
      if (blockType === "p") {
        const fenceLang = bareFenceLang(text);
        if (fenceLang !== null) {
          el.innerHTML = "<br>";
          openCodeBlock(noteId, blockIndex, fenceLang);
          return;
        }
        if (isBareDivider(text)) {
          el.innerHTML = "<br>";
          openDivider(noteId, blockIndex);
          return;
        }
        const columns = bareTableColumns(text);
        if (columns !== null) {
          el.innerHTML = "<br>";
          const command = SLASH_COMMANDS.find((c) => c.id === "table");
          if (command) executeSlashCommand(noteId, blockIndex, command, { columns });
          return;
        }
      }

      // A quote continues on Enter (Obsidian's and Notion's quote): the new
      // line stays inside the same block, as Shift+Enter puts it. The file
      // could never tell the two apart, since adjacent quote blocks are
      // written line under line and read back as one, so splitting into a
      // second block only ever showed a second bar until the note was
      // reopened. Enter on an empty line at the quote's end leaves it for a
      // paragraph, the way an empty list item does.
      if (blockType === "blockquote") {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        if (!caretOnEmptyLastLine(el, sel.getRangeAt(0))) {
          document.execCommand?.("insertLineBreak");
          return;
        }
        // `text` has the empty last line already dropped (the read-back
        // ignores the root's final <br> and the trailing newline is stripped).
        if (text === "") {
          el.innerHTML = "<br>";
          commitNoteData(
            editBlocks(noteId, (blks) => {
              blks[blockIndex] = { ...blks[blockIndex], type: "p", text: "" };
            }),
          );
          focusBlockId.current = blocks[blockIndex].id;
          focusCursorPos.current = 0;
          return;
        }
        updateBlockText(noteId, blockIndex, text);
        syncGeneration.current++;
        insertBlockAfter(noteId, blockIndex, "p", "");
        return;
      }

      if (isList && text.trim() === "") {
        // If indented, decrease indent instead of converting to paragraph
        if ((block.indent || 0) > 0) {
          updateBlockIndent(noteId, blockIndex, -1);
          focusCursorPos.current = 0;
          return;
        }
        el.innerHTML = "<br>";
        commitNoteData(
          editBlocks(noteId, (blks) => {
            const updated = { ...blks[blockIndex], type: "p", text: "" };
            delete updated.checked;
            blks[blockIndex] = updated;
          }),
        );
        focusBlockId.current = blocks[blockIndex].id;
        focusCursorPos.current = 0;
        return;
      }

      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Enter at the start of a heading that holds text opens a paragraph
      // above it and leaves the heading where it is, caret and all, where the
      // split below would make the empty half the heading.
      if (
        /^h[1-6]$/.test(blockType) &&
        text !== "" &&
        range.collapsed &&
        caretOffsetAt(el, range.startContainer, range.startOffset) === 0
      ) {
        insertBlockAfter(noteId, blockIndex - 1, "p", "");
        focusBlockId.current = block.id;
        focusCursorPos.current = 0;
        return;
      }

      let beforeText = markdownBefore(el, range.startContainer, range.startOffset);
      let afterText = markdownAfter(el, range.endContainer, range.endOffset);
      // A split on a soft break's edge spends the break: Enter at the end of
      // a line, or at the start of the one after it, is the new block's
      // boundary, not a newline left at the head or tail of either half.
      if (afterText.startsWith("\n")) afterText = afterText.slice(1);
      else if (beforeText.endsWith("\n")) beforeText = beforeText.slice(0, -1);
      updateBlockText(noteId, blockIndex, beforeText);
      syncGeneration.current++;
      insertBlockAfter(noteId, blockIndex, isList ? blockType : "p", afterText, {
        indent: isList ? block.indent || 0 : 0,
      });
    }

    // Backspace
    if (e.key === "Backspace") {
      // At the very start of a heading, list item, quote or task (outdented):
      // become a paragraph first. The caret and the text stay put.
      if (DEMOTES_TO_PARAGRAPH.has(block.type) && !(block.indent > 0)) {
        const sel = window.getSelection();
        const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
        if (range?.collapsed && caretOffsetAt(el, range.startContainer, range.startOffset) === 0) {
          e.preventDefault();
          commitNoteData(
            editBlocks(noteId, (blks) => {
              // Only the id and the text survive: a heading's source spacing, a
              // list's marker and number, a task's tick all belonged to the kind.
              blks[blockIndex] = { id: block.id, type: "p", text };
            }),
          );
          focusBlockId.current = block.id;
          focusCursorPos.current = 0;
          return;
        }
      }
      if (text === "") {
        // If indented, decrease indent instead of deleting
        if ((block.indent || 0) > 0) {
          e.preventDefault();
          updateBlockIndent(noteId, blockIndex, -1);
          focusCursorPos.current = 0;
          return;
        }
        // The only block, and empty: nothing to merge into, and Chromium
        // must not have the key. Its own Backspace on a lone `<p><br></p>`
        // at the root's start removes the paragraph element itself while state
        // still holds one block, and typing goes nowhere.
        e.preventDefault();
        if (blocks.length <= 1) return;
        const prevIdx = landingBefore(blocks, blockIndex);
        if (prevIdx >= 0 && isSelectableBlock(blocks[prevIdx])) {
          // A divider, image or table above: this empty row goes and the
          // block is selected, in one press, so what the next Backspace will
          // remove is on screen.
          const target = blocks[prevIdx].id;
          // The caret needs somewhere to rest while the block is selected
          // (a printable key deselects and types there): the nearest text
          // below, else above. It is not drawn meanwhile.
          let rest = landing(blocks, blockIndex, 1, isEditableBlock);
          if (rest < 0) rest = landing(blocks, blockIndex, -1, isEditableBlock);
          if (rest >= 0) {
            focusBlockId.current = blocks[rest].id;
            focusCursorPos.current = rest > blockIndex ? 0 : endOffset(blockRefs, blocks[rest]);
          }
          deleteBlock(noteId, blockIndex);
          selectBlock(target);
          return;
        }
        if (prevIdx >= 0) {
          focusBlockId.current = blocks[prevIdx].id;
          focusCursorPos.current = endOffset(blockRefs, blocks[prevIdx]);
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
              // The seam in visible characters: `**bold**` is four fewer than
              // its Markdown, and the caret landed that far into the moved text.
              const cursorPos = endOffset(blockRefs, prevBlock);
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

    // Option+Up/Down (Ctrl off the Mac, Word's keys): block by block, to a
    // block's start, as a Mac moves by paragraph; a block is the paragraph
    // here, its soft breaks included. Up from inside a block goes to its own
    // start first. It lands where the plain arrows do: into a field's start,
    // onto a divider or image, past the last block to the end of this one,
    // past the first to the note's name.
    if (isBlockJump(e)) {
      e.preventDefault();
      const up = e.key === "ArrowUp";
      const sel = window.getSelection();
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      if (up && range && caretOffsetAt(el, range.startContainer, range.startOffset) > 0) {
        placeCaret(el, 0);
        return;
      }
      const idx = up
        ? caretLandingBefore(blocks, blockIndex)
        : caretLandingAfter(blocks, blockIndex);
      if (idx < 0) {
        if (up) focusTitleEnd();
        else placeCaret(el, caretLength(el));
        return;
      }
      const target = blocks[idx];
      if (hasOwnField(target)) focusOwnedField(editorRef.current, target.id, "start");
      else if (isSelectableBlock(target)) selectBlock(target.id);
      else {
        const targetEl = blockRefs.current[target.id];
        if (targetEl) placeCaret(targetEl, 0);
      }
      return;
    }

    // Shift+ArrowUp/Down extend the selection, and that is the browser's: the
    // editor is one contentEditable, so Chromium carries a selection across
    // block roots itself. The block navigation below moves a caret, and run
    // for a Shift press it would collapse the selection.
    if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;

    // Arrow up
    if (e.key === "ArrowUp") {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // `caretRect`, never the range's own: a collapsed caret in an empty
        // paragraph has no rect at all, and this question is asked of it.
        const rect = caretRect(range, el);
        const elRect = el.getBoundingClientRect();
        if (rect.top - elRect.top < 5) {
          e.preventDefault();
          const prevIdx = caretLandingBefore(blocks, blockIndex);
          if (prevIdx < 0) {
            // Nothing above to land in (the first block, or only frontmatter
            // above it): up goes to the note's name, caret at its end, as
            // Enter and ArrowDown there come back down. The name lives in the
            // chrome row's path band, not above the editor.
            focusTitleEnd();
          } else if (hasOwnField(blocks[prevIdx])) {
            // The arrows walk into a block that keeps its own field rather
            // than stopping on it: arriving from below lands at its end —
            // a table's last row, a code block's last line.
            focusOwnedField(editorRef.current, blocks[prevIdx].id, "end");
          } else if (isSelectableBlock(blocks[prevIdx])) {
            selectBlock(blocks[prevIdx].id);
          } else {
            const prevEl = blockRefs.current[blocks[prevIdx].id];
            if (prevEl) placeCaret(prevEl, endOffset(blockRefs, blocks[prevIdx]));
          }
        }
      }
    }

    // Arrow down
    if (e.key === "ArrowDown") {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        const rect = caretRect(range, el);
        const elRect = el.getBoundingClientRect();
        if (elRect.bottom - rect.bottom < 5) {
          const nextIdx = caretLandingAfter(blocks, blockIndex);
          if (nextIdx >= 0) {
            e.preventDefault();
            if (hasOwnField(blocks[nextIdx])) {
              // Into its first field: a table's first cell, a code block's
              // first line. The arrows then walk it.
              focusOwnedField(editorRef.current, blocks[nextIdx].id);
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

    // ArrowLeft at a block's start and ArrowRight at its end, where a list row
    // is on either side of the step. Chromium's own move stops in the row
    // beside the marker, outside the item's text, where the next character
    // typed would never reach the file. The step lands where
    // ArrowUp and ArrowDown would, at the neighbour's near edge; between two
    // paragraphs the browser's move is already right and is left alone.
    if (
      (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      const sel = window.getSelection();
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      if (!range?.collapsed) return;
      const back = e.key === "ArrowLeft";
      const offset = caretOffsetAt(el, range.startContainer, range.startOffset);
      if (offset !== (back ? 0 : caretLength(el))) return;
      const idx = back
        ? caretLandingBefore(blocks, blockIndex)
        : caretLandingAfter(blocks, blockIndex);
      const target = idx >= 0 ? blocks[idx] : null;
      const targetEl = target ? blockRefs.current[target.id] : null;
      if (!inRow(el) && !(target && isEditableBlock(target) && inRow(targetEl))) return;
      e.preventDefault();
      if (!target) return;
      if (hasOwnField(target)) {
        focusOwnedField(editorRef.current, target.id, back ? "end" : "start");
      } else if (isSelectableBlock(target)) {
        selectBlock(target.id);
      } else if (targetEl) {
        placeCaret(targetEl, back ? endOffset(blockRefs, target) : 0);
      }
    }
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks passed via shared object
  }, []);

  // --- Editor wrapper keydown handler ---
  const handleEditorKeyDown = useCallback((e) => {
    // A key a menu has already consumed is not the editor's to handle. The
    // tag and wikilink menus take Enter, the arrows and Escape in a
    // capture-phase window listener and prevent the default; without this
    // the editor's Enter would split the block instead of completing the tag.
    // One rule
    // for every menu, in place of a per-menu guard.
    if (e.defaultPrevented) return;
    // A block that keeps its own field owns every key pressed in it. The field
    // is the active element and the editor root is only what the event bubbles
    // through, so acting here means acting on the document selection — which,
    // while a textarea has focus, is stale or empty: an arrow would take focus
    // out of a code block, and a letter would land in another block.
    const active = document.activeElement;
    if (active && active !== editorRef.current && editorRef.current?.contains(active)) {
      // One exception, and only for an inline format: a field that holds
      // Markdown (a table cell, a callout's body) has the document selection
      // inside itself, so `applyFormat` can act on it — and it is the one
      // applier, which is what keeps the toolbar's pressed glyph right whether
      // the format came from the strip or the keyboard. The field commits the
      // result itself. Chromium's own Cmd+B must not run instead: it decides
      // from the computed style, so in a header cell (600) it writes a
      // `font-weight: normal` span the walker reads as plain text. A code block's textarea is not such a
      // field; there the selection really is stale and the key is dropped.
      const fieldFormat = inlineFieldFor(active, editorRef.current) ? inlineFormatForKey(e) : null;
      if (fieldFormat) {
        e.preventDefault();
        applyFormat(fieldFormat);
      }
      return;
    }
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

    // Escape in the text selects the block the caret is in, or every block a
    // selection touches: the keyboard's way to whole-block selection (the
    // grip is the pointer's). Whatever else is open under the caret closes
    // first: a menu prevents the key, and the slash menu is closed below.
    if (
      e.key === "Escape" &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !slashMenuRef.current
    ) {
      const start = getBlock(range.startContainer);
      const end = getBlock(range.endContainer) || start;
      if (start) {
        e.preventDefault();
        sel.collapse(range.endContainer, range.endOffset);
        selectBlockRun(start.blockId, end.blockId);
        return;
      }
    }

    // Inline formatting goes through applyFormat, which knows which block
    // roots the selection touches and formats each of them within itself. The
    // key map lives in `inlineFormatCommands`, where a field reads the same one.
    const format = inlineFormatForKey(e);
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
    // navigation key collapses the selection natively. Tab never leaves the
    // editor from here: across roots it moves the list items the range
    // touches a level, the range staying for the next press.
    const scope = scopeOf(range);
    if (scope.kind === "block" && !isEditableBlock(getBlockAt(scope.start.blockIndex))) return;
    if (scope.kind === "cross" || (scope.kind === "outside" && !range.collapsed)) {
      if (e.key === "Tab") {
        e.preventDefault();
        if (scope.kind === "cross" && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const delta = e.shiftKey ? -1 : 1;
          indentBlockRange(currentNote, scope.start.blockIndex, scope.end.blockIndex, delta);
        }
      }
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
