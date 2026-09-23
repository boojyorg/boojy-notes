import { type DragEvent, type RefObject, useCallback, useRef } from "react";
import type { NoteData } from "../../types/notes";
import { reorderFloor } from "../../utils/blockOrder";
import { cssZoom } from "../../utils/domHelpers";

/** How far outside the first or last block the marker sits when there is no neighbour. */
const EDGE_GAP = 4;

interface Options {
  noteDataRef: RefObject<NoteData>;
  activeNoteRef: RefObject<string | null>;
  blockRefs: RefObject<Record<string, HTMLElement | null>>;
  editorRef: RefObject<HTMLElement | null>;
  saveAndInsertFiles: (noteId: string, afterIndex: number, files: File[]) => Promise<void>;
}

const carriesFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes("Files");

/**
 * Files dragged in from Finder or the desktop. The whole editor pane takes
 * them (these handlers sit on `.editor-scroll`), not only the text: on the
 * editable root alone, the space under a short note, the margins and the path
 * band refused the drop, and a release there did nothing. The gap they land
 * in is the block drag's rule and its marker (`.block-drop-marker`, on
 * `<body>`): before the first block whose middle is below the pointer, never
 * above frontmatter, and after the last block when the pointer is below them
 * all. Only a drag carrying files is touched; a text drag keeps Chromium's.
 */
export function useDragDropHandlers({
  noteDataRef,
  activeNoteRef,
  blockRefs,
  editorRef,
  saveAndInsertFiles,
}: Options) {
  const markerRef = useRef<HTMLDivElement | null>(null);

  const hideMarker = useCallback(() => {
    markerRef.current?.remove();
    markerRef.current = null;
  }, []);

  /** The boundary the pointer names: files go before `index` (0…blocks.length). */
  const boundaryAt = useCallback(
    (pointerY: number) => {
      const noteId = activeNoteRef.current;
      const blocks = (noteId && noteDataRef.current?.[noteId]?.content?.blocks) || [];
      const floor = reorderFloor(blocks);
      let index = blocks.length;
      let before: HTMLElement | null = null;
      let after: HTMLElement | null = null;
      for (let i = floor; i < blocks.length; i++) {
        const el = blockRefs.current?.[blocks[i].id];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (pointerY < rect.top + rect.height / 2) {
          index = i;
          before = el;
          break;
        }
        after = el;
      }
      return { noteId, index: Math.max(index, floor), before, after };
    },
    [activeNoteRef, noteDataRef, blockRefs],
  );

  const handleEditorDragOver = useCallback(
    (e: DragEvent) => {
      // With no note open there is nowhere to put a file, so the drag is refused.
      if (!carriesFiles(e) || !activeNoteRef.current) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const { before, after } = boundaryAt(e.clientY);
      let y: number;
      if (before && after)
        y = (after.getBoundingClientRect().bottom + before.getBoundingClientRect().top) / 2;
      else if (before) y = before.getBoundingClientRect().top - EDGE_GAP;
      else if (after) y = after.getBoundingClientRect().bottom + EDGE_GAP;
      else return hideMarker();
      if (!markerRef.current) {
        markerRef.current = document.createElement("div");
        markerRef.current.className = "block-drop-marker";
        document.body.appendChild(markerRef.current);
      }
      const marker = markerRef.current;
      // Measured in viewport pixels, styled inside the UI scale's zoom.
      const zoom = cssZoom(document.body);
      const col = (editorRef.current ?? before ?? after)?.getBoundingClientRect();
      if (!col) return;
      Object.assign(marker.style, {
        left: `${col.left / zoom}px`,
        width: `${col.width / zoom}px`,
        top: `${y / zoom - marker.offsetHeight / 2}px`,
      });
    },
    [activeNoteRef, boundaryAt, editorRef, hideMarker],
  );

  const handleEditorDragLeave = useCallback(
    (e: DragEvent) => {
      // Leaving for a child of the pane is not leaving the pane.
      if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) hideMarker();
    },
    [hideMarker],
  );

  const handleEditorDrop = useCallback(
    (e: DragEvent) => {
      hideMarker();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      e.preventDefault();
      const { noteId, index } = boundaryAt(e.clientY);
      if (!noteId) return;
      void saveAndInsertFiles(noteId, index - 1, Array.from(files));
    },
    [boundaryAt, hideMarker, saveAndInsertFiles],
  );

  return { handleEditorDragOver, handleEditorDragLeave, handleEditorDrop };
}
