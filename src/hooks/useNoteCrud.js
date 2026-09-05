import { genNoteId, genBlockId } from "../utils/storage";
import { isNative } from "../utils/platform";

export function useNoteCrud({
  commitNoteData,
  noteDataRef,
  setActiveNote,
  activeNote,
  setCustomFolders,
  customFolders,
  setExpanded,
  titleRef,
  setRenamingFolder,
  // Desktop: useFileSystem's directory operations (create / rename / remove),
  // each answering with the path the disk holds. Null on web, where folders
  // live in memory beside the notes.
  folderOps = null,
  onError,
}) {
  // Making a note active has no effect on its "Most recent" position. A new or
  // duplicated note still rises to the top, because it becomes dirty the moment
  // it exists and useFileSystem stamps it as edited on the way to disk.
  const open = (id) => setActiveNote(id);
  const createNote = (folder = null, title = null) => {
    const id = genNoteId();
    const firstBlockId = genBlockId();
    const noteTitle = title || "Untitled";
    const newNote = {
      id,
      title: noteTitle,
      folder,
      content: { title: noteTitle, blocks: [{ id: firstBlockId, type: "p", text: "" }] },
    };
    commitNoteData((prev) => ({ ...prev, [id]: newNote }));
    open(id);
    setTimeout(() => {
      if (titleRef.current) {
        titleRef.current.focus();
        const range = document.createRange();
        range.selectNodeContents(titleRef.current);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 50);
  };

  const deleteNote = (noteId) => {
    const note = noteDataRef.current[noteId];
    if (!note) return;
    commitNoteData((prev) => {
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
    // Deleting the open note falls back to null — the draft-note flow (desktop)
    // or the sidebar (mobile) takes over.
    if (activeNote === noteId) setActiveNote(null);
  };

  const duplicateNote = (noteId) => {
    const src = noteDataRef.current[noteId];
    if (!src) return;
    const id = genNoteId();
    const dup = {
      ...src,
      id,
      title: src.title + " (copy)",
      content: {
        title: src.title + " (copy)",
        blocks: src.content.blocks.map((b) => ({ ...b, id: genBlockId() })),
      },
    };
    commitNoteData((prev) => ({ ...prev, [id]: dup }));
    open(id);
  };

  // Commit a new title from the sidebar's inline rename input. Mirrors the
  // editor title's onInput commit (title + content.title updated together);
  // persistence downstream treats it exactly like an editor-title edit.
  const renameNote = (noteId, newTitle) => {
    const title = (newTitle ?? "").trim();
    const note = noteDataRef.current[noteId];
    if (!note || !title || title === note.title) return;
    commitNoteData((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      n.title = title;
      n.content = { ...n.content, title };
      next[noteId] = n;
      return next;
    });
  };

  // ── Folders ──
  // A folder path is `Parent/Child`; every path under a renamed or moved
  // folder moves with it, in the notes, the folder list and the expanded map.
  const remapPaths = (oldPath, newPath) => (p) =>
    p === oldPath ? newPath : p.startsWith(`${oldPath}/`) ? newPath + p.slice(oldPath.length) : p;

  const remapExpanded = (oldPath, newPath) => {
    const remap = remapPaths(oldPath, newPath);
    setExpanded((prev) => {
      const next = {};
      for (const [key, val] of Object.entries(prev)) next[remap(key)] = val;
      return next;
    });
  };

  const changeFolderPath = (oldPath, newPath) => {
    if (newPath === oldPath) return;
    if (folderOps) {
      // The disk decides the final path (sanitised, de-duplicated); the notes'
      // folder fields and the folder list follow inside folderOps.rename.
      folderOps
        .rename(oldPath, newPath)
        .then((finalPath) => remapExpanded(oldPath, finalPath))
        .catch((err) => {
          console.error("useNoteCrud: folder rename failed", err);
          onError?.("Failed to rename the folder on disk");
        });
      return;
    }
    const remap = remapPaths(oldPath, newPath);
    commitNoteData((prev) => {
      const next = { ...prev };
      for (const [id, n] of Object.entries(next)) {
        if (n.folder && remap(n.folder) !== n.folder) next[id] = { ...n, folder: remap(n.folder) };
      }
      return next;
    });
    remapExpanded(oldPath, newPath);
    setCustomFolders((prev) => prev.map(remap));
  };

  const renameFolder = (oldPath, newName) => {
    if (!newName) return;
    newName = newName.replace(/[/\\]/g, "-");
    if (!newName) return;
    const parts = oldPath.split("/");
    parts[parts.length - 1] = newName;
    changeFolderPath(oldPath, parts.join("/"));
  };

  // Drag a folder onto another folder, or onto the root (`null`). Location
  // only, never order; a folder cannot go into itself or its own subtree.
  const moveFolder = (folderPath, targetParent) => {
    const parent = targetParent || null;
    const slash = folderPath.lastIndexOf("/");
    const currentParent = slash === -1 ? null : folderPath.slice(0, slash);
    if (parent === currentParent) return;
    if (parent && (parent === folderPath || parent.startsWith(`${folderPath}/`))) return;
    const name = folderPath.slice(slash + 1);
    changeFolderPath(folderPath, parent ? `${parent}/${name}` : name);
  };

  const deleteFolder = (folderPath) => {
    const noteIds = Object.entries(noteDataRef.current)
      .filter(
        ([, n]) => n.folder && (n.folder === folderPath || n.folder.startsWith(`${folderPath}/`)),
      )
      .map(([id]) => id);

    if (noteIds.length > 0) {
      commitNoteData((prev) => {
        const next = { ...prev };
        for (const id of noteIds) delete next[id];
        return next;
      });
    }
    if (noteIds.includes(activeNote)) setActiveNote(null);
    if (folderOps) {
      // The directory goes once the notes have reached the Trash, and only if
      // nothing else is left in it; folderOps reports a kept folder itself.
      folderOps.remove(folderPath, { hasNotes: noteIds.length > 0 }).catch((err) => {
        console.error("useNoteCrud: folder removal failed", err);
        onError?.("Failed to remove the folder on disk");
      });
      return;
    }
    setCustomFolders((prev) =>
      prev.filter((f) => f !== folderPath && !f.startsWith(`${folderPath}/`)),
    );
  };

  // `parent` is a folder path for "New folder inside", or null for the root.
  // (The header button passes its click event; anything but a string is root.)
  const createFolder = (parent = null) => {
    const parentPath = typeof parent === "string" ? parent : null;
    const base = parentPath ? `${parentPath}/Untitled Folder` : "Untitled Folder";
    const reveal = (path) => {
      setExpanded((prev) => ({
        ...prev,
        ...(parentPath ? { [parentPath]: true } : {}),
        [path]: false,
      }));
      setTimeout(() => setRenamingFolder(path), 50);
    };
    if (folderOps) {
      folderOps
        .create(base)
        .then(reveal)
        .catch((err) => {
          console.error("useNoteCrud: folder creation failed", err);
          onError?.("Failed to create the folder on disk");
        });
      return;
    }
    const existing = new Set(customFolders);
    let path = base;
    for (let i = 2; existing.has(path); i++) path = `${base}-${i}`;
    setCustomFolders((prev) => [...prev, path]);
    reveal(path);
  };

  const createDraftNote = () => {
    const id = genNoteId();
    const firstBlockId = genBlockId();
    const newNote = {
      id,
      title: "",
      folder: null,
      content: { title: "", blocks: [{ id: firstBlockId, type: "p", text: "" }] },
      _draft: true,
    };
    commitNoteData((prev) => ({ ...prev, [id]: newNote }));
    open(id);
    return id;
  };

  const promoteDraft = (noteId) => {
    commitNoteData((prev) => {
      const note = prev[noteId];
      if (!note?._draft) return prev;
      const { _draft, ...clean } = note;
      return { ...prev, [noteId]: clean };
    });
  };

  const discardDraft = (noteId) => {
    commitNoteData((prev) => {
      if (!prev[noteId]?._draft) return prev;
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
  };

  return {
    createNote,
    deleteNote,
    duplicateNote,
    renameNote,
    renameFolder,
    moveFolder,
    deleteFolder,
    createFolder,
    createDraftNote,
    promoteDraft,
    discardDraft,
  };
}
