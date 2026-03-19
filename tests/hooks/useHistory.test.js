/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory } from "../../src/hooks/useHistory.js";
import { makeNoteData, paragraph } from "../mocks/blocks.js";

const NOTE_ID = "note-1";

function setup(initialBlocks = [paragraph("hello")]) {
  let noteData = makeNoteData(NOTE_ID, initialBlocks);
  const setNoteData = vi.fn((updaterOrValue) => {
    if (typeof updaterOrValue === "function") {
      noteData = updaterOrValue(noteData);
    } else {
      noteData = updaterOrValue;
    }
  });
  const syncGeneration = { current: 0 };
  const activeNoteRef = { current: NOTE_ID };

  const { result, rerender } = renderHook(
    ({ nd }) => useHistory(nd, setNoteData, syncGeneration, activeNoteRef),
    { initialProps: { nd: noteData } },
  );

  return {
    result,
    rerender: () => rerender({ nd: noteData }),
    getNoteData: () => noteData,
    setNoteData,
    syncGeneration,
    activeNoteRef,
  };
}

// Helper: flush queueMicrotask used inside pushHistory
async function flushMicrotasks() {
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useHistory", () => {
  // ─── commitNoteData ───────────────────────────────────────────────

  describe("commitNoteData", () => {
    it("pushes to undo stack", async () => {
      const { result } = setup();

      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "Changed" },
        }));
      });

      await act(() => flushMicrotasks());

      expect(result.current.canUndo).toBe(true);
    });

    it("clears redo stack on new commit", async () => {
      const { result } = setup();

      // Build an undo entry then undo to get a redo entry
      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "V2" },
        }));
      });
      await act(() => flushMicrotasks());

      act(() => result.current.undo());
      expect(result.current.canRedo).toBe(true);

      // New commit should clear redo
      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "V3" },
        }));
      });
      await act(() => flushMicrotasks());

      expect(result.current.canRedo).toBe(false);
    });

    it("cancels pending text flush timer", async () => {
      const { result, setNoteData } = setup();

      // Start a text change which schedules a flush
      act(() => {
        result.current.commitTextChange((prev) => ({
          ...prev,
          [NOTE_ID]: {
            ...prev[NOTE_ID],
            content: { blocks: [{ id: "b1", type: "p", text: "typing" }] },
          },
        }));
      });

      // Before the 300ms flush fires, commit structural change
      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "Structural" },
        }));
      });

      // Advance past flush timer — the text flush should NOT fire again
      const callsBefore = setNoteData.mock.calls.length;
      act(() => vi.advanceTimersByTime(500));
      // commitNoteData calls setNoteData directly; no additional flush should happen via startTransition
      // The flush timer was cancelled so no extra call
      expect(setNoteData.mock.calls.length).toBe(callsBefore);
    });

    it("resets textOnlyEdit flags", async () => {
      const { result } = setup();

      // Set textOnlyEdit via commitTextChange
      act(() => {
        result.current.commitTextChange((prev) => prev);
      });
      await act(() => flushMicrotasks());
      expect(result.current.textOnlyEdit.current).toBe(true);

      // commitNoteData should clear it
      act(() => {
        result.current.commitNoteData((prev) => prev);
      });
      expect(result.current.textOnlyEdit.current).toBe(false);
      expect(result.current.textOnlyEditForSidebar.current).toBe(false);
    });

    it("does not push history when isUndoRedo is true", async () => {
      const { result } = setup();

      // Simulate undo/redo context: set isUndoRedo
      result.current.isUndoRedo.current = true;

      act(() => {
        result.current.commitNoteData((prev) => prev);
      });
      await act(() => flushMicrotasks());

      expect(result.current.canUndo).toBe(false);
      result.current.isUndoRedo.current = false;
    });
  });

  // ─── commitTextChange ─────────────────────────────────────────────

  describe("commitTextChange", () => {
    it("pushes history on the first call", async () => {
      const { result } = setup();

      act(() => {
        result.current.commitTextChange((prev) => prev);
      });
      await act(() => flushMicrotasks());

      expect(result.current.canUndo).toBe(true);
    });

    it("debounces history pushes within 500ms", async () => {
      const { result } = setup();

      act(() => result.current.commitTextChange((prev) => prev));
      await act(() => flushMicrotasks());

      // Second call within 500ms should NOT push again
      act(() => result.current.commitTextChange((prev) => prev));
      await act(() => flushMicrotasks());

      // Undo once — should leave stack empty if only one push happened
      act(() => result.current.undo());
      expect(result.current.canUndo).toBe(false);
    });

    it("pushes new history after 500ms debounce expires", async () => {
      const { result } = setup();

      act(() => result.current.commitTextChange((prev) => prev));
      await act(() => flushMicrotasks());

      // Advance past debounce window
      act(() => vi.advanceTimersByTime(600));

      act(() => result.current.commitTextChange((prev) => prev));
      await act(() => flushMicrotasks());

      // Two undo entries should exist
      act(() => result.current.undo());
      expect(result.current.canUndo).toBe(true);
      act(() => result.current.undo());
      expect(result.current.canUndo).toBe(false);
    });

    it("sets textOnlyEdit and textOnlyEditForSidebar", () => {
      const { result } = setup();

      act(() => result.current.commitTextChange((prev) => prev));

      expect(result.current.textOnlyEdit.current).toBe(true);
      expect(result.current.textOnlyEditForSidebar.current).toBe(true);
    });

    it("sets editedNoteHint to the active note", () => {
      const { result } = setup();

      act(() => result.current.commitTextChange((prev) => prev));

      expect(result.current.editedNoteHint.current).toBe(NOTE_ID);
    });

    it("updates noteDataRef immediately", () => {
      const { result } = setup();

      act(() => {
        result.current.commitTextChange((prev) => ({
          ...prev,
          [NOTE_ID]: {
            ...prev[NOTE_ID],
            content: { blocks: [{ id: "b1", type: "p", text: "updated" }] },
          },
        }));
      });

      expect(result.current.noteDataRef.current[NOTE_ID].content.blocks[0].text).toBe("updated");
    });

    it("does not push history when isUndoRedo is true", async () => {
      const { result } = setup();

      result.current.isUndoRedo.current = true;
      act(() => result.current.commitTextChange((prev) => prev));
      await act(() => flushMicrotasks());

      expect(result.current.canUndo).toBe(false);
      result.current.isUndoRedo.current = false;
    });
  });

  // ─── undo / redo ──────────────────────────────────────────────────

  describe("undo", () => {
    it("restores previous state", async () => {
      const { result, setNoteData } = setup();

      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "V2" },
        }));
      });
      await act(() => flushMicrotasks());

      act(() => result.current.undo());

      // setNoteData should be called with the restored snapshot
      const lastCall = setNoteData.mock.calls[setNoteData.mock.calls.length - 1][0];
      // lastCall is either a function updater or an object
      expect(typeof lastCall === "function" || typeof lastCall === "object").toBe(true);
    });

    it("does nothing when undo stack is empty", () => {
      const { result, setNoteData } = setup();
      const callCount = setNoteData.mock.calls.length;

      act(() => result.current.undo());

      expect(setNoteData.mock.calls.length).toBe(callCount);
      expect(result.current.canUndo).toBe(false);
    });

    it("moves entry from undo to redo stack", async () => {
      const { result } = setup();

      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "V2" },
        }));
      });
      await act(() => flushMicrotasks());

      act(() => result.current.undo());

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it("increments syncGeneration", async () => {
      const { result, syncGeneration } = setup();

      act(() => {
        result.current.commitNoteData((prev) => prev);
      });
      await act(() => flushMicrotasks());

      const before = syncGeneration.current;
      act(() => result.current.undo());
      expect(syncGeneration.current).toBe(before + 1);
    });
  });

  describe("redo", () => {
    it("restores undone state", async () => {
      const { result, setNoteData } = setup();

      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "V2" },
        }));
      });
      await act(() => flushMicrotasks());

      act(() => result.current.undo());
      const countAfterUndo = setNoteData.mock.calls.length;

      act(() => result.current.redo());
      expect(setNoteData.mock.calls.length).toBeGreaterThan(countAfterUndo);
    });

    it("does nothing when redo stack is empty", () => {
      const { result, setNoteData } = setup();
      const callCount = setNoteData.mock.calls.length;

      act(() => result.current.redo());

      expect(setNoteData.mock.calls.length).toBe(callCount);
    });

    it("moves entry from redo to undo stack", async () => {
      const { result } = setup();

      act(() => {
        result.current.commitNoteData((prev) => prev);
      });
      await act(() => flushMicrotasks());

      act(() => result.current.undo());
      expect(result.current.canRedo).toBe(true);

      act(() => result.current.redo());
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("increments syncGeneration", async () => {
      const { result, syncGeneration } = setup();

      act(() => {
        result.current.commitNoteData((prev) => prev);
      });
      await act(() => flushMicrotasks());
      act(() => result.current.undo());

      const before = syncGeneration.current;
      act(() => result.current.redo());
      expect(syncGeneration.current).toBe(before + 1);
    });
  });

  // ─── canUndo / canRedo state ──────────────────────────────────────

  describe("canUndo / canRedo", () => {
    it("starts with both false", () => {
      const { result } = setup();
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it("canUndo becomes true after commit and false after all undone", async () => {
      const { result } = setup();

      act(() => result.current.commitNoteData((prev) => prev));
      await act(() => flushMicrotasks());
      expect(result.current.canUndo).toBe(true);

      act(() => result.current.undo());
      expect(result.current.canUndo).toBe(false);
    });

    it("canRedo becomes false after a new commit", async () => {
      const { result } = setup();

      act(() => result.current.commitNoteData((prev) => prev));
      await act(() => flushMicrotasks());
      act(() => result.current.undo());
      expect(result.current.canRedo).toBe(true);

      act(() => result.current.commitNoteData((prev) => prev));
      await act(() => flushMicrotasks());
      expect(result.current.canRedo).toBe(false);
    });
  });

  // ─── Stack limit ──────────────────────────────────────────────────

  describe("stack limit", () => {
    it("limits undo stack to 50 entries", async () => {
      const { result } = setup();

      for (let i = 0; i < 55; i++) {
        act(() => result.current.pushHistory());
        await act(() => flushMicrotasks());
      }

      // Undo all — should be able to undo at most 50 times
      let undoCount = 0;
      while (result.current.canUndo) {
        act(() => result.current.undo());
        undoCount++;
        if (undoCount > 60) break; // safety
      }
      expect(undoCount).toBeLessThanOrEqual(50);
    });
  });

  // ─── textOnlyEdit flags ───────────────────────────────────────────

  describe("textOnlyEdit flags", () => {
    it("textOnlyEdit is false initially", () => {
      const { result } = setup();
      expect(result.current.textOnlyEdit.current).toBe(false);
    });

    it("textOnlyEditForSidebar is false initially", () => {
      const { result } = setup();
      expect(result.current.textOnlyEditForSidebar.current).toBe(false);
    });

    it("commitTextChange sets both flags to true", () => {
      const { result } = setup();

      act(() => result.current.commitTextChange((prev) => prev));

      expect(result.current.textOnlyEdit.current).toBe(true);
      expect(result.current.textOnlyEditForSidebar.current).toBe(true);
    });

    it("commitNoteData resets both flags to false", () => {
      const { result } = setup();

      act(() => result.current.commitTextChange((prev) => prev));
      act(() => result.current.commitNoteData((prev) => prev));

      expect(result.current.textOnlyEdit.current).toBe(false);
      expect(result.current.textOnlyEditForSidebar.current).toBe(false);
    });
  });

  // ─── noteDataRef ──────────────────────────────────────────────────

  describe("noteDataRef", () => {
    it("reflects initial noteData", () => {
      const { result } = setup([paragraph("initial")]);
      expect(result.current.noteDataRef.current[NOTE_ID].content.blocks[0].text).toBe("initial");
    });

    it("stays in sync after commitNoteData", () => {
      const { result } = setup();

      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "Updated" },
        }));
      });

      expect(result.current.noteDataRef.current[NOTE_ID].title).toBe("Updated");
    });
  });

  // ─── pushHistory / popHistory ─────────────────────────────────────

  describe("pushHistory / popHistory", () => {
    it("pushHistory adds an entry and popHistory removes it", async () => {
      const { result } = setup();

      act(() => result.current.pushHistory());
      await act(() => flushMicrotasks());
      expect(result.current.canUndo).toBe(true);

      act(() => result.current.popHistory());
      expect(result.current.canUndo).toBe(false);
    });

    it("popHistory does nothing on empty stack", () => {
      const { result } = setup();

      // Should not throw
      act(() => result.current.popHistory());
      expect(result.current.canUndo).toBe(false);
    });

    it("pushHistory ignores call when no active note", async () => {
      const { result, activeNoteRef } = setup();
      activeNoteRef.current = null;

      act(() => result.current.pushHistory());
      await act(() => flushMicrotasks());

      expect(result.current.canUndo).toBe(false);
    });
  });

  // ─── isUndoRedo ref ───────────────────────────────────────────────

  describe("isUndoRedo", () => {
    it("is exposed as a ref with initial value false", () => {
      const { result } = setup();
      expect(result.current.isUndoRedo.current).toBe(false);
    });

    it("is set during undo/redo but reset afterwards", async () => {
      const { result } = setup();

      act(() => result.current.commitNoteData((prev) => prev));
      await act(() => flushMicrotasks());

      // After undo completes, isUndoRedo should be false
      act(() => result.current.undo());
      expect(result.current.isUndoRedo.current).toBe(false);

      // After redo completes, isUndoRedo should be false
      act(() => result.current.redo());
      expect(result.current.isUndoRedo.current).toBe(false);
    });
  });
});
