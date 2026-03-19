import { createContext, useState, useRef, useContext, useMemo, useEffect } from "react";
import { useNoteData, useNoteDataActions } from "./NoteDataContext";
import { useSearch } from "../hooks/useSearch";
import { FOLDER_TREE } from "../constants/data";
import { loadFromStorage } from "../utils/storage";
import { isNative } from "../utils/platform";
import {
  sortByOrder,
  buildTree,
  collectPaths,
  filterTree,
  pathsToTree,
  naturalCompare,
} from "../utils/sidebarTree";

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

  const [trashedNotes, setTrashedNotes] = useState({});
  const [trashExpanded, setTrashExpanded] = useState(false);
  const trashedNotesRef = useRef(new Map());
  const [sidebarOrder, setSidebarOrder] = useState({});
  const [renamingFolder, setRenamingFolder] = useState(null);

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

  const { folderTree, sortedRootNotes } = useMemo(() => {
    const rawFolderTree = buildTree(allFolders, folderNoteMap, sidebarOrder);
    const hasRootOrder = sidebarOrder[""]?.folderOrder?.length > 0;
    const tree = hasRootOrder
      ? sortByOrder(rawFolderTree, sidebarOrder[""].folderOrder, (f) => f.name)
      : [...rawFolderTree].sort((a, b) => naturalCompare(a.name, b.name));
    const sorted = sortByOrder(derivedRootNotes, sidebarOrder[""]?.noteOrder, (id) => id);
    return { folderTree: tree, sortedRootNotes: sorted };
  }, [allFolders, folderNoteMap, sidebarOrder, derivedRootNotes]);

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
      trashedNotes,
      setTrashedNotes,
      trashedNotesRef,
      trashExpanded,
      setTrashExpanded,
      sidebarOrder,
      setSidebarOrder,
      renamingFolder,
      setRenamingFolder,
      searchMode,
      searchResults,
      activeResultIndex,
      clearSearch,
      navigateResults,
      getActiveResult,
      filteredTree,
      fNotes,
      folderList,
    }),
    [
      search,
      searchFocused,
      expanded,
      customFolders,
      trashedNotes,
      trashExpanded,
      sidebarOrder,
      renamingFolder,
      searchMode,
      searchResults,
      activeResultIndex,
      clearSearch,
      navigateResults,
      getActiveResult,
      filteredTree,
      fNotes,
      folderList,
    ],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
