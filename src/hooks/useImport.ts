import { useCallback, useEffect } from "react";
import { getAPI } from "../services/apiProvider";

/** Import handlers for note folders and the Electron File menu. */
export function useImport() {
  useEffect(() => {
    if (!window.electronAPI) return;

    return window.electronAPI.onMenuImport((format) => {
      if (format === "markdown") window.electronAPI?.importMarkdown();
      else if (format === "html") window.electronAPI?.importHtml();
      else if (format === "folder") window.electronAPI?.importFolder();
    });
  }, []);

  const handleImportIntoFolder = useCallback((folderId: string) => {
    const api = getAPI();
    if (!api || !("importMarkdown" in api)) return;
    api.importMarkdown({ targetFolder: folderId });
  }, []);

  return { handleImportIntoFolder };
}
