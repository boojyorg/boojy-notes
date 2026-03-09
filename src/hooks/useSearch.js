import { useState, useRef, useCallback, useEffect } from "react";
import {
  buildSearchIndex,
  updateIndexEntry,
  removeIndexEntry,
  searchNotes,
  groupByFolder,
} from "../utils/search";

export function useSearch(noteData, noteDataRef) {
  const searchIndexRef = useRef(new Map());
  const debounceRef = useRef(null);
  const prevNoteIdsRef = useRef(new Set());
  const lastQueryRef = useRef("");

  const [searchMode, setSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState({ results: [], totalCount: 0, groups: [] });
  const [activeResultIndex, setActiveResultIndex] = useState(0);

  // Build / update index when noteData changes
  useEffect(() => {
    const currentIds = new Set(Object.keys(noteData));
    const prevIds = prevNoteIdsRef.current;

    if (prevIds.size === 0 && currentIds.size > 0) {
      // Initial load — build full index
      searchIndexRef.current = buildSearchIndex(noteData);
    } else {
      // Incremental update
      for (const id of currentIds) {
        if (!prevIds.has(id)) {
          // New note
          updateIndexEntry(searchIndexRef.current, id, noteData[id]);
        } else {
          // Check if changed (compare title + block count as cheap heuristic)
          const entry = searchIndexRef.current.get(id);
          const note = noteData[id];
          const currentTitle = note.title || note.content?.title || "";
          const currentBlockCount = note.content?.blocks?.length || 0;
          if (
            entry &&
            (entry.title !== currentTitle || entry.blockOffsets.length !== currentBlockCount)
          ) {
            updateIndexEntry(searchIndexRef.current, id, note);
          }
        }
      }
      for (const id of prevIds) {
        if (!currentIds.has(id)) {
          removeIndexEntry(searchIndexRef.current, id);
        }
      }
    }
    prevNoteIdsRef.current = currentIds;

    // If search is active, re-run with current query
    if (lastQueryRef.current) {
      const raw = searchNotes(lastQueryRef.current, searchIndexRef.current);
      const groups = groupByFolder(raw.results);
      setSearchResults({ results: raw.results, totalCount: raw.totalCount, groups });
    }
  }, [noteData]);

  const search = useCallback((query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || !query.trim()) {
      lastQueryRef.current = "";
      setSearchMode(false);
      setSearchResults({ results: [], totalCount: 0, groups: [] });
      setActiveResultIndex(0);
      return;
    }
    debounceRef.current = setTimeout(() => {
      lastQueryRef.current = query.trim();
      const raw = searchNotes(query.trim(), searchIndexRef.current);
      const groups = groupByFolder(raw.results);
      setSearchMode(true);
      setSearchResults({ results: raw.results, totalCount: raw.totalCount, groups });
      setActiveResultIndex(0);
    }, 150);
  }, []);

  const clearSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    lastQueryRef.current = "";
    setSearchMode(false);
    setSearchResults({ results: [], totalCount: 0, groups: [] });
    setActiveResultIndex(0);
  }, []);

  const resultCountRef = useRef(0);
  resultCountRef.current = searchResults.results.length;

  const navigateResults = useCallback((direction) => {
    setActiveResultIndex((prev) => {
      const max = resultCountRef.current - 1;
      if (max < 0) return 0;
      if (direction === "down") return Math.min(prev + 1, max);
      return Math.max(prev - 1, 0);
    });
  }, []);

  const getActiveResult = useCallback(() => {
    return searchResults.results[activeResultIndex] || null;
  }, [searchResults.results, activeResultIndex]);

  return {
    searchMode,
    searchResults,
    activeResultIndex,
    search,
    clearSearch,
    navigateResults,
    getActiveResult,
    searchIndexRef,
  };
}
