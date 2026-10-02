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
import { extractAllTags, nestTags, tagKey, type TagEntry } from "../utils/tags";

export const SEARCH_DEBOUNCE_MS = 150;

export interface SearchResults {
  results: SearchResult[];
  totalCount: number;
  /** The query these results answer (a typed one lands after the debounce). */
  query: string;
}

const EMPTY: SearchResults = { results: [], totalCount: 0, query: "" };

/**
 * The one search: a text query, an optional tag and folder filter, one ordered result
 * list. The index is rebuilt per note whenever the note object changes, so a
 * text edit is searchable once it commits.
 *
 * A typed query is debounced; `flushSearch` runs a pending one at once so
 * Enter straight after typing acts on the query as typed, never on the
 * results of the keystroke before. Setting a filter runs at once.
 */
export function useSearch(noteData: NoteData) {
  const searchIndexRef = useRef<SearchIndex>(new Map());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const lastQueryRef = useRef("");
  const tagFilterRef = useRef<string | null>(null);
  const folderFilterRef = useRef<string | null>(null);
  const resultsRef = useRef<SearchResults>(EMPTY);

  const [tagFilter, setTagFilterState] = useState<string | null>(null);
  const [folderFilter, setFolderFilterState] = useState<string | null>(null);
  const [searchResults, setSearchResultsState] = useState<SearchResults>(EMPTY);

  // Nested: choosing `#uni` also finds `#uni/lectures`.
  const tags = useMemo(() => nestTags(extractAllTags(noteData)), [noteData]);
  const tagsRef = useRef<Map<string, TagEntry>>(tags);
  tagsRef.current = tags;

  const setSearchResults = useCallback((r: SearchResults) => {
    resultsRef.current = r;
    setSearchResultsState(r);
  }, []);

  const run = useCallback((query: string): SearchResults => {
    const tag = tagFilterRef.current;
    const noteIds = tag ? (tagsRef.current.get(tagKey(tag))?.noteIds ?? new Set<string>()) : null;
    const folder = folderFilterRef.current;
    const raw = searchNotes(query, searchIndexRef.current, { noteIds, folder });
    return { results: raw.results, totalCount: raw.totalCount, query };
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
    if (lastQueryRef.current || tagFilterRef.current || folderFilterRef.current) {
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
      setSearchResults(run(query));
    },
    [run, setSearchResults],
  );

  const search = useCallback(
    (query: string) => {
      clearPending();
      const q = (query || "").trim();
      if (!q) {
        lastQueryRef.current = "";
        if (tagFilterRef.current || folderFilterRef.current) {
          apply("");
        } else {
          setSearchResults(EMPTY);
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
   * Run a pending query now. Returns the results to act on, the query they
   * answer, and whether they are new (in which case the highlight is at the
   * first row).
   */
  const flushSearch = useCallback((): {
    results: SearchResult[];
    query: string;
    flushed: boolean;
  } => {
    const pending = pendingQueryRef.current;
    if (pending === null) return { ...resultsRef.current, flushed: false };
    clearPending();
    apply(pending);
    return { ...resultsRef.current, flushed: true };
  }, [apply]);

  /** Set or clear a filter, optionally with the query it should run with. */
  const setFilter = useCallback(
    (ref: { current: string | null }, setState: (v: string | null) => void) =>
      (value: string | null, query?: string) => {
        ref.current = value;
        setState(value);
        clearPending();
        if (query !== undefined) lastQueryRef.current = query.trim();
        if (tagFilterRef.current || folderFilterRef.current || lastQueryRef.current) {
          apply(lastQueryRef.current);
        } else {
          setSearchResults(EMPTY);
        }
      },
    [apply, setSearchResults],
  );
  const setTagFilter = useMemo(() => setFilter(tagFilterRef, setTagFilterState), [setFilter]);
  const setFolderFilter = useMemo(
    () => setFilter(folderFilterRef, setFolderFilterState),
    [setFilter],
  );

  const clearSearch = useCallback(() => {
    clearPending();
    lastQueryRef.current = "";
    tagFilterRef.current = null;
    setTagFilterState(null);
    folderFilterRef.current = null;
    setFolderFilterState(null);
    setSearchResults(EMPTY);
  }, [setSearchResults]);

  return {
    searchResults,
    search,
    flushSearch,
    clearSearch,
    tagFilter,
    setTagFilter,
    folderFilter,
    setFolderFilter,
    tags,
  };
}
