import { useRef } from "react";
import { getBlockFromNode } from "../utils/domHelpers";
import { useSlashCommands } from "./editor/useSlashCommands";
import { useInputHandler } from "./editor/useInputHandler";
import { useKeyboardHandlers } from "./editor/useKeyboardHandlers";
import { usePasteHandler } from "./editor/usePasteHandler";
import { useDragDropHandlers } from "./editor/useDragDropHandlers";
import { useMouseHandlers } from "./editor/useMouseHandlers";
import { useCrossBlockEdit } from "./editor/useCrossBlockEdit";

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
  deleteBlock,
  saveAndInsertImage,
  reReadBlockFromDom,
  applyFormat,
  mouseIsDown,
  updateBlockIndent,
  moveBlock,
  selectBlock,
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
  const { executeSlashCommand } = useSlashCommands({ ...shared, insertBlockAfter, onError });
  const { handleBlockInput, handleEditorInput } = useInputHandler({
    ...shared,
    slashMenuRef,
    setSlashMenu,
    wikilinkMenuRef,
    setWikilinkMenu,
    tagMenuRef,
    setTagMenu,
    updateBlockText,
    insertBlockAfter,
    executeSlashCommand,
  });
  const { handleEditorKeyDown } = useKeyboardHandlers({
    ...shared,
    slashMenuRef,
    setSlashMenu,
    wikilinkMenuRef,
    updateBlockText,
    insertBlockAfter,
    deleteBlock,
    applyFormat,
    scopeOf,
    updateBlockIndent,
    moveBlock,
    selectBlock,
    executeSlashCommand,
    handleBlockInput,
  });
  const { handleEditorPaste, handleEditorCopy, handleEditorCut } = usePasteHandler({
    ...shared,
    saveAndInsertImage,
    reReadBlockFromDom,
    scopeOf,
    ownEdit,
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
    handleEditorCut,
    handleEditorBeforeInput,
    handleEditorDragOver,
    handleEditorDragLeave,
    handleEditorDrop,
    executeSlashCommand,
  };
}
