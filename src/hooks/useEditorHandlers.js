import { useRef } from "react";
import { getBlockFromNode } from "../utils/domHelpers";
import { useSlashCommands } from "./editor/useSlashCommands";
import { useInputHandler } from "./editor/useInputHandler";
import { useKeyboardHandlers } from "./editor/useKeyboardHandlers";
import { usePasteHandler } from "./editor/usePasteHandler";
import { useDragDropHandlers } from "./editor/useDragDropHandlers";
import { useMouseHandlers } from "./editor/useMouseHandlers";

export function useEditorHandlers({
  noteDataRef,
  activeNote,
  commitNoteData,
  commitTextChange: _commitTextChange,
  blockRefs,
  editorRef,
  focusBlockId,
  focusCursorPos,
  slashMenuRef,
  setSlashMenu,
  wikilinkMenuRef,
  setWikilinkMenu,
  syncGeneration,
  updateBlockText,
  insertBlockAfter,
  deleteBlock,
  saveAndInsertImage,
  insertFileBlock: _insertFileBlock,
  reReadBlockFromDom,
  toggleInlineCode,
  applyFormat,
  mouseIsDown,
  setToolbarState: _setToolbarState,
  onOpenLinkEditor,
  updateBlockIndent,
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
    activeNoteRef,
    blockRefs,
    editorRef,
    commitNoteData,
    focusBlockId,
    focusCursorPos,
    syncGeneration,
    getBlock,
  };

  const { executeSlashCommand } = useSlashCommands({ ...shared, insertBlockAfter, onError });
  const { handleBlockInput, handleEditorInput } = useInputHandler({
    ...shared,
    slashMenuRef,
    setSlashMenu,
    wikilinkMenuRef,
    setWikilinkMenu,
    updateBlockText,
    insertBlockAfter,
  });
  const { handleEditorKeyDown } = useKeyboardHandlers({
    ...shared,
    slashMenuRef,
    setSlashMenu,
    wikilinkMenuRef,
    updateBlockText,
    insertBlockAfter,
    deleteBlock,
    reReadBlockFromDom,
    toggleInlineCode,
    applyFormat,
    onOpenLinkEditor,
    updateBlockIndent,
    executeSlashCommand,
    handleBlockInput,
  });
  const { handleEditorPaste, handleEditorCopy } = usePasteHandler({
    ...shared,
    saveAndInsertImage,
    reReadBlockFromDom,
  });
  const { handleEditorDragOver, handleEditorDragLeave, handleEditorDrop } = useDragDropHandlers({
    ...shared,
    saveAndInsertImage,
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
    handleEditorDragOver,
    handleEditorDragLeave,
    handleEditorDrop,
    executeSlashCommand,
  };
}
