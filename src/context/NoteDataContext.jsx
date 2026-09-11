import { createContext, useState, useEffect, useRef, useContext, useMemo } from "react";
import { useHistory } from "../hooks/useHistory";
import { loadFromStorage, loadFromIDB } from "../utils/storage";
import { isNative } from "../utils/platform";

const NoteDataContext = createContext(null);
const NoteDataActionsContext = createContext(null);

export function NoteDataProvider({ children }) {
  const [noteData, setNoteData] = useState(() => {
    if (isNative) return {};
    const saved = loadFromStorage();
    if (saved?.noteData && typeof saved.noteData === "object") {
      // Validate: each note must have content.blocks array
      const validated = {};
      for (const [id, note] of Object.entries(saved.noteData)) {
        if (note && Array.isArray(note.content?.blocks)) {
          validated[id] = note;
        }
      }
      return validated;
    }
    return {};
  });

  const syncGeneration = useRef(0);
  const activeNoteRef = useRef(null);

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    onActiveNoteChanged,
    commitNoteData,
    adoptNoteData,
    applyExternalNote,
    remapNoteFolders,
    replaceNoteData,
    commitTextChange,
    noteDataRef,
    textOnlyEdit,
    textOnlyEditForSidebar,
    textOnlyEditForEditor,
    unflushedNotes,
  } = useHistory(noteData, setNoteData, syncGeneration, activeNoteRef);

  // Fallback: if localStorage was empty, try IndexedDB (async)
  useEffect(() => {
    if (isNative) return;
    if (Object.keys(noteData).length > 0) return; // already loaded
    loadFromIDB().then((saved) => {
      if (saved?.noteData && typeof saved.noteData === "object") {
        const validated = {};
        for (const [id, note] of Object.entries(saved.noteData)) {
          if (note && Array.isArray(note.content?.blocks)) {
            validated[id] = note;
          }
        }
        if (Object.keys(validated).length > 0) {
          replaceNoteData(validated);
        }
      }
    });
  }, []);

  const dataValue = useMemo(() => ({ noteData }), [noteData]);

  // Every change to note state goes through useHistory, which keeps its
  // keystroke ref and React state together: commitNoteData (a user edit, an
  // undo entry), adoptNoteData (a change of record: a filename, a location),
  // applyExternalNote (one note from disk), remapNoteFolders (a directory
  // rename), replaceNoteData (the whole vault from disk) and commitTextChange
  // (typing). The raw setter is not exposed: a change made with it while a
  // text commit was pending was reverted when the commit fired, and it left
  // no undo entry.
  const actionsValue = useMemo(
    () => ({
      syncGeneration,
      activeNoteRef,
      canUndo,
      canRedo,
      undo,
      redo,
      onActiveNoteChanged,
      commitNoteData,
      adoptNoteData,
      applyExternalNote,
      remapNoteFolders,
      replaceNoteData,
      commitTextChange,
      noteDataRef,
      textOnlyEdit,
      textOnlyEditForSidebar,
      textOnlyEditForEditor,
      unflushedNotes,
    }),
    // Deps deliberately not exhaustive: refs (noteDataRef, textOnlyEdit, etc.) are stable and intentionally excluded
    [
      canUndo,
      canRedo,
      undo,
      redo,
      onActiveNoteChanged,
      commitNoteData,
      adoptNoteData,
      applyExternalNote,
      remapNoteFolders,
      replaceNoteData,
      commitTextChange,
    ],
  );

  return (
    <NoteDataContext.Provider value={dataValue}>
      <NoteDataActionsContext.Provider value={actionsValue}>
        {children}
      </NoteDataActionsContext.Provider>
    </NoteDataContext.Provider>
  );
}

export function useNoteData() {
  const ctx = useContext(NoteDataContext);
  if (!ctx) throw new Error("useNoteData must be used within NoteDataProvider");
  return ctx;
}

export function useNoteDataActions() {
  const ctx = useContext(NoteDataActionsContext);
  if (!ctx) throw new Error("useNoteDataActions must be used within NoteDataProvider");
  return ctx;
}
