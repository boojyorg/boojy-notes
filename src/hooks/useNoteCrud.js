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
  markOpened,
}) {
  // Recency is stamped wherever a note becomes the one in front of you. That is
  // `openNote` for an existing note, and these three for a new one — without
  // them a note you just made sorts into the never-opened alphabetical tail,
  // i.e. a new "Zebra" appears at the bottom of "Most recent". Any future site
  // that makes a note active needs this line too.
  const open = (id) => {
    markOpened?.(id);
    setActiveNote(id);
  };
  const createNote = (folder = null, title = null) => {
    const id = genNoteId();
    const firstBlockId = genBlockId();
    const noteTitle = title || "Untitled";
    const pathParts = folder ? [...folder.split("/"), noteTitle] : undefined;
    const newNote = {
      id,
      title: noteTitle,
      folder,
      path: pathParts,
      content: { title: noteTitle, blocks: [{ id: firstBlockId, type: "p", text: "" }] },
      words: 0,
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

  const renameFolder = (oldPath, newName) => {
    if (!newName) return;
    newName = newName.replace(/[/\\]/g, "-");
    if (!newName) return;
    const parts = oldPath.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    if (newPath === oldPath) return;
    commitNoteData((prev) => {
      const next = { ...prev };
      for (const [id, n] of Object.entries(next)) {
        if (n.folder && (n.folder === oldPath || n.folder.startsWith(oldPath + "/"))) {
          const updated = { ...n, folder: n.folder.replace(oldPath, newPath) };
          if (updated.path) {
            const oldLast = oldPath.split("/").pop();
            updated.path = updated.path.map((s) => (s === oldLast ? newName : s));
          }
          next[id] = updated;
        }
      }
      return next;
    });
    setExpanded((prev) => {
      const next = {};
      for (const [key, val] of Object.entries(prev)) {
        if (key === oldPath) next[newPath] = val;
        else if (key.startsWith(oldPath + "/")) next[key.replace(oldPath, newPath)] = val;
        else next[key] = val;
      }
      return next;
    });
    setCustomFolders((prev) => prev.map((f) => (f === oldPath ? newPath : f)));
  };

  const deleteFolder = (folderPath) => {
    const noteEntries = Object.entries(noteDataRef.current).filter(
      ([, n]) => n.folder && (n.folder === folderPath || n.folder.startsWith(folderPath + "/")),
    );
    const noteIds = noteEntries.map(([id]) => id);

    commitNoteData((prev) => {
      const next = { ...prev };
      noteIds.forEach((id) => delete next[id]);
      return next;
    });
    if (noteIds.includes(activeNote)) setActiveNote(null);
    setCustomFolders((prev) =>
      prev.filter((f) => f !== folderPath && !f.startsWith(folderPath + "/")),
    );
  };

  const createFolder = () => {
    let name = "Untitled Folder";
    const existingNames = new Set(customFolders);
    if (existingNames.has(name)) {
      let i = 2;
      while (existingNames.has(`${name} ${i}`)) i++;
      name = `${name} ${i}`;
    }
    setCustomFolders((prev) => [...prev, name]);
    setExpanded((prev) => ({ ...prev, [name]: false }));
    setTimeout(() => setRenamingFolder(name), 50);
  };

  const createDraftNote = () => {
    const id = genNoteId();
    const firstBlockId = genBlockId();
    const newNote = {
      id,
      title: "",
      folder: null,
      content: { title: "", blocks: [{ id: firstBlockId, type: "p", text: "" }] },
      words: 0,
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
    deleteFolder,
    createFolder,
    createDraftNote,
    promoteDraft,
    discardDraft,
  };
}
