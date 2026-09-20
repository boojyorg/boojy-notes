import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { NoteData } from "../types/notes";
import {
  buildSearchIndex,
  updateIndexEntry,
  removeIndexEntry,
  searchNotes,
  type SearchIndex,
  type SearchResult,
} from "../utils/search";
import { extractAllTags, tagKey, type TagEntry } from "../utils/tags";

export const SEARCH_DEBOUNCE_MS = 150;

export interface SearchResults {
  results: SearchResult[];
  totalCount: number;
}

const EMPTY: SearchResults = { results: [], totalCount: 0 };

/**
 * The one search: a text query, an optional tag filter, one ordered result
 * list. The index is rebuilt per note whenever the note object changes, so a
 * text edit is searchable once it commits (before 2026-09-20 only a title or
 * block-count change refreshed the entry, and results went stale mid-typing).
 *
 * A typed query is debounced; `flushSearch` runs a pending one at once so
 * Enter straight after typing acts on the query as typed, never on the
 * results of the keystroke before. Setting the tag filter runs at once.
 */
export function useSearch(noteData: NoteData) {
  const searchIndexRef = useRef<SearchIndex>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const lastQueryRef = useRef("");
  const tagFilterRef = useRef<string | null>(null);
  const resultsRef = useRef<SearchResults>(EMPTY);

  const [tagFilter, setTagFilterState] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const [searchResults, setSearchResultsState] = useState<SearchResults>(EMPTY);
  // Position in `results`, the one order every face draws and Enter reads
  // (review 2026-09-07 §4.3: a second, folder-grouped order once stamped each
  // result with an index the palette highlighted while Enter read this one).
  const [activeResultIndex, setActiveResultIndex] = useState(0);

  const tags = useMemo(() => extractAllTags(noteData), [noteData]);
  const tagsRef = useRef<Map<string, TagEntry>>(tags);
  tagsRef.current = tags;

  const setSearchResults = useCallback((r: SearchResults) => {
    resultsRef.current = r;
    setSearchResultsState(r);
  }, []);

  const run = useCallback((query: string): SearchResults => {
    const tag = tagFilterRef.current;
    const noteIds = tag ? (tagsRef.current.get(tagKey(tag))?.noteIds ?? new Set<string>()) : null;
    const raw = searchNotes(query, searchIndexRef.current, { noteIds });
    return { results: raw.results, totalCount: raw.totalCount };
  }, []);

  // Build / update index when noteData changes
  useEffect(() => {
    const index = searchIndexRef.current;
    if (index.size === 0 && Object.keys(noteData).length > 0) {
      searchIndexRef.current = buildSearchIndex(noteData);
    } else {
      for (const [id, note] of Object.entries(noteData)) {
        const entry = index.get(id);
        if (!entry || entry.note !== note) updateIndexEntry(index, id, note);
      }
      for (const id of index.keys()) {
        if (!(id in noteData)) removeIndexEntry(index, id);
      }
    }
    // If search is active, re-run with current query
    if (lastQueryRef.current || tagFilterRef.current) {
      setSearchResults(run(lastQueryRef.current));
    }
  }, [noteData, run, setSearchResults]);

  const clearPending = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    pendingQueryRef.current = null;
  };

  const apply = useCallback(
    (query: string) => {
      lastQueryRef.current = query;
      setSearchMode(true);
      setSearchResults(run(query));
      setActiveResultIndex(0);
    },
    [run, setSearchResults],
  );

  const search = useCallback(
    (query: string) => {
      clearPending();
      const q = (query || "").trim();
      if (!q) {
        lastQueryRef.current = "";
        if (tagFilterRef.current) {
          apply("");
        } else {
          setSearchMode(false);
          setSearchResults(EMPTY);
          setActiveResultIndex(0);
        }
        return;
      }
      pendingQueryRef.current = q;
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        pendingQueryRef.current = null;
        apply(q);
      }, SEARCH_DEBOUNCE_MS);
    },
    [apply, setSearchResults],
  );

  /**
   * Run a pending query now. Returns the results to act on and whether they
   * are new (in which case the highlight is at the first row).
   */
  const flushSearch = useCallback((): { results: SearchResult[]; flushed: boolean } => {
    const pending = pendingQueryRef.current;
    if (pending === null) return { results: resultsRef.current.results, flushed: false };
    clearPending();
    apply(pending);
    return { results: resultsRef.current.results, flushed: true };
  }, [apply]);

  /** Set or clear the filter, optionally with the query it should run with. */
  const setTagFilter = useCallback(
    (tag: string | null, query?: string) => {
      tagFilterRef.current = tag;
      setTagFilterState(tag);
      clearPending();
      if (query !== undefined) lastQueryRef.current = query.trim();
      if (tag) {
        apply(lastQueryRef.current);
      } else if (!lastQueryRef.current) {
        setSearchMode(false);
        setSearchResults(EMPTY);
        setActiveResultIndex(0);
      } else {
        apply(lastQueryRef.current);
      }
    },
    [apply, setSearchResults],
  );

  const clearSearch = useCallback(() => {
    clearPending();
    lastQueryRef.current = "";
    tagFilterRef.current = null;
    setTagFilterState(null);
    setSearchMode(false);
    setSearchResults(EMPTY);
    setActiveResultIndex(0);
  }, [setSearchResults]);

  const navigateResults = useCallback((direction: "up" | "down") => {
    setActiveResultIndex((prev) => {
      const max = resultsRef.current.results.length - 1;
      if (max < 0) return 0;
      if (direction === "down") return Math.min(prev + 1, max);
      return Math.max(prev - 1, 0);
    });
  }, []);

  const getActiveResult = useCallback((): SearchResult | null => {
    return searchResults.results[activeResultIndex] || null;
  }, [searchResults.results, activeResultIndex]);

  return {
    searchMode,
    searchResults,
    activeResultIndex,
    search,
    flushSearch,
    clearSearch,
    navigateResults,
    getActiveResult,
    tagFilter,
    setTagFilter,
    tags,
  };
}
