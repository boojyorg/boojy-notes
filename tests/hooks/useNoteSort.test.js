/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNoteSort } from "../../src/hooks/useNoteSort";
import { SORT_ALPHA, SORT_RECENT } from "../../src/utils/noteSort";

const MODE_KEY = "boojy-note-sort";
const OPENED_KEY = "boojy-note-opened";

const notes = { n1: { title: "One" }, n2: { title: "Two" } };
const opened = () => JSON.parse(localStorage.getItem(OPENED_KEY) || "null");

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("sort mode", () => {
  it("defaults to Most recent", () => {
    const { result } = renderHook(() => useNoteSort(notes));
    expect(result.current.sortMode).toBe(SORT_RECENT);
  });

  it("restores a saved mode", () => {
    localStorage.setItem(MODE_KEY, SORT_ALPHA);
    const { result } = renderHook(() => useNoteSort(notes));
    expect(result.current.sortMode).toBe(SORT_ALPHA);
  });

  it("falls back to the default when the stored value is junk", () => {
    localStorage.setItem(MODE_KEY, "manual");
    const { result } = renderHook(() => useNoteSort(notes));
    expect(result.current.sortMode).toBe(SORT_RECENT);
  });

  it("persists a change immediately", () => {
    const { result } = renderHook(() => useNoteSort(notes));
    act(() => result.current.setSortMode(SORT_ALPHA));
    expect(result.current.sortMode).toBe(SORT_ALPHA);
    expect(localStorage.getItem(MODE_KEY)).toBe(SORT_ALPHA);
  });

  it("refuses a mode it doesn't know", () => {
    const { result } = renderHook(() => useNoteSort(notes));
    act(() => result.current.setSortMode("manual"));
    expect(result.current.sortMode).toBe(SORT_RECENT);
  });
});

describe("last opened", () => {
  it("starts empty and stamps on open", () => {
    const { result } = renderHook(() => useNoteSort(notes));
    expect(result.current.lastOpened).toEqual({});
    act(() => result.current.markOpened("n1"));
    expect(result.current.lastOpened.n1).toBeGreaterThan(0);
  });

  it("restores saved timestamps, dropping non-numeric entries", () => {
    localStorage.setItem(OPENED_KEY, JSON.stringify({ n1: 1234, n2: "yesterday" }));
    const { result } = renderHook(() => useNoteSort(notes));
    expect(result.current.lastOpened).toEqual({ n1: 1234 });
  });

  it("survives an unparseable store", () => {
    localStorage.setItem(OPENED_KEY, "{{{");
    const { result } = renderHook(() => useNoteSort(notes));
    expect(result.current.lastOpened).toEqual({});
  });

  it("writes the map, pruned to notes that still exist", async () => {
    vi.useFakeTimers();
    localStorage.setItem(OPENED_KEY, JSON.stringify({ n1: 100, gone: 200 }));
    renderHook(() => useNoteSort(notes));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(opened()).toEqual({ n1: 100 });
  });

  // The guard that matters: noteData is {} until notes finish loading, so an
  // unguarded prune would erase every timestamp on launch.
  it("does not write while the note store is still empty", async () => {
    vi.useFakeTimers();
    localStorage.setItem(OPENED_KEY, JSON.stringify({ n1: 100 }));
    renderHook(() => useNoteSort({}));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(opened()).toEqual({ n1: 100 });
  });

  it("writes once the notes arrive", async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ data }) => useNoteSort(data), {
      initialProps: { data: {} },
    });
    rerender({ data: notes });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(opened()).toEqual({});
  });
});
