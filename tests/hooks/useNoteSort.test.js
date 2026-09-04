/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNoteSort } from "../../src/hooks/useNoteSort";
import { SORT_ALPHA, SORT_RECENT } from "../../src/utils/noteSort";

const MODE_KEY = "boojy-note-sort";
const OPENED_KEY = "boojy-note-opened";

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("sort mode", () => {
  it("defaults to Most recent", () => {
    const { result } = renderHook(() => useNoteSort());
    expect(result.current.sortMode).toBe(SORT_RECENT);
  });

  it("restores a saved mode", () => {
    localStorage.setItem(MODE_KEY, SORT_ALPHA);
    const { result } = renderHook(() => useNoteSort());
    expect(result.current.sortMode).toBe(SORT_ALPHA);
  });

  it("falls back to the default when the stored value is junk", () => {
    localStorage.setItem(MODE_KEY, "manual");
    const { result } = renderHook(() => useNoteSort());
    expect(result.current.sortMode).toBe(SORT_RECENT);
  });

  it("persists a change immediately", () => {
    const { result } = renderHook(() => useNoteSort());
    act(() => result.current.setSortMode(SORT_ALPHA));
    expect(result.current.sortMode).toBe(SORT_ALPHA);
    expect(localStorage.getItem(MODE_KEY)).toBe(SORT_ALPHA);
  });

  it("refuses a mode it doesn't know", () => {
    const { result } = renderHook(() => useNoteSort());
    act(() => result.current.setSortMode("manual"));
    expect(result.current.sortMode).toBe(SORT_RECENT);
  });
});

describe("edited this session", () => {
  it("starts empty and stamps every id it is given with the same instant", () => {
    const { result } = renderHook(() => useNoteSort());
    expect(result.current.editedAt).toEqual({});
    act(() => result.current.markEdited(["n1", "n2"]));
    expect(result.current.editedAt.n1).toBeGreaterThan(0);
    expect(result.current.editedAt.n2).toBe(result.current.editedAt.n1);
  });

  it("ignores an empty call without churning state", () => {
    const { result } = renderHook(() => useNoteSort());
    const before = result.current.editedAt;
    act(() => result.current.markEdited([]));
    expect(result.current.editedAt).toBe(before);
  });

  // Recency is never persisted by the app: after a restart the file mtime is
  // the truth. The old last-opened key is neither read nor written.
  it("persists nothing, and no longer reads the old last-opened key", () => {
    localStorage.setItem(OPENED_KEY, JSON.stringify({ n1: 1234 }));
    const { result } = renderHook(() => useNoteSort());
    expect(result.current.editedAt).toEqual({});
    act(() => result.current.markEdited(["n1"]));
    expect(localStorage.getItem(OPENED_KEY)).toBe(JSON.stringify({ n1: 1234 }));
    expect(Object.keys(localStorage)).toEqual([OPENED_KEY]);
  });
});
