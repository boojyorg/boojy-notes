import { useCallback } from "react";
import { getAPI } from "../../services/apiProvider";
import { genBlockId } from "../../utils/storage";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);

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

    const updateBlocks = (mutate) => {
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        mutate(blks);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
    };

    // Replace the slash block with `special` followed by a fresh empty
    // paragraph, and put the caret at the start of that paragraph. This is
    // the one state operation every "insert a special block" command ends in.
    const replaceWithSpecialBlock = (special) => {
      const paraBlock = { id: genBlockId(), type: "p", text: "" };
      updateBlocks((blks) => blks.splice(blockIndex, 1, special, paraBlock));
      focusBlockId.current = paraBlock.id;
      focusCursorPos.current = 0;
    };

    // Picker-backed commands clear the typed "/…" first so nothing lingers
    // while the dialog is open; on cancel or failure the caret returns here.
    const clearSlashText = () => {
      updateBlocks((blks) => {
        blks[blockIndex] = { ...blks[blockIndex], text: "" };
      });
    };
    const refocusSlashBlock = () => {
      focusBlockId.current = block.id;
      focusCursorPos.current = 0;
    };

    const imageBlockFor = (picked, filename) => ({
      id: genBlockId(),
      type: "image",
      src: filename,
      alt: picked.fileName.replace(/\.[^.]+$/, ""),
      width: 0,
      text: "",
    });

    if (el) el.innerHTML = "<br>";

    if (command.type === "image") {
      clearSlashText();
      if (!getAPI()) return;
      try {
        const picked = await getAPI().pickImageFile();
        if (!picked) {
          refocusSlashBlock();
          return;
        }
        const filename = await getAPI().saveImage({
          fileName: picked.fileName,
          dataBase64: picked.dataBase64,
        });
        replaceWithSpecialBlock(imageBlockFor(picked, filename));
      } catch (err) {
        console.error("Image slash command failed", err);
        onError?.("Failed to insert image");
        refocusSlashBlock();
      }
      return;
    }

    // File attachment slash command — image files still become image blocks
    if (command.type === "file") {
      clearSlashText();
      if (!getAPI()) return;
      try {
        const picked = await getAPI().pickFile();
        if (!picked) {
          refocusSlashBlock();
          return;
        }
        const ext =
          picked.fileName.lastIndexOf(".") !== -1
            ? picked.fileName.slice(picked.fileName.lastIndexOf(".")).toLowerCase()
            : "";
        if (IMAGE_EXTS.has(ext)) {
          const filename = await getAPI().saveImage({
            fileName: picked.fileName,
            dataBase64: picked.dataBase64,
          });
          replaceWithSpecialBlock(imageBlockFor(picked, filename));
        } else {
          const result = await getAPI().saveAttachment({
            fileName: picked.fileName,
            dataBase64: picked.dataBase64,
          });
          replaceWithSpecialBlock({
            id: genBlockId(),
            type: "file",
            src: result.filename,
            filename: result.filename,
            size: result.size,
            text: "",
          });
        }
      } catch (err) {
        console.error("File slash command failed", err);
        onError?.("Failed to attach file");
        refocusSlashBlock();
      }
      return;
    }

    if (command.type === "code") {
      replaceWithSpecialBlock({ ...block, text: "", type: "code", lang: "" });
      return;
    }

    if (command.type === "callout") {
      replaceWithSpecialBlock({
        ...block,
        text: "",
        type: "callout",
        calloutType: command.calloutType || "note",
        title: "",
      });
      return;
    }

    if (command.type === "embed") {
      replaceWithSpecialBlock({ ...block, text: "", type: "embed", target: "", heading: null });
      return;
    }

    if (command.type === "table") {
      replaceWithSpecialBlock({
        ...block,
        text: "",
        type: "table",
        // Smallest useful table, no placeholder text: header cells you must first
        // clear are friction, and the edge zones make growing it cheap.
        rows: [
          ["", ""],
          ["", ""],
        ],
      });
      return;
    }

    // Everything else converts the block in place.
    updateBlocks((blks) => {
      const updated = { ...blks[blockIndex], text: "", type: command.type };
      if (command.type === "checkbox") updated.checked = false;
      if (command.type === "spacer") {
        delete updated.text;
        delete updated.checked;
      }
      if (command.type !== "checkbox") delete updated.checked;
      blks[blockIndex] = updated;
    });
    if (command.type === "spacer") {
      insertBlockAfter(noteId, blockIndex, "p", "");
    } else {
      refocusSlashBlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks
  }, []);

  return { executeSlashCommand };
}
