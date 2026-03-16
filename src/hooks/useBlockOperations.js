import { useCallback } from "react";
import { genBlockId } from "../utils/storage";
import { isNative } from "../utils/platform";
import { getAPI } from "../services/apiProvider";

export function useBlockOperations({
  commitNoteData,
  commitTextChange,
  blockRefs,
  focusBlockId,
  focusCursorPos,
}) {
  const updateBlockText = (noteId, blockIndex, newText) => {
    commitTextChange((prev) => {
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

  const insertImageBlock = (noteId, afterIndex, src, alt = "", width = 100) => {
    const imgBlock = { id: genBlockId(), type: "image", src, alt, width, text: "" };
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
      const dataBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const ext =
        file.name.lastIndexOf(".") !== -1
          ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
          : "";
      // Generate timestamp filename for clipboard pastes (generic names like image.png, blob)
      const isClipboardPaste = /^(image|blob|clipboard)/i.test(file.name.replace(/\.[^.]+$/, ""));
      let finalFileName = file.name;
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
        insertImageBlock(noteId, afterIndex, filename, finalFileName.replace(/\.[^.]+$/, ""));
      } else {
        const result = await api.saveAttachment({ fileName: file.name, dataBase64 });
        insertFileBlock(noteId, afterIndex, result.filename, result.filename, result.size);
      }
    } catch (err) {
      console.error("saveAndInsertImage failed", err);
    }
  };

  const flipCheck = useCallback((noteId, blockIndex) => {
    commitNoteData((prev) => {
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

  // --- Code block operations ---
  const updateCodeText = useCallback((noteId, blockIndex, newText) => {
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], text: newText };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  }, []);

  const updateCodeLang = useCallback((noteId, blockIndex, lang) => {
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], lang };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  }, []);

  // --- Callout operations ---
  const updateCallout = useCallback((noteId, blockIndex, updates) => {
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      blocks[blockIndex] = { ...blocks[blockIndex], ...updates };
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  }, []);

  // --- Table operations ---
  const updateTableRows = useCallback((noteId, blockIndex, rows, alignments) => {
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blocks = [...n.content.blocks];
      const updated = { ...blocks[blockIndex], rows };
      if (alignments !== undefined) updated.alignments = alignments;
      blocks[blockIndex] = updated;
      n.content = { ...n.content, blocks };
      next[noteId] = n;
      return next;
    });
  }, []);

  return {
    updateBlockText,
    insertBlockAfter,
    deleteBlock,
    updateBlockProperty,
    insertImageBlock,
    insertFileBlock,
    saveAndInsertImage,
    flipCheck,
    registerBlockRef,
    updateCodeText,
    updateCodeLang,
    updateCallout,
    updateTableRows,
  };
}
