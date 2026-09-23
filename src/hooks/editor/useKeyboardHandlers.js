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
} from "../../utils/domHelpers";
import { inlineFieldFor, inlineFormatForKey } from "../../utils/inlineFormatCommands";

/**
 * The nearest block in `step`'s direction that `stops` accepts, or -1.
 *
 * Deletion and the arrows want different answers, which is why this takes the
 * rule rather than holding one. **Backspace merges text**, so it may only land
 * where text can go: a code block in its path is stepped over, exactly as
 * before. **The arrows only move the caret**, so they land on a block that
 * keeps a field of its own and walk into it (2026-09-19; a code block and a
 * callout had been stepped over since the table's walk-in was built, so the
 * arrows passed over a code block in both directions and the only ways in were
 * the pointer and the block that made it).
 */
function landing(blocks, index, step, stops) {
  let i = index + step;
  while (i >= 0 && i < blocks.length && !stops(blocks[i])) i += step;
  return i >= 0 && i < blocks.length ? i : -1;
}

/** Text or a whole-block neighbour: where a merge or a removal may land. */
const takesText = (b) => isEditableBlock(b) || isSelectableBlock(b);
/** The same, plus the blocks the arrows can walk into. */
const takesCaret = (b) => takesText(b) || hasOwnField(b);

function landingBefore(blocks, index) {
  return landing(blocks, index, -1, takesText);
}

/** The ArrowDown counterpart of landingBefore. -1 at the bottom. */
function landingAfter(blocks, index) {
  return landing(blocks, index, 1, takesText);
}

/** Where ArrowUp lands: a code block or callout above is entered, not skipped. */
function caretLandingBefore(blocks, index) {
  return landing(blocks, index, -1, takesCaret);
}

/** Where ArrowDown lands. */
function caretLandingAfter(blocks, index) {
  return landing(blocks, index, 1, takesCaret);
}

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

/**
 * Blocks a Backspace at their start turns into a plain paragraph before it
 * does anything else (Notion's rule, and Obsidian's in effect, where the key
 * deletes the `### `): the text and the caret stay, only the kind goes. A
 * second Backspace then merges or reaches across as a paragraph's would.
 * Before 2026-09-23 the first press merged a heading's text into the block
 * above, and on an empty heading under a picture it selected the picture
 * with nothing on screen to say so, so the second press deleted it.
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
      // Boundary: nothing to move into — bail without committing a no-op history
      // step. The top is the reorder floor: frontmatter is the file's head, and
      // the first block under it is the first block there is to move.
      if (target < reorderFloor(blocks) || target >= blocks.length) return;
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

      // A marker on its own line opens its block on Enter as well as on the
      // space (2026-09-19): ```js then Enter is the motion every Markdown
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
          commitNoteData((prev) => {
            const next = { ...prev };
            const n = { ...next[noteId] };
            const blks = [...n.content.blocks];
            blks[blockIndex] = { ...blks[blockIndex], type: "p", text: "" };
            n.content = { ...n.content, blocks: blks };
            next[noteId] = n;
            return next;
          });
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

      // Enter at the start of a heading that holds text opens a paragraph
      // above it and leaves the heading where it is, caret and all. The
      // split below made the empty half the heading and demoted the text
      // to a paragraph (review §1.11).
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
          commitNoteData((prev) => {
            const next = { ...prev };
            const n = { ...next[noteId] };
            const blks = [...n.content.blocks];
            // Only the id and the text survive: a heading's source spacing, a
            // list's marker and number, a task's tick all belonged to the kind.
            blks[blockIndex] = { id: block.id, type: "p", text };
            n.content = { ...n.content, blocks: blks };
            next[noteId] = n;
            return next;
          });
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
        // at the root's start removes the paragraph element itself; state
        // still held one block, so nothing repainted and typing went nowhere
        // until the note was reopened (2026-09-17).
        e.preventDefault();
        if (blocks.length <= 1) return;
        const prevIdx = landingBefore(blocks, blockIndex);
        if (prevIdx >= 0 && isSelectableBlock(blocks[prevIdx])) {
          // A divider, image or table above: this empty row goes and the
          // block is selected, in one press, so what the next Backspace will
          // remove is on screen. The row used to stay with the caret blinking
          // in it, and the selection went unseen (2026-09-23).
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
          if (blockIndex === 0) {
            const titleEl = editorRef.current?.parentElement?.querySelector("h1[contenteditable]");
            if (titleEl) titleEl.focus();
          } else {
            const prevIdx = caretLandingBefore(blocks, blockIndex);
            if (prevIdx >= 0 && hasOwnField(blocks[prevIdx])) {
              // The arrows walk into a block that keeps its own field rather
              // than stopping on it: arriving from below lands at its end —
              // a table's last row, a code block's last line.
              focusOwnedField(editorRef.current, blocks[prevIdx].id, "end");
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
    // A block that keeps its own field owns every key pressed in it. The field
    // is the active element and the editor root is only what the event bubbles
    // through, so acting here means acting on the document selection — which,
    // while a textarea has focus, is stale or empty. Measured 2026-09-19: an
    // arrow pressed inside a code block took focus out of it and moved the
    // caret by a range left in another block, and a letter typed there landed
    // in the note's first block with the page scrolled to the top.
    const active = document.activeElement;
    if (active && active !== editorRef.current && editorRef.current?.contains(active)) {
      // One exception, and only for an inline format: a field that holds
      // Markdown (a table cell, a callout's body) has the document selection
      // inside itself, so `applyFormat` can act on it — and it is the one
      // applier, which is what keeps the toolbar's pressed glyph right whether
      // the format came from the strip or the keyboard. The field commits the
      // result itself. Chromium's own Cmd+B must not run instead: it decides
      // from the computed style, so in a header cell (600) it wrote a
      // `font-weight: normal` span the walker reads as plain text and the file
      // never got its `**` (2026-09-19). A code block's textarea is not such a
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
