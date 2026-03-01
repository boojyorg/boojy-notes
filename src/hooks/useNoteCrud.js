import { genNoteId, genBlockId } from "../utils/storage";
import { FOLDER_TREE } from "../constants/data";

export function useNoteCrud({
  commitNoteData, noteDataRef,
  setTabs, setActiveNote, activeNote,
  setCustomFolders, customFolders, setExpanded,
  titleRef, trashedNotesRef, setTrashedNotes,
  setRenamingFolder,
}) {
  const createNote = (folder = null) => {
    const id = genNoteId();
    const firstBlockId = genBlockId();
    const pathParts = folder ? [...folder.split("/"), "Untitled"] : undefined;
    const newNote = {
      id, title: "Untitled", folder,
      path: pathParts,
      content: { title: "Untitled", blocks: [{ id: firstBlockId, type: "p", text: "" }] },
      words: 0,
    };
    commitNoteData(prev => ({ ...prev, [id]: newNote }));
    setTabs(prev => [...prev, id]);
    setActiveNote(id);
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
    if (window.electronAPI?.trashNote) {
      trashedNotesRef.current.set(noteId, { title: note.title, folder: note.folder });
      setTrashedNotes(prev => ({
        ...prev,
        [noteId]: {
          id: noteId,
          title: note.title,
          folder: note.folder,
          deletedAt: Date.now(),
          content: note.content,
        },
      }));
    }
    commitNoteData(prev => {
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
    setTabs(prev => {
      const next = prev.filter(t => t !== noteId);
      if (activeNote === noteId) setActiveNote(next[next.length - 1] || null);
      return next;
    });
  };

  const duplicateNote = (noteId) => {
    const src = noteDataRef.current[noteId];
    if (!src) return;
    const id = genNoteId();
    const dup = {
      ...src, id, title: src.title + " (copy)",
      content: {
        title: src.title + " (copy)",
        blocks: src.content.blocks.map(b => ({ ...b, id: genBlockId() })),
      },
    };
    commitNoteData(prev => ({ ...prev, [id]: dup }));
    setTabs(prev => [...prev, id]);
    setActiveNote(id);
  };

  const renameFolder = (oldPath, newName) => {
    if (!newName) return;
    const parts = oldPath.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    if (newPath === oldPath) return;
    commitNoteData(prev => {
      const next = { ...prev };
      for (const [id, n] of Object.entries(next)) {
        if (n.folder && (n.folder === oldPath || n.folder.startsWith(oldPath + "/"))) {
          const updated = { ...n, folder: n.folder.replace(oldPath, newPath) };
          if (updated.path) {
            const oldLast = oldPath.split("/").pop();
            updated.path = updated.path.map(s => s === oldLast ? newName : s);
          }
          next[id] = updated;
        }
      }
      return next;
    });
    setExpanded(prev => {
      const next = {};
      for (const [key, val] of Object.entries(prev)) {
        if (key === oldPath) next[newPath] = val;
        else if (key.startsWith(oldPath + "/")) next[key.replace(oldPath, newPath)] = val;
        else next[key] = val;
      }
      return next;
    });
    setCustomFolders(prev => prev.map(f => f === oldPath ? newName : f));
  };

  const deleteFolder = (folderPath) => {
    const noteEntries = Object.entries(noteDataRef.current)
      .filter(([, n]) => n.folder && (n.folder === folderPath || n.folder.startsWith(folderPath + "/")));
    const noteIds = noteEntries.map(([id]) => id);

    if (window.electronAPI?.trashNote) {
      const trashBatch = {};
      for (const [id, n] of noteEntries) {
        trashedNotesRef.current.set(id, { title: n.title, folder: n.folder });
        trashBatch[id] = {
          id,
          title: n.title,
          folder: n.folder,
          deletedAt: Date.now(),
          content: n.content,
        };
      }
      setTrashedNotes(prev => ({ ...prev, ...trashBatch }));
    }

    commitNoteData(prev => {
      const next = { ...prev };
      noteIds.forEach(id => delete next[id]);
      return next;
    });
    setTabs(prev => {
      const next = prev.filter(t => !noteIds.includes(t));
      if (noteIds.includes(activeNote)) setActiveNote(next[next.length - 1] || null);
      return next;
    });
    setCustomFolders(prev => prev.filter(f => f !== folderPath));
  };

  const restoreNote = async (noteId) => {
    if (!window.electronAPI?.restoreNote) return;
    try {
      const note = await window.electronAPI.restoreNote(noteId);
      if (!note) return;
      const { _filePath, _migrated, ...cleanNote } = note;
      commitNoteData(prev => ({ ...prev, [cleanNote.id]: cleanNote }));
      if (cleanNote.folder) {
        setCustomFolders(prev => {
          if (prev.includes(cleanNote.folder)) return prev;
          return [...prev, cleanNote.folder];
        });
      }
      setTrashedNotes(prev => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
    } catch (err) {
      console.error("Restore note failed", err);
    }
  };

  const permanentDeleteNote = async (noteId) => {
    if (!window.confirm("Permanently delete? This cannot be undone.")) return;
    if (!window.electronAPI?.purgeTrash) return;
    try {
      await window.electronAPI.purgeTrash([noteId]);
      setTrashedNotes(prev => {
        const next = { ...prev };
        delete next[noteId];
        return next;
      });
    } catch (err) {
      console.error("Permanent delete failed", err);
    }
  };

  const emptyAllTrash = async () => {
    if (!window.confirm("Permanently delete all items in trash?")) return;
    if (!window.electronAPI?.emptyTrash) return;
    try {
      await window.electronAPI.emptyTrash();
      setTrashedNotes({});
    } catch (err) {
      console.error("Empty trash failed", err);
    }
  };

  const createFolder = () => {
    let name = "Untitled Folder";
    const existingNames = new Set([
      ...FOLDER_TREE.map(f => f.name),
      ...customFolders,
    ]);
    if (existingNames.has(name)) {
      let i = 2;
      while (existingNames.has(`${name} ${i}`)) i++;
      name = `${name} ${i}`;
    }
    setCustomFolders(prev => [...prev, name]);
    setExpanded(prev => ({ ...prev, [name]: false }));
    setTimeout(() => setRenamingFolder(name), 50);
  };

  return {
    createNote, deleteNote, duplicateNote,
    renameFolder, deleteFolder,
    restoreNote, permanentDeleteNote, emptyAllTrash,
    createFolder,
  };
}
