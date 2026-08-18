/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/utils/platform", () => ({
  isNative: false,
}));
vi.mock("../../src/utils/storage", () => ({
  STORAGE_KEY: "boojy-notes-v1",
  saveToIDB: vi.fn(() => Promise.resolve()),
}));

import { useAppPersistence } from "../../src/hooks/useAppPersistence";

function deps(overrides = {}) {
  return {
    activeNote: "n1",
    expanded: { Folder: true },
    noteData: { n1: { title: "One" } },
    customFolders: ["Folder"],
    showToast: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useAppPersistence", () => {
  it("writes only { activeNote, expanded } to boojy-ui-state — no tabs, no splitState", () => {
    renderHook(() => useAppPersistence(deps()));
    vi.advanceTimersByTime(300);

    const ui = JSON.parse(localStorage.getItem("boojy-ui-state"));
    expect(ui).toEqual({ activeNote: "n1", expanded: { Folder: true } });
    expect(Object.keys(ui).sort()).toEqual(["activeNote", "expanded"]);
  });

  it("persists the web blob without a tabs key", () => {
    renderHook(() => useAppPersistence(deps()));
    vi.advanceTimersByTime(2000);

    const blob = JSON.parse(localStorage.getItem("boojy-notes-v1"));
    expect(blob.activeNote).toBe("n1");
    expect(blob.noteData.n1.title).toBe("One");
    expect(blob).not.toHaveProperty("tabs");
  });

  it("debounces the ui-state write", () => {
    renderHook(() => useAppPersistence(deps()));
    vi.advanceTimersByTime(200);
    expect(localStorage.getItem("boojy-ui-state")).toBeNull();
    vi.advanceTimersByTime(100);
    expect(localStorage.getItem("boojy-ui-state")).not.toBeNull();
  });
});
