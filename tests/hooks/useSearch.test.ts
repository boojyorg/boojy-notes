/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_DEBOUNCE_MS, useSearch } from "../../src/hooks/useSearch";
import type { Block, NoteData } from "../../src/types/notes";

const p = (id: string, text: string) => ({ id, type: "p", text }) as Block;
const note = (title: string, text: string, lastModified = 0) =>
  ({
    title,
    folder: null,
    content: { title, blocks: [p(`b-${title}`, text)] },
    lastModified,
  }) as never;

function setup(initial: NoteData) {
  const hook = renderHook(({ noteData }) => useSearch(noteData), {
    initialProps: { noteData: initial },
  });
  return { ...hook, rerender: (noteData: NoteData) => hook.rerender({ noteData }) };
}
const ids = (r: { current: { searchResults: { results: { noteId: string }[] } } }) =>
  r.current.searchResults.results.map((x) => x.noteId);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSearch", () => {
  const data: NoteData = {
    a: note("Alpha", "hello world #work", 1),
    b: note("Beta", "hello again", 2),
    c: note("Gamma", "nothing #work", 3),
  };

  it("debounces a typed query and answers with one ordered list", () => {
    const { result } = setup(data);
    act(() => result.current.search("hello"));
    expect(result.current.searchMode).toBe(false);
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1));
    expect(ids(result)).toEqual([]);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.searchMode).toBe(true);
    expect(ids(result)).toEqual(["b", "a"]);
    expect(result.current.activeResultIndex).toBe(0);
  });

  it("flushSearch runs a pending query at once, so Enter acts on the query as typed", () => {
    const { result } = setup(data);
    act(() => result.current.search("hel"));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    act(() => result.current.search("gam"));
    let flushed: { results: { noteId: string }[]; flushed: boolean } | undefined;
    act(() => {
      flushed = result.current.flushSearch();
    });
    expect(flushed?.flushed).toBe(true);
    expect(flushed?.results.map((r) => r.noteId)).toEqual(["c"]);
    expect(ids(result)).toEqual(["c"]);
    // Nothing pending: the current results, not new ones.
    act(() => {
      flushed = result.current.flushSearch();
    });
    expect(flushed?.flushed).toBe(false);
  });

  it("an empty query clears; clearSearch clears everything, the filter included", () => {
    const { result } = setup(data);
    act(() => result.current.search("hello"));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    act(() => result.current.search(""));
    expect(result.current.searchMode).toBe(false);
    expect(ids(result)).toEqual([]);
    act(() => result.current.setTagFilter("work", ""));
    expect(result.current.tagFilter).toBe("work");
    act(() => result.current.clearSearch());
    expect(result.current.tagFilter).toBeNull();
    expect(result.current.searchMode).toBe(false);
  });

  it("the tag filter lists the tagged notes at once, newest first, and text searches within them", () => {
    const { result } = setup(data);
    act(() => result.current.setTagFilter("work", ""));
    expect(result.current.searchMode).toBe(true);
    expect(ids(result)).toEqual(["c", "a"]);
    act(() => result.current.search("hello"));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(ids(result)).toEqual(["a"]);
    // Clearing the text with the filter on goes back to the tagged list.
    act(() => result.current.search(""));
    expect(ids(result)).toEqual(["c", "a"]);
    // Removing the filter with no text clears the list.
    act(() => result.current.setTagFilter(null));
    expect(ids(result)).toEqual([]);
    expect(result.current.searchMode).toBe(false);
  });

  it("the filter is exact: #work never lists a note that only says #workshop", () => {
    const { result } = setup({ ...data, d: note("Delta", "a #workshop", 9) });
    act(() => result.current.setTagFilter("work", ""));
    expect(ids(result)).toEqual(["c", "a"]);
  });

  it("re-indexes a note whose text changed, so results never go stale mid-typing", () => {
    const { result, rerender } = setup(data);
    act(() => result.current.search("zebra"));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(ids(result)).toEqual([]);
    // A text-only edit: same title, same block count, a new note object.
    rerender({ ...data, b: note("Beta", "a zebra appears", 2) });
    expect(ids(result)).toEqual(["b"]);
    // And the tag map follows the text too.
    expect(result.current.tags.has("work")).toBe(true);
    rerender({ ...data, b: note("Beta", "#zebra", 2) });
    expect(result.current.tags.has("zebra")).toBe(true);
  });

  it("drops a deleted note from the results", () => {
    const { result, rerender } = setup(data);
    act(() => result.current.search("hello"));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(ids(result)).toEqual(["b", "a"]);
    const { b: _gone, ...rest } = data;
    rerender(rest);
    expect(ids(result)).toEqual(["a"]);
  });

  it("navigateResults walks the list and clamps at both ends", () => {
    const { result } = setup(data);
    act(() => result.current.search("hello"));
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    act(() => result.current.navigateResults("up"));
    expect(result.current.activeResultIndex).toBe(0);
    act(() => result.current.navigateResults("down"));
    act(() => result.current.navigateResults("down"));
    expect(result.current.activeResultIndex).toBe(1);
    expect(result.current.getActiveResult()?.noteId).toBe("a");
  });
});
