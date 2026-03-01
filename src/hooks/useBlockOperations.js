import { useCallback } from "react";
import { genBlockId } from "../utils/storage";

export function useBlockOperations({
  commitNoteData, commitTextChange, blockRefs, focusBlockId, focusCursorPos,
}) {
  const updateBlockText = (noteId, blockIndex, newText) => {
    commitTextChange(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], text: newText };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const insertBlockAfter = (noteId, afterIndex, type = "p", text = "") => {
    const newBlock = { id: genBlockId(), type, text };
    if (type === "checkbox") newBlock.checked = false;
    commitNoteData(prev => {
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

  const deleteBlock = (noteId, blockIndex) => {
    commitNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks.splice(blockIndex, 1);
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  };

  const insertImageBlock = (noteId, afterIndex, src, alt = "") => {
    const imgBlock = { id: genBlockId(), type: "image", src, alt, text: "" };
    const paraBlock = { id: genBlockId(), type: "p", text: "" };
    commitNoteData(prev => {
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

  const saveAndInsertImage = async (noteId, afterIndex, file) => {
    if (!window.electronAPI) return;
    try {
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const relPath = await window.electronAPI.saveImage({ noteId, fileName: file.name, dataBase64 });
      insertImageBlock(noteId, afterIndex, relPath, file.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      console.error("saveAndInsertImage failed", err);
    }
  };

  const flipCheck = useCallback((noteId, blockIndex) => {
    commitNoteData(prev => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], checked: !blocks[blockIndex].checked };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  }, []);

  const registerBlockRef = useCallback((id, el) => {
    if (el) blockRefs.current[id] = el;
    else delete blockRefs.current[id];
  }, []);

  return {
    updateBlockText, insertBlockAfter, deleteBlock,
    insertImageBlock, saveAndInsertImage, flipCheck, registerBlockRef,
  };
}
