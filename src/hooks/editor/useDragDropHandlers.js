import { useCallback } from "react";
import { useTheme } from "../useTheme";

export function useDragDropHandlers({
  noteDataRef,
  activeNoteRef,
  blockRefs,
  editorRef,
  saveAndInsertImage,
}) {
  const { theme } = useTheme();

  const handleEditorDragOver = useCallback((e) => {
    const currentNote = activeNoteRef.current;
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      // Show drop indicator
      if (editorRef.current) {
        const blocks = noteDataRef.current[currentNote]?.content?.blocks || [];
        let closestIdx = 0;
        let closestDist = Infinity;
        for (let i = 0; i < blocks.length; i++) {
          const el = editorRef.current.querySelector(`[data-block-id="${blocks[i].id}"]`);
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          const dist = Math.abs(e.clientY - rect.bottom);
          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        }
        // Remove old indicators
        editorRef.current.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
        const targetEl = editorRef.current.querySelector(
          `[data-block-id="${blocks[closestIdx]?.id}"]`,
        );
        if (targetEl) {
          const indicator = document.createElement("div");
          indicator.className = "drop-indicator";
          indicator.style.cssText = `height:2px;background:${theme.ACCENT.primary};border-radius:1px;margin:2px 0;pointer-events:none;`;
          targetEl.parentNode.insertBefore(indicator, targetEl.nextSibling);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs
  }, []);

  const handleEditorDragLeave = useCallback((e) => {
    if (editorRef.current && !editorRef.current.contains(e.relatedTarget)) {
      editorRef.current.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editorRef is a stable ref
  }, []);

  const handleEditorDrop = useCallback((e) => {
    const currentNote = activeNoteRef.current;
    // Clean up drop indicators
    if (editorRef.current) {
      editorRef.current.querySelectorAll(".drop-indicator").forEach((el) => el.remove());
    }
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    e.preventDefault();
    const allFiles = Array.from(files);
    const blocks = noteDataRef.current[currentNote]?.content?.blocks || [];
    let afterIndex = blocks.length - 1;
    if (editorRef.current) {
      let closestIdx = blocks.length - 1;
      let closestDist = Infinity;
      for (let i = 0; i < blocks.length; i++) {
        const el = blockRefs.current[blocks[i].id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(e.clientY - (rect.top + rect.bottom) / 2);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }
      afterIndex = closestIdx;
    }
    for (let i = 0; i < allFiles.length; i++) {
      saveAndInsertImage(currentNote, afterIndex + i, allFiles[i]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs
  }, []);

  return { handleEditorDragOver, handleEditorDragLeave, handleEditorDrop };
}
