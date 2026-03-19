/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearch } from "../../src/hooks/useSearch.js";

vi.mock("../../src/utils/search", () => ({
  buildSearchIndex: vi.fn(() => new Map()),
  updateIndexEntry: vi.fn(),
  removeIndexEntry: vi.fn(),
  searchNotes: vi.fn(() => ({ results: [], totalCount: 0 })),
  groupByFolder: vi.fn(() => []),
}));

import {
  buildSearchIndex,
  updateIndexEntry,
  removeIndexEntry,
  searchNotes,
  groupByFolder,
} from "../../src/utils/search";

function makeNoteData(...ids) {
  const data = {};
  for (const id of ids) {
    data[id] = { id, title: `Note ${id}`, folder: null, content: { blocks: [] } };
  }
  return data;
}

function setup(initialNoteData = {}) {
  const noteDataRef = { current: initialNoteData };
  const { result, rerender } = renderHook(({ noteData }) => useSearch(noteData, noteDataRef), {
    initialProps: { noteData: initialNoteData },
  });
  return {
    result,
    rerender: (nextNoteData) => {
      noteDataRef.current = nextNoteData;
      rerender({ noteData: nextNoteData });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  buildSearchIndex.mockReturnValue(new Map());
  searchNotes.mockReturnValue({ results: [], totalCount: 0 });
  groupByFolder.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSearch", () => {
  // 1. search returns matching results
  it("returns matching results from searchNotes", () => {
    const mockResults = [{ id: "note-1", title: "Hello World", snippet: "Hello World" }];
    searchNotes.mockReturnValue({ results: mockResults, totalCount: 1 });
    groupByFolder.mockReturnValue([{ folder: null, notes: mockResults }]);

    const noteData = makeNoteData("note-1");
    const { result } = setup(noteData);

    act(() => {
      result.current.search("hello");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.searchMode).toBe(true);
    expect(result.current.searchResults.results).toEqual(mockResults);
    expect(result.current.searchResults.totalCount).toBe(1);
  });

  // 2. search debounces by 150ms
  it("debounces search by 150ms", () => {
    const noteData = makeNoteData("note-1");
    const { result } = setup(noteData);

    act(() => {
      result.current.search("test");
    });

    // searchNotes should not be called yet
    expect(searchNotes).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(searchNotes).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(searchNotes).toHaveBeenCalled();
  });

  // 3. empty query clears results
  it("clears results and exits search mode when query is empty", () => {
    const mockResults = [{ id: "note-1", title: "Hello" }];
    searchNotes.mockReturnValue({ results: mockResults, totalCount: 1 });

    const noteData = makeNoteData("note-1");
    const { result } = setup(noteData);

    // First perform a real search
    act(() => {
      result.current.search("hello");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current.searchMode).toBe(true);

    // Now search with empty string
    act(() => {
      result.current.search("");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.searchMode).toBe(false);
    expect(result.current.searchResults.results).toHaveLength(0);
    expect(result.current.searchResults.totalCount).toBe(0);
  });

  // 4. clearSearch resets all state
  it("clearSearch resets searchMode, results, and activeResultIndex", () => {
    const mockResults = [{ id: "note-1" }, { id: "note-2" }];
    searchNotes.mockReturnValue({ results: mockResults, totalCount: 2 });
    groupByFolder.mockReturnValue([]);

    const noteData = makeNoteData("note-1", "note-2");
    const { result } = setup(noteData);

    act(() => {
      result.current.search("test");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    act(() => {
      result.current.navigateResults("down");
    });
    expect(result.current.activeResultIndex).toBe(1);

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.searchMode).toBe(false);
    expect(result.current.searchResults.results).toHaveLength(0);
    expect(result.current.searchResults.totalCount).toBe(0);
    expect(result.current.activeResultIndex).toBe(0);
  });

  // 5. navigateResults increments index (direction "down")
  it("navigateResults with direction 'down' increments activeResultIndex", () => {
    const mockResults = [{ id: "note-1" }, { id: "note-2" }, { id: "note-3" }];
    searchNotes.mockReturnValue({ results: mockResults, totalCount: 3 });

    const noteData = makeNoteData("note-1", "note-2", "note-3");
    const { result } = setup(noteData);

    act(() => {
      result.current.search("test");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.activeResultIndex).toBe(0);

    act(() => {
      result.current.navigateResults("down");
    });
    expect(result.current.activeResultIndex).toBe(1);

    act(() => {
      result.current.navigateResults("down");
    });
    expect(result.current.activeResultIndex).toBe(2);
  });

  // 6. navigateResults decrements index (direction "up")
  it("navigateResults with direction 'up' decrements activeResultIndex", () => {
    const mockResults = [{ id: "note-1" }, { id: "note-2" }, { id: "note-3" }];
    searchNotes.mockReturnValue({ results: mockResults, totalCount: 3 });

    const noteData = makeNoteData("note-1", "note-2", "note-3");
    const { result } = setup(noteData);

    act(() => {
      result.current.search("test");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    act(() => {
      result.current.navigateResults("down");
    });
    act(() => {
      result.current.navigateResults("down");
    });
    expect(result.current.activeResultIndex).toBe(2);

    act(() => {
      result.current.navigateResults("up");
    });
    expect(result.current.activeResultIndex).toBe(1);
  });

  // 7. navigateResults clamps at boundaries
  it("navigateResults clamps at lower boundary (0)", () => {
    const mockResults = [{ id: "note-1" }, { id: "note-2" }];
    searchNotes.mockReturnValue({ results: mockResults, totalCount: 2 });

    const noteData = makeNoteData("note-1", "note-2");
    const { result } = setup(noteData);

    act(() => {
      result.current.search("test");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Already at 0, going up should stay at 0
    act(() => {
      result.current.navigateResults("up");
    });
    expect(result.current.activeResultIndex).toBe(0);
  });

  it("navigateResults clamps at upper boundary (results.length - 1)", () => {
    const mockResults = [{ id: "note-1" }, { id: "note-2" }];
    searchNotes.mockReturnValue({ results: mockResults, totalCount: 2 });

    const noteData = makeNoteData("note-1", "note-2");
    const { result } = setup(noteData);

    act(() => {
      result.current.search("test");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    act(() => {
      result.current.navigateResults("down");
    });
    expect(result.current.activeResultIndex).toBe(1);

    // At max index, going down should stay at 1
    act(() => {
      result.current.navigateResults("down");
    });
    expect(result.current.activeResultIndex).toBe(1);
  });

  // 8. getActiveResult returns correct entry
  it("getActiveResult returns the result at activeResultIndex", () => {
    const mockResults = [
      { id: "note-1", title: "Alpha" },
      { id: "note-2", title: "Beta" },
    ];
    searchNotes.mockReturnValue({ results: mockResults, totalCount: 2 });

    const noteData = makeNoteData("note-1", "note-2");
    const { result } = setup(noteData);

    act(() => {
      result.current.search("test");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.getActiveResult()).toEqual(mockResults[0]);

    act(() => {
      result.current.navigateResults("down");
    });

    expect(result.current.getActiveResult()).toEqual(mockResults[1]);
  });

  // 8b. getActiveResult returns null when no results
  it("getActiveResult returns null when there are no results", () => {
    const { result } = setup({});

    expect(result.current.getActiveResult()).toBeNull();
  });

  // 9. Re-runs search on noteData change when lastQuery exists
  it("re-runs search when noteData changes and a query was previously set", () => {
    const initialNoteData = makeNoteData("note-1");
    const { result, rerender } = setup(initialNoteData);

    act(() => {
      result.current.search("hello");
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    const callsBefore = searchNotes.mock.calls.length;

    const updatedNoteData = makeNoteData("note-1", "note-2");
    act(() => {
      rerender(updatedNoteData);
    });

    expect(searchNotes.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  // 10. Builds initial index on first noteData
  it("builds the search index when noteData is first provided", () => {
    const noteData = makeNoteData("note-1", "note-2");
    setup(noteData);

    expect(buildSearchIndex).toHaveBeenCalledWith(noteData);
  });

  // 11. Incremental index update when notes change
  it("calls updateIndexEntry for new notes and removeIndexEntry for removed notes", () => {
    const initialNoteData = makeNoteData("note-1", "note-2");
    const { rerender } = setup(initialNoteData);

    // Add note-3, remove note-2
    const updatedNoteData = makeNoteData("note-1", "note-3");
    act(() => {
      rerender(updatedNoteData);
    });

    expect(updateIndexEntry).toHaveBeenCalledWith(
      expect.any(Map),
      "note-3",
      updatedNoteData["note-3"],
    );
    expect(removeIndexEntry).toHaveBeenCalledWith(expect.any(Map), "note-2");
  });

  // 12. Handles special characters in query
  it("passes special characters in query directly through to searchNotes", () => {
    const noteData = makeNoteData("note-1");
    const { result } = setup(noteData);

    const specialQuery = "hello (world) [test] {foo} ^bar$";

    act(() => {
      result.current.search(specialQuery);
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(searchNotes).toHaveBeenCalledWith(specialQuery, expect.any(Map));
  });
});
