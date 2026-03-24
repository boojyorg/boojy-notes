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
          setNoteData(validated);
        }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncGeneration = useRef(0);
  const activeNoteRef = useRef(null);

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    commitNoteData,
    commitTextChange,
    pushHistory,
    popHistory,
    isUndoRedo,
    noteDataRef,
    textOnlyEdit,
    textOnlyEditForSidebar,
    textOnlyEditForEditor,
    editedNoteHint,
  } = useHistory(noteData, setNoteData, syncGeneration, activeNoteRef);

  const dataValue = useMemo(() => ({ noteData }), [noteData]);

  const actionsValue = useMemo(
    () => ({
      setNoteData,
      syncGeneration,
      activeNoteRef,
      canUndo,
      canRedo,
      undo,
      redo,
      commitNoteData,
      commitTextChange,
      pushHistory,
      popHistory,
      isUndoRedo,
      noteDataRef,
      textOnlyEdit,
      textOnlyEditForSidebar,
      textOnlyEditForEditor,
      editedNoteHint,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs (isUndoRedo, noteDataRef, textOnlyEdit, etc.) are stable and intentionally excluded
    [canUndo, canRedo, undo, redo, commitNoteData, commitTextChange, pushHistory, popHistory],
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
