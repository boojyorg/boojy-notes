import { useCallback } from "react";
import { getAPI } from "../../services/apiProvider";
import { genBlockId } from "../../utils/storage";

export function useSlashCommands({
  noteDataRef,
  blockRefs,
  commitNoteData,
  focusBlockId,
  focusCursorPos,
  insertBlockAfter,
  onError,
}) {
  const executeSlashCommand = useCallback(async (noteId, blockIndex, command) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    const el = blockRefs.current[block.id];

    if (command.type === "image") {
      if (el) el.innerHTML = "<br>";
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks[blockIndex] = { ...blks[blockIndex], text: "" };
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      if (!getAPI()) return;
      try {
        const picked = await getAPI().pickImageFile();
        if (!picked) {
          focusBlockId.current = block.id;
          focusCursorPos.current = 0;
          return;
        }
        const filename = await getAPI().saveImage({
          fileName: picked.fileName,
          dataBase64: picked.dataBase64,
        });
        const imgBlock = {
          id: genBlockId(),
          type: "image",
          src: filename,
          alt: picked.fileName.replace(/\.[^.]+$/, ""),
          width: 0,
          text: "",
        };
        const paraBlock = { id: genBlockId(), type: "p", text: "" };
        commitNoteData((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blks = [...n.content.blocks];
          blks.splice(blockIndex, 1, imgBlock, paraBlock);
          n.content = { ...n.content, blocks: blks };
          next[noteId] = n;
          return next;
        });
        focusBlockId.current = paraBlock.id;
        focusCursorPos.current = 0;
      } catch (err) {
        console.error("Image slash command failed", err);
        onError?.("Failed to insert image");
        focusBlockId.current = block.id;
        focusCursorPos.current = 0;
      }
      return;
    }

    // File attachment slash command
    if (command.type === "file") {
      if (el) el.innerHTML = "<br>";
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks[blockIndex] = { ...blks[blockIndex], text: "" };
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      if (!getAPI()) return;
      try {
        const picked = await getAPI().pickFile();
        if (!picked) {
          focusBlockId.current = block.id;
          focusCursorPos.current = 0;
          return;
        }
        const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);
        const ext =
          picked.fileName.lastIndexOf(".") !== -1
            ? picked.fileName.slice(picked.fileName.lastIndexOf(".")).toLowerCase()
            : "";
        if (IMAGE_EXTS.has(ext)) {
          const filename = await getAPI().saveImage({
            fileName: picked.fileName,
            dataBase64: picked.dataBase64,
          });
          const imgBlock = {
            id: genBlockId(),
            type: "image",
            src: filename,
            alt: picked.fileName.replace(/\.[^.]+$/, ""),
            width: 0,
            text: "",
          };
          const paraBlock = { id: genBlockId(), type: "p", text: "" };
          commitNoteData((prev) => {
            const next = { ...prev };
            const n = { ...next[noteId] };
            const blks = [...n.content.blocks];
            blks.splice(blockIndex, 1, imgBlock, paraBlock);
            n.content = { ...n.content, blocks: blks };
            next[noteId] = n;
            return next;
          });
          focusBlockId.current = paraBlock.id;
          focusCursorPos.current = 0;
        } else {
          const result = await getAPI().saveAttachment({
            fileName: picked.fileName,
            dataBase64: picked.dataBase64,
          });
          const fileBlock = {
            id: genBlockId(),
            type: "file",
            src: result.filename,
            filename: result.filename,
            size: result.size,
            text: "",
          };
          const paraBlock = { id: genBlockId(), type: "p", text: "" };
          commitNoteData((prev) => {
            const next = { ...prev };
            const n = { ...next[noteId] };
            const blks = [...n.content.blocks];
            blks.splice(blockIndex, 1, fileBlock, paraBlock);
            n.content = { ...n.content, blocks: blks };
            next[noteId] = n;
            return next;
          });
          focusBlockId.current = paraBlock.id;
          focusCursorPos.current = 0;
        }
      } catch (err) {
        console.error("File slash command failed", err);
        onError?.("Failed to attach file");
        focusBlockId.current = block.id;
        focusCursorPos.current = 0;
      }
      return;
    }

    // Code block slash command — create special block
    if (command.type === "code") {
      if (el) el.innerHTML = "<br>";
      const codeBlock = { ...block, text: "", type: "code", lang: "" };
      const paraBlock = { id: genBlockId(), type: "p", text: "" };
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks.splice(blockIndex, 1, codeBlock, paraBlock);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      focusBlockId.current = paraBlock.id;
      focusCursorPos.current = 0;
      return;
    }

    // Callout slash command
    if (command.type === "callout") {
      if (el) el.innerHTML = "<br>";
      const calloutBlock = {
        ...block,
        text: "",
        type: "callout",
        calloutType: command.calloutType || "note",
        title: "",
      };
      const paraBlock = { id: genBlockId(), type: "p", text: "" };
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks.splice(blockIndex, 1, calloutBlock, paraBlock);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      focusBlockId.current = paraBlock.id;
      focusCursorPos.current = 0;
      return;
    }

    // Embed slash command
    if (command.type === "embed") {
      if (el) el.innerHTML = "<br>";
      const embedBlock = {
        ...block,
        text: "",
        type: "embed",
        target: "",
        heading: null,
      };
      const paraBlock = { id: genBlockId(), type: "p", text: "" };
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks.splice(blockIndex, 1, embedBlock, paraBlock);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      focusBlockId.current = paraBlock.id;
      focusCursorPos.current = 0;
      return;
    }

    // Table slash command
    if (command.type === "table") {
      if (el) el.innerHTML = "<br>";
      const tableBlock = {
        ...block,
        text: "",
        type: "table",
        rows: [
          ["Column 1", "Column 2", "Column 3"],
          ["", "", ""],
        ],
      };
      const paraBlock = { id: genBlockId(), type: "p", text: "" };
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks.splice(blockIndex, 1, tableBlock, paraBlock);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      focusBlockId.current = paraBlock.id;
      focusCursorPos.current = 0;
      return;
    }

    if (el) el.innerHTML = "<br>";
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blks = [...n.content.blocks];
      const updated = { ...blks[blockIndex], text: "", type: command.type };
      if (command.type === "checkbox") updated.checked = false;
      if (command.type === "spacer") {
        delete updated.text;
        delete updated.checked;
      }
      if (command.type !== "checkbox") delete updated.checked;
      blks[blockIndex] = updated;
      n.content = { ...n.content, blocks: blks };
      next[noteId] = n;
      return next;
    });
    if (command.type === "spacer") {
      insertBlockAfter(noteId, blockIndex, "p", "");
    } else {
      focusBlockId.current = block.id;
      focusCursorPos.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks
  }, []);

  return { executeSlashCommand };
}
