/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNoteNavigation } from "../../src/hooks/useNoteNavigation.js";

function setup({ initialTabs = [], initialActiveNote = null, initialExpanded = {} } = {}) {
  let tabs = [...initialTabs];
  let activeNote = initialActiveNote;
  let expanded = { ...initialExpanded };

  const setTabs = vi.fn((updaterOrValue) => {
    if (typeof updaterOrValue === "function") {
      tabs = updaterOrValue(tabs);
    } else {
      tabs = updaterOrValue;
    }
  });
  const setActiveNote = vi.fn((value) => {
    activeNote = value;
  });
  const setExpanded = vi.fn((updaterOrValue) => {
    if (typeof updaterOrValue === "function") {
      expanded = updaterOrValue(expanded);
    } else {
      expanded = updaterOrValue;
    }
  });

  const { result } = renderHook(() =>
    useNoteNavigation({
      activeNote,
      setActiveNote,
      tabs,
      setTabs,
      expanded,
      setExpanded,
    }),
  );

  return {
    result,
    getTabs: () => tabs,
    getActiveNote: () => activeNote,
    getExpanded: () => expanded,
    setTabs,
    setActiveNote,
    setExpanded,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNoteNavigation", () => {
  describe("openNote", () => {
    it("adds the note id to tabs and sets activeNote", () => {
      const { result, getTabs, getActiveNote } = setup();

      act(() => {
        result.current.openNote("note-1");
      });

      expect(getTabs()).toContain("note-1");
      expect(getActiveNote()).toBe("note-1");
    });

    it("does not duplicate a tab that is already open", () => {
      const { result, getTabs } = setup({ initialTabs: ["note-1"] });

      act(() => {
        result.current.openNote("note-1");
      });

      expect(getTabs().filter((t) => t === "note-1").length).toBe(1);
    });

    it("sets newTabId temporarily for 250ms then clears it", () => {
      const { result } = setup();

      act(() => {
        result.current.openNote("note-2");
      });

      expect(result.current.newTabId).toBe("note-2");

      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(result.current.newTabId).toBeNull();
    });
  });

  describe("closeTab", () => {
    it("removes the tab after the 180ms animation delay", () => {
      const { result, getTabs } = setup({
        initialTabs: ["note-1", "note-2"],
        initialActiveNote: "note-1",
      });

      const fakeEvent = { stopPropagation: vi.fn() };

      act(() => {
        result.current.closeTab(fakeEvent, "note-2");
      });

      // Tab should still be present before the delay completes
      expect(getTabs()).toContain("note-2");

      act(() => {
        vi.advanceTimersByTime(180);
      });

      expect(getTabs()).not.toContain("note-2");
    });

    it("sets activeNote to the last remaining tab when the active tab is closed", () => {
      const { result, getActiveNote } = setup({
        initialTabs: ["note-1", "note-2", "note-3"],
        initialActiveNote: "note-2",
      });

      const fakeEvent = { stopPropagation: vi.fn() };

      act(() => {
        result.current.closeTab(fakeEvent, "note-2");
      });

      act(() => {
        vi.advanceTimersByTime(180);
      });

      // Remaining tabs are ["note-1", "note-3"]; last is "note-3"
      expect(getActiveNote()).toBe("note-3");
    });

    it("sets activeNote to null when the last tab is closed", () => {
      const { result, getActiveNote } = setup({
        initialTabs: ["note-1"],
        initialActiveNote: "note-1",
      });

      const fakeEvent = { stopPropagation: vi.fn() };

      act(() => {
        result.current.closeTab(fakeEvent, "note-1");
      });

      act(() => {
        vi.advanceTimersByTime(180);
      });

      expect(getActiveNote()).toBeNull();
    });

    it("adds the tab id to closingTabs during the animation and removes it after", () => {
      const { result } = setup({ initialTabs: ["note-1", "note-2"], initialActiveNote: "note-1" });

      const fakeEvent = { stopPropagation: vi.fn() };

      act(() => {
        result.current.closeTab(fakeEvent, "note-2");
      });

      expect(result.current.closingTabs.has("note-2")).toBe(true);

      act(() => {
        vi.advanceTimersByTime(180);
      });

      expect(result.current.closingTabs.has("note-2")).toBe(false);
    });
  });

  describe("toggle", () => {
    it("flips the expanded state for a given node key", () => {
      const { result, getExpanded } = setup({ initialExpanded: { "folder-1": false } });

      act(() => {
        result.current.toggle("folder-1");
      });

      expect(getExpanded()["folder-1"]).toBe(true);

      act(() => {
        result.current.toggle("folder-1");
      });

      expect(getExpanded()["folder-1"]).toBe(false);
    });
  });
});
