import { useCallback, useRef } from "react";
import { getBlockFromNode, hasOwnField } from "../utils/domHelpers";
import { useSlashCommands } from "./editor/useSlashCommands";
import { useInputHandler } from "./editor/useInputHandler";
import { useKeyboardHandlers } from "./editor/useKeyboardHandlers";
import { usePasteHandler } from "./editor/usePasteHandler";
import { useDragDropHandlers } from "./editor/useDragDropHandlers";
import { useMouseHandlers } from "./editor/useMouseHandlers";
import { useCrossBlockEdit } from "./editor/useCrossBlockEdit";
import { typedPaste } from "../utils/pasteBlocks";

export function useEditorHandlers({
  noteDataRef,
  noteTitleSetRef,
  activeNote,
  commitNoteData,
  blockRefs,
  editorRef,
  focusBlockId,
  focusCursorPos,
  slashMenuRef,
  setSlashMenu,
  wikilinkMenuRef,
  setWikilinkMenu,
  tagMenuRef,
  setTagMenu,
  syncGeneration,
  updateBlockText,
  insertBlockAfter,
  openCodeBlock,
  openMathBlock,
  openDivider,
  deleteBlock,
  saveAndInsertFiles,
  reReadBlockFromDom,
  applyFormat,
  mouseIsDown,
  updateBlockIndent,
  indentBlockRange,
  moveBlock,
  selectBlock,
  selectBlockRun,
  onError,
}) {
  // Use a ref for activeNote so inner helpers don't need it as a dependency
  const activeNoteRef = useRef(activeNote);
  activeNoteRef.current = activeNote;

  // Helper to get blocks and call getBlockFromNode with current refs
  const getBlock = (node) => {
    const blocks = noteDataRef.current[activeNoteRef.current]?.content?.blocks;
    return getBlockFromNode(node, editorRef.current, blocks, blockRefs.current);
  };

  const shared = {
    noteDataRef,
    noteTitleSetRef,
    activeNoteRef,
    blockRefs,
    editorRef,
    commitNoteData,
    focusBlockId,
    focusCursorPos,
    syncGeneration,
    getBlock,
  };

  // The one owner of every edit that reaches across block roots; the key,
  // paste and cut handlers ask it which roots a selection touches.
  const { scopeOf, ownEdit, handleEditorBeforeInput } = useCrossBlockEdit({
    ...shared,
    selectBlock,
  });
  const { executeSlashCommand } = useSlashCommands({ ...shared, onError });
  const { handleBlockInput, handleEditorInput } = useInputHandler({
    ...shared,
    slashMenuRef,
    setSlashMenu,
    wikilinkMenuRef,
    setWikilinkMenu,
    tagMenuRef,
    setTagMenu,
    updateBlockText,
    openCodeBlock,
    openMathBlock,
    openDivider,
    executeSlashCommand,
  });
  const { handleEditorKeyDown } = useKeyboardHandlers({
    ...shared,
    slashMenuRef,
    setSlashMenu,
    tagMenuRef,
    setTagMenu,
    wikilinkMenuRef,
    updateBlockText,
    insertBlockAfter,
    openCodeBlock,
    openMathBlock,
    openDivider,
    deleteBlock,
    applyFormat,
    scopeOf,
    updateBlockIndent,
    indentBlockRange,
    moveBlock,
    selectBlock,
    selectBlockRun,
    executeSlashCommand,
    handleBlockInput,
  });
  const { handleEditorPaste, handleEditorCopy, handleEditorCut } = usePasteHandler({
    ...shared,
    saveAndInsertFiles,
    reReadBlockFromDom,
    scopeOf,
    ownEdit,
  });
  // Several lines a keyboard types at once into a text block are a paste
  // (`typedPaste`). A block with its own field (a code block's textarea, a
  // cell, a callout) keeps the input, as it keeps a real paste; the rest of
  // the typing goes to the one owner of edits across roots.
  const handleBeforeInput = useCallback(
    (e) => {
      const paste = typedPaste(e);
      // A keystroke's target is the whole editor: where it lands is its range
      // (or the caret). A field's own input is addressed to the field.
      const node =
        e.target === editorRef.current
          ? (e.getTargetRanges?.()[0]?.startContainer ?? window.getSelection()?.anchorNode)
          : e.target;
      const blocks = noteDataRef.current[activeNoteRef.current]?.content?.blocks;
      const at = paste && getBlockFromNode(node, editorRef.current, blocks, blockRefs.current);
      if (!at || hasOwnField(blocks[at.blockIndex])) return handleEditorBeforeInput(e);
      e.preventDefault();
      handleEditorPaste(paste);
    },
    [handleEditorBeforeInput, handleEditorPaste, noteDataRef, editorRef, blockRefs],
  );
  const { handleEditorDragOver, handleEditorDragLeave, handleEditorDrop } = useDragDropHandlers({
    ...shared,
    saveAndInsertFiles,
  });
  const { handleEditorMouseUp, handleEditorMouseDown, handleEditorFocus } = useMouseHandlers({
    ...shared,
    mouseIsDown,
  });

  return {
    handleEditorKeyDown,
    handleEditorInput,
    handleEditorMouseUp,
    handleEditorMouseDown,
    handleEditorFocus,
    handleEditorPaste,
    handleEditorCopy,
    handleEditorCut,
    handleEditorBeforeInput: handleBeforeInput,
    handleEditorDragOver,
    handleEditorDragLeave,
    handleEditorDrop,
    executeSlashCommand,
  };
}
