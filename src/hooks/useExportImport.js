import { useCallback, useEffect, useRef } from "react";
import { getAPI } from "../services/apiProvider";
import { blocksToHtml } from "../utils/exportUtils";

/**
 * Export (PDF/DOCX) and import handlers for the active note, plus the Electron
 * menu-bar listener that routes File → Export/Import events to those handlers.
 *
 * Extracted from BoojyNotes so the whole export/import concern lives in one file
 * instead of being split between an effect and a cluster of callbacks.
 */
export function useExportImport({ noteData, activeNoteRef, noteDataRef, isElectron }) {
  // Bridge: the menu listener (registered once) needs the latest handlers.
  const handleExportRef = useRef({ pdf: null, docx: null });

  // Listen for menu export/import events
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    const cleanups = [];
    if (window.electronAPI.onMenuExport) {
      cleanups.push(
        window.electronAPI.onMenuExport((fmt) => {
          const id = activeNoteRef.current;
          if (!id || !noteDataRef.current[id]) return;
          if (fmt === "pdf") handleExportRef.current.pdf?.(id);
          else if (fmt === "docx") handleExportRef.current.docx?.(id);
        }),
      );
    }
    if (window.electronAPI.onMenuImport) {
      cleanups.push(
        window.electronAPI.onMenuImport((fmt) => {
          if (fmt === "markdown") window.electronAPI.importMarkdown();
          else if (fmt === "html") window.electronAPI.importHtml();
          else if (fmt === "folder") window.electronAPI.importFolder();
        }),
      );
    }
    return () => cleanups.forEach((fn) => fn?.());
  }, [isElectron, activeNoteRef, noteDataRef]);

  const handleExportPdf = useCallback(
    (noteId) => {
      const n = noteData[noteId];
      if (!n || !getAPI()?.exportPdf) return;
      const html = blocksToHtml(n.content.blocks, n.title);
      getAPI().exportPdf({ html, title: n.title });
    },
    [noteData],
  );

  const handleExportDocx = useCallback(
    (noteId) => {
      const n = noteData[noteId];
      if (!n || !getAPI()?.exportDocx) return;
      getAPI().exportDocx({ blocks: n.content.blocks, title: n.title });
    },
    [noteData],
  );

  handleExportRef.current.pdf = handleExportPdf;
  handleExportRef.current.docx = handleExportDocx;

  const handleImportIntoFolder = useCallback((folderId) => {
    if (!getAPI()?.importMarkdown) return;
    getAPI().importMarkdown({ targetFolder: folderId });
  }, []);

  return { handleExportPdf, handleExportDocx, handleImportIntoFolder };
}
