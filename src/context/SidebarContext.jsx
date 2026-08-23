import { createContext, useState, useRef, useContext, useMemo, useEffect } from "react";
import { useNoteData, useNoteDataActions } from "./NoteDataContext";
import { useSearch } from "../hooks/useSearch";
import { FOLDER_TREE } from "../constants/data";
import { loadFromStorage } from "../utils/storage";
import { isNative } from "../utils/platform";
import {
  buildTree,
  collectPaths,
  filterTree,
  pathsToTree,
  naturalCompare,
} from "../utils/sidebarTree";
import { compareNotes, sortNoteIds, SORT_RECENT } from "../utils/noteSort";
import { useNoteSort } from "../hooks/useNoteSort";

const SidebarContext = createContext(null);

export function SidebarProvider({ children }) {
  const { noteData } = useNoteData();
  const { noteDataRef, textOnlyEditForSidebar } = useNoteDataActions();

  // ── State ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef(null);
  const sidebarScrollRef = useRef(null);

  const [expanded, setExpanded] = useState(() => {
    const ui = (() => {
      try {
        return JSON.parse(localStorage.getItem("boojy-ui-state"));
      } catch {
        return null;
      }
    })();
    if (ui?.expanded) return ui.expanded;
    const saved = loadFromStorage();
    return saved?.expanded || { Boojy: true };
  });

  const [customFolders, setCustomFolders] = useState(() => {
    if (isNative) return [];
    const saved = loadFromStorage();
    return saved?.customFolders || [];
  });

  const [renamingFolder, setRenamingFolder] = useState(null);
  // Note id whose sidebar row is showing the inline rename input (the note
  // counterpart of renamingFolder — same grammar, same input treatment).
  const [renamingNote, setRenamingNote] = useState(null);

  // The one ordering source for every note list in the panel.
  const { sortMode, setSortMode, lastOpened, markOpened } = useNoteSort(noteData);

  // ── Search ────────────────────────────────────────────────────────────
  const {
    searchMode,
    searchResults,
    activeResultIndex,
    search: runSearch,
    clearSearch,
    navigateResults,
    getActiveResult,
  } = useSearch(noteData, noteDataRef);

  // Wire search input to fuzzy search
  useEffect(() => {
    runSearch(search);
  }, [search, runSearch]);

  // ── Derived data ──────────────────────────────────────────────────────
  const prevSidebarResult = useRef(null);
  const { derivedRootNotes, folderNoteMap } = useMemo(() => {
    // O(1) bail-out: text-only edits never change folders, drafts, or note membership
    if (textOnlyEditForSidebar.current && prevSidebarResult.current) {
      textOnlyEditForSidebar.current = false;
      return prevSidebarResult.current;
    }
    textOnlyEditForSidebar.current = false;
    const roots = [];
    const map = {};
    for (const [id, n] of Object.entries(noteData)) {
      if (n._draft) continue; // Hide drafts from sidebar
      if (n.folder) {
        if (!map[n.folder]) map[n.folder] = [];
        map[n.folder].push(id);
      } else {
        roots.push(id);
      }
    }
    const result = { derivedRootNotes: roots, folderNoteMap: map };
    prevSidebarResult.current = result;
    return result;
  }, [noteData]); // eslint-disable-line react-hooks/exhaustive-deps

  const { allFolders, knownPaths } = useMemo(() => {
    const allPaths = new Set([...customFolders, ...Object.keys(folderNoteMap)]);
    const folders = [...FOLDER_TREE, ...pathsToTree([...allPaths])];
    const paths = new Set(collectPaths(folders));
    return { allFolders: folders, knownPaths: paths };
  }, [customFolders, folderNoteMap]);

  // Alphabetical mode can't care when a note was opened, so it must not rebuild
  // the tree every time one is. Only recency subscribes to the timestamps.
  const sortSignal = sortMode === SORT_RECENT ? lastOpened : null;

  const { folderTree, sortedRootNotes } = useMemo(() => {
    // Titles come from the ref, not from `noteData` in the dep list: depending
    // on the store directly would rebuild the whole tree on every keystroke and
    // undo the text-only bail-out above. Anything that can change a *title*
    // also changes folderNoteMap/derivedRootNotes identity, so this stays fresh.
    const compare = compareNotes(sortMode, noteDataRef.current, sortSignal || {});
    const sortNotes = (ids) => sortNoteIds(ids, compare);
    const tree = [...buildTree(allFolders, folderNoteMap, sortNotes)].sort((a, b) =>
      naturalCompare(a.name, b.name),
    );
    return { folderTree: tree, sortedRootNotes: sortNotes(derivedRootNotes) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFolders, folderNoteMap, derivedRootNotes, sortMode, sortSignal, noteDataRef]);

  const prevFilteredResult = useRef(null);
  const { filteredTree, fNotes } = useMemo(() => {
    // Short-circuit when only text changed — folderTree/sortedRootNotes refs are stable
    if (
      prevFilteredResult.current &&
      prevFilteredResult.current.folderTree === folderTree &&
      prevFilteredResult.current.search === search &&
      prevFilteredResult.current.sortedRootNotes === sortedRootNotes
    ) {
      return prevFilteredResult.current.value;
    }
    const lc = (s) => s.toLowerCase();
    const filtered = filterTree(folderTree, search ? lc(search) : "", noteData);
    const notes = search
      ? sortedRootNotes.filter((n) => noteData[n] && lc(noteData[n].title).includes(lc(search)))
      : sortedRootNotes;
    const result = { filteredTree: filtered, fNotes: notes };
    prevFilteredResult.current = { folderTree, search, sortedRootNotes, value: result };
    return result;
  }, [folderTree, search, noteData, sortedRootNotes]);

  const folderList = useMemo(() => [...knownPaths].sort(), [knownPaths]);

  // ── Context value ─────────────────────────────────────────────────────
  const value = useMemo(
    () => ({
      search,
      setSearch,
      searchFocused,
      setSearchFocused,
      searchInputRef,
      sidebarScrollRef,
      expanded,
      setExpanded,
      customFolders,
      setCustomFolders,
      renamingFolder,
      setRenamingFolder,
      renamingNote,
      setRenamingNote,
      searchMode,
      searchResults,
      activeResultIndex,
      clearSearch,
      navigateResults,
      getActiveResult,
      filteredTree,
      fNotes,
      folderList,
      sortMode,
      setSortMode,
      markOpened,
    }),
    [
      search,
      searchFocused,
      expanded,
      customFolders,
      renamingFolder,
      renamingNote,
      searchMode,
      searchResults,
      activeResultIndex,
      clearSearch,
      navigateResults,
      getActiveResult,
      filteredTree,
      fNotes,
      folderList,
      sortMode,
      setSortMode,
      markOpened,
    ],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
