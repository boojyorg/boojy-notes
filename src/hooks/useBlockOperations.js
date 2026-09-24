import { useCallback } from "react";
import { genBlockId } from "../utils/storage";
import { getCaretOffset } from "../utils/domHelpers";
import { withCell } from "../utils/tableShape";
import { reorderFloor } from "../utils/blockOrder";
import { insertedImageWidth } from "../utils/imageSize";
import { getAPI } from "../services/apiProvider";

/** The text blocks the Format menu can turn into one another. */
const KIND_TYPES = new Set([
  "p",
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
const LIST_KINDS = new Set(["bullet", "numbered", "checkbox"]);

export function useBlockOperations({
  commitNoteData,
  commitTextChange,
  blockRefs,
  focusBlockId,
  focusCursorPos,
  onError,
}) {
  // The text grain: what the user types into a block's own field. A
  // paragraph's contentEditable, a code block's textarea, a callout's title
  // or body and a table cell all commit here, on every input, so the
  // keystroke ref runs ahead of state, undo coalesces a burst, and the
  // editor skips its render. `patch` is a function of the block as the ref
  // holds it.
  const typeIntoBlock = (noteId, blockIndex, patch) => {
    commitTextChange((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], ...patch(blocks[blockIndex]) };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const updateBlockText = (noteId, blockIndex, newText) =>
    typeIntoBlock(noteId, blockIndex, () => ({ text: newText }));

  const updateCalloutTitle = (noteId, blockIndex, title) =>
    typeIntoBlock(noteId, blockIndex, () => ({ title }));

  const updateTableCell = (noteId, blockIndex, rowIdx, colIdx, value) =>
    typeIntoBlock(noteId, blockIndex, (block) => ({
      rows: withCell(block.rows || [], rowIdx, colIdx, value),
    }));

  const insertBlockAfter = (noteId, afterIndex, type = "p", text = "", opts = {}) => {
    const newBlock = { id: genBlockId(), type, text };
    if (type === "checkbox") newBlock.checked = false;
    if (opts.indent) newBlock.indent = opts.indent;
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks.splice(afterIndex + 1, 0, newBlock);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
    focusBlockId.current = newBlock.id;
    focusCursorPos.current = 0;
  };

  /**
   * Turn the block at `blockIndex` into a code block in `lang`, with a fresh
   * paragraph under it and the caret in the block's own field. The one owner
   * of what a typed fence does, from the space and from Enter alike; the
   * slash menu's Code reaches the same shape through
   * `replaceWithSpecialBlock`. The caller clears the typed text from the DOM,
   * since it holds the element.
   */
  const openCodeBlock = (noteId, blockIndex, lang = "") => {
    const paraBlock = { id: genBlockId(), type: "p", text: "" };
    let codeId = null;
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      const codeBlock = { ...blocks[blockIndex], text: "", type: "code", lang };
      delete codeBlock.checked;
      delete codeBlock.indent;
      codeId = codeBlock.id;
      blocks.splice(blockIndex, 1, codeBlock, paraBlock);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
    focusBlockId.current = codeId;
    focusCursorPos.current = 0;
  };

  /**
   * Turn the block at `blockIndex` into a divider, with a fresh paragraph
   * under it holding the caret: what `--- ` and Enter on a bare `---` both
   * do. A divider carries no text of its own, so the block's own text, check
   * state and indent go with it.
   */
  const openDivider = (noteId, blockIndex) => {
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      const divider = { ...blocks[blockIndex], type: "spacer" };
      delete divider.text;
      delete divider.checked;
      delete divider.indent;
      blocks[blockIndex] = divider;
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
    insertBlockAfter(noteId, blockIndex, "p", "");
  };

  const deleteBlock = (noteId, blockIndex) => {
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks.splice(blockIndex, 1);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const updateBlockProperty = (noteId, blockIndex, updates) => {
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], ...updates };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const insertImageBlock = (noteId, afterIndex, src, alt = "", widthFields = {}) => {
    const imgBlock = {
      id: genBlockId(),
      type: "image",
      src,
      alt,
      width: 0,
      ...widthFields,
      text: "",
    };
    const paraBlock = { id: genBlockId(), type: "p", text: "" };
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks.splice(afterIndex + 1, 0, imgBlock, paraBlock);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
    focusBlockId.current = paraBlock.id;
    focusCursorPos.current = 0;
  };

  const insertFileBlock = (noteId, afterIndex, src, filename, size) => {
    const fileBlock = { id: genBlockId(), type: "file", src, filename, size, text: "" };
    const paraBlock = { id: genBlockId(), type: "p", text: "" };
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks.splice(afterIndex + 1, 0, fileBlock, paraBlock);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
    focusBlockId.current = paraBlock.id;
    focusCursorPos.current = 0;
  };

  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);

  const saveAndInsertImage = async (noteId, afterIndex, file) => {
    const api = getAPI();
    if (!api) return;
    try {
      // Accept either a File/Blob (paste, drag-drop) or an already-read
      // { fileName, dataBase64 } object (the pickImageFile result used by the
      // mobile toolbar / pickers). Both platforms' pickImageFile return the latter.
      let dataBase64;
      let srcName;
      if (file && typeof file.dataBase64 === "string") {
        dataBase64 = file.dataBase64;
        srcName = file.fileName || "";
      } else {
        dataBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        srcName = file.name || "";
      }
      const ext =
        srcName.lastIndexOf(".") !== -1
          ? srcName.slice(srcName.lastIndexOf(".")).toLowerCase()
          : "";
      // Generate timestamp filename for clipboard pastes (generic names like image.png, blob)
      const isClipboardPaste = /^(image|blob|clipboard)/i.test(srcName.replace(/\.[^.]+$/, ""));
      let finalFileName = srcName;
      if (isClipboardPaste && ext) {
        const now = new Date();
        const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
        finalFileName = `paste-${ts}${ext}`;
      }
      if (IMAGE_EXTS.has(ext)) {
        const filename = await api.saveImage({
          fileName: finalFileName,
          dataBase64,
        });
        insertImageBlock(
          noteId,
          afterIndex,
          filename,
          finalFileName.replace(/\.[^.]+$/, ""),
          insertedImageWidth(dataBase64),
        );
      } else {
        const result = await api.saveAttachment({ fileName: srcName, dataBase64 });
        insertFileBlock(noteId, afterIndex, result.filename, result.filename, result.size);
      }
      return true;
    } catch (err) {
      console.error("saveAndInsertImage failed", err);
      onError?.("Failed to save image");
      return false;
    }
  };

  /**
   * Several files dropped or pasted at once, in the order given: each is saved
   * and inserted only after the one before it has landed, below it. Each
   * insertion adds two blocks (the image or file, and the paragraph under it).
   * Started all at once, they spliced at one index in whatever order their
   * reads finished.
   */
  const saveAndInsertFiles = async (noteId, afterIndex, files) => {
    let at = afterIndex;
    for (const file of files) {
      if (await saveAndInsertImage(noteId, at, file)) at += 2;
    }
  };

  const flipCheck = useCallback(
    (noteId, blockIndex) => {
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blocks = [...n.content.blocks];
        blocks[blockIndex] = { ...blocks[blockIndex], checked: !blocks[blockIndex].checked };
        n.content = { ...n.content, blocks };
        next[noteId] = n;
        return next;
      });
    },
    [commitNoteData],
  );

  const registerBlockRef = useCallback(
    (id, el) => {
      if (el) blockRefs.current[id] = el;
      else delete blockRefs.current[id];
    },
    [blockRefs],
  );

  // --- Code block operations (the text goes through updateBlockText) ---
  const updateCodeLang = useCallback(
    (noteId, blockIndex, lang) => {
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blocks = [...n.content.blocks];
        blocks[blockIndex] = { ...blocks[blockIndex], lang };
        n.content = { ...n.content, blocks };
        next[noteId] = n;
        return next;
      });
    },
    [commitNoteData],
  );

  // --- Callout operations ---
  const updateCallout = useCallback(
    (noteId, blockIndex, updates) => {
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blocks = [...n.content.blocks];
        blocks[blockIndex] = { ...blocks[blockIndex], ...updates };
        n.content = { ...n.content, blocks };
        next[noteId] = n;
        return next;
      });
    },
    [commitNoteData],
  );

  // --- Table operations ---
  // A structural change to a table (a row or column added, removed or
  // moved, an alignment, a CSV paste) is a function of the rows as the ref
  // holds them, so a cell edit still pending in the ref is inside the rows
  // it reshapes; computed from the rendered rows instead, the operation
  // wrote the rows as they were before the keystrokes and the typed text
  // was gone (review 2026-09-07, §3.4). `reshape(rows, alignments)` returns
  // `{ rows, alignments? }`; alignments left out are kept.
  const updateTableRows = useCallback(
    (noteId, blockIndex, reshape) => {
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blocks = [...n.content.blocks];
        const block = blocks[blockIndex];
        const { rows, alignments } = reshape(block.rows || [], block.alignments || []);
        const updated = { ...block, rows };
        if (alignments !== undefined) updated.alignments = alignments;
        blocks[blockIndex] = updated;
        n.content = { ...n.content, blocks };
        next[noteId] = n;
        return next;
      });
    },
    [commitNoteData],
  );

  // Move a block to a new position. Reordering the block array IS the edit —
  // because blocksToMarkdown walks the array in order, a reorder re-serialises to
  // clean markdown for free (this is what makes reorder safe under the
  // markdown-source-of-truth constraint; see docs/SPEC-markdown-source-of-truth.md).
  // No syncGeneration bump is needed: React's key-based reconciliation moves each
  // block's DOM node (keyed by id) to its new slot, carrying its live content — the
  // same mechanism the pointer drag (useBlockDrag) already relies on. Callers should
  // guard against boundary no-ops (don't call when the target index is out of range)
  // so we don't push an empty history step. The top boundary is `reorderFloor`:
  // with frontmatter first, index 0 is the file's head and no move touches it.
  const moveBlock = useCallback(
    (noteId, fromIndex, toIndex) => {
      let movedId = null;
      commitNoteData((prev) => {
        const n0 = prev[noteId];
        if (!n0) return prev;
        const blocks = [...n0.content.blocks];
        const floor = reorderFloor(blocks);
        if (
          fromIndex < floor ||
          fromIndex >= blocks.length ||
          toIndex < floor ||
          toIndex >= blocks.length ||
          fromIndex === toIndex
        ) {
          return prev; // no-op safety net (caller should pre-guard boundaries)
        }
        const [moved] = blocks.splice(fromIndex, 1);
        blocks.splice(toIndex, 0, moved);
        movedId = moved.id;
        const n = { ...n0, content: { ...n0.content, blocks } };
        return { ...prev, [noteId]: n };
      });
      if (movedId) {
        focusBlockId.current = movedId;
        focusCursorPos.current = 0;
      }
    },
    [commitNoteData, focusBlockId, focusCursorPos],
  );

  const updateBlockIndent = (noteId, blockIndex, delta) => {
    let blockId = null;
    let caret = -1;
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      const block = blocks[blockIndex];
      blockId = block.id;
      // Re-indenting changes the block's box, not its text, so the caret stays
      // on the same character. Read it from the DOM here, before the state
      // changes (the updater runs synchronously): the focus effect defaults to
      // offset 0, which sent the next keystroke to the front of the item
      // (review 2026-09-06, H2). -1 when the caret is not in this block.
      caret = getCaretOffset(blockRefs.current[block.id]);
      const newIndent = Math.max(0, Math.min(6, (block.indent || 0) + delta));
      // Drop any preserved raw indent prefix (tabs/odd spaces from a parsed
      // file) — after an in-app indent change it no longer matches, and a
      // stale one would serialise the OLD indentation (see utils/markdown.js)
      blocks[blockIndex] = { ...block, indent: newIndent, indentStr: undefined };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
    if (blockId) {
      focusBlockId.current = blockId;
      if (caret >= 0) focusCursorPos.current = caret;
    }
  };

  // Format → Body Text, Heading, a list or Quote: each text block the
  // selection touches becomes `type` and keeps its text, as the Backspace
  // demotion keeps it (only the id and the text survive; a heading's source
  // spacing, a list's marker and number, a task's tick belonged to the kind).
  // A list keeps its indent when it stays a list. One history entry; the
  // caret stays where it was in its block.
  const setBlockKind = (noteId, blockIds, type) => {
    const caretBlock = blockIds[0];
    const el = caretBlock ? blockRefs.current[caretBlock] : null;
    const caret = el ? getCaretOffset(el) : -1;
    commitNoteData((prev) => {
      const n = prev[noteId];
      if (!n) return prev;
      let changed = false;
      const blocks = n.content.blocks.map((block) => {
        if (!blockIds.includes(block.id) || !KIND_TYPES.has(block.type)) return block;
        if (block.type === type) return block;
        changed = true;
        const next = { id: block.id, type, text: block.text ?? "" };
        if (type === "checkbox") next.checked = false;
        if (LIST_KINDS.has(type) && LIST_KINDS.has(block.type) && block.indent) {
          next.indent = block.indent;
        }
        return next;
      });
      if (!changed) return prev;
      return { ...prev, [noteId]: { ...n, content: { ...n.content, blocks } } };
    });
    if (caretBlock) {
      focusBlockId.current = caretBlock;
      if (caret >= 0) focusCursorPos.current = caret;
    }
  };

  return {
    setBlockKind,
    updateBlockText,
    insertBlockAfter,
    openCodeBlock,
    openDivider,
    deleteBlock,
    updateBlockProperty,
    saveAndInsertImage,
    saveAndInsertFiles,
    flipCheck,
    registerBlockRef,
    updateCodeLang,
    updateCallout,
    updateCalloutTitle,
    updateTableCell,
    updateTableRows,
    updateBlockIndent,
    moveBlock,
  };
}
