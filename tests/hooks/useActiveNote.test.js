/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const loadFromStorage = vi.fn(() => null);
vi.mock("../../src/utils/storage", () => ({
  loadFromStorage: (...args) => loadFromStorage(...args),
}));

import { useActiveNote, resolveInitialActiveNote } from "../../src/hooks/useActiveNote";

function setUiState(obj) {
  localStorage.setItem("boojy-ui-state", JSON.stringify(obj));
}

beforeEach(() => {
  localStorage.clear();
  loadFromStorage.mockReset().mockReturnValue(null);
});

describe("resolveInitialActiveNote", () => {
  describe("migration from the old split/tab shape", () => {
    it("takes the active pane's note from a persisted split", () => {
      setUiState({
        activeNote: "stale-top-level",
        tabs: ["n1", "n2", "n3"],
        splitState: {
          splitMode: "vertical",
          activePaneId: "right",
          panes: {
            left: { tabs: ["n1", "n2"], activeNote: "n1" },
            right: { tabs: ["n3"], activeNote: "n3" },
          },
        },
      });
      expect(resolveInitialActiveNote()).toBe("n3");
    });

    it("falls back through panes in left/top/right/bottom order when the active pane is empty", () => {
      setUiState({
        splitState: {
          splitMode: "horizontal",
          activePaneId: "bottom",
          panes: {
            top: { tabs: ["n1"], activeNote: "n1" },
            bottom: { tabs: [], activeNote: null },
          },
        },
      });
      expect(resolveInitialActiveNote()).toBe("n1");
    });

    it("ignores legacy tabs entirely — hidden tabs are dropped, not resurrected", () => {
      setUiState({
        tabs: ["n1", "n2", "n3"],
        splitState: {
          splitMode: null,
          activePaneId: "left",
          panes: { left: { tabs: ["n1", "n2", "n3"], activeNote: "n2" }, right: { tabs: [] } },
        },
      });
      expect(resolveInitialActiveNote()).toBe("n2");
    });
  });

  it("uses the top-level activeNote when there is no splitState (current write shape)", () => {
    setUiState({ activeNote: "n7", expanded: { Folder: true } });
    expect(resolveInitialActiveNote()).toBe("n7");
  });

  it("falls back to the legacy web blob only when the note still exists there", () => {
    loadFromStorage.mockReturnValue({ activeNote: "n9", noteData: { n9: { title: "Nine" } } });
    expect(resolveInitialActiveNote()).toBe("n9");

    loadFromStorage.mockReturnValue({ activeNote: "gone", noteData: {} });
    expect(resolveInitialActiveNote()).toBeNull();
  });

  it("survives corrupt ui-state JSON", () => {
    localStorage.setItem("boojy-ui-state", "{not json");
    expect(resolveInitialActiveNote()).toBeNull();
  });

  it("returns null when nothing is persisted anywhere", () => {
    expect(resolveInitialActiveNote()).toBeNull();
  });
});

describe("useActiveNote", () => {
  it("initialises from persisted state and updates via setActiveNote", () => {
    setUiState({ activeNote: "n1" });
    const { result } = renderHook(() => useActiveNote());
    expect(result.current.activeNote).toBe("n1");

    act(() => result.current.setActiveNote("n2"));
    expect(result.current.activeNote).toBe("n2");

    act(() => result.current.setActiveNote(null));
    expect(result.current.activeNote).toBeNull();
  });
});
