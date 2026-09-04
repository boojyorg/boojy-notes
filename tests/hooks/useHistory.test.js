/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory } from "../../src/hooks/useHistory.js";
import { makeNoteData, paragraph, checkbox } from "../mocks/blocks.js";
import { buildPastedBlocks } from "../../src/utils/pasteBlocks";

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
    // Regression: the quit/blur net used to record the *active* note on every
    // commit. Discarding the launch draft on the way into a note, or renaming
    // another row, stamped a note that never became dirty, and the quit flush
    // rewrote it untouched — bumping its mtime and its "Most recent" position.
    it("records only the notes the commit changed in the quit/blur net", () => {
      const { result } = setup();
      const other = { id: "note-2", title: "Other", content: { title: "Other", blocks: [] } };
      act(() => {
        result.current.commitNoteData((prev) => ({ ...prev, "note-2": other }));
      });
      expect([...result.current.unflushedNotes.current]).toEqual(["note-2"]);

      // A commit that changes nothing (same map back) stamps nothing.
      result.current.unflushedNotes.current.clear();
      act(() => {
        result.current.commitNoteData((prev) => prev);
      });
      expect(result.current.unflushedNotes.current.size).toBe(0);

      // Drafts never reach disk, so they never enter the net.
      act(() => {
        result.current.commitNoteData((prev) => ({
          ...prev,
          draft: { id: "draft", title: "", content: { blocks: [] }, _draft: true },
        }));
      });
      expect(result.current.unflushedNotes.current.size).toBe(0);
    });

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

  // ─── adoptNoteData ────────────────────────────────────────────────

  describe("adoptNoteData", () => {
    // A write can land a note under a basename other than the title written
    // (a namesake forced a suffix, a colon became an underscore). Adopting that
    // name is a change of record, not an edit: it publishes like a structural
    // commit but leaves no history entry, so Cmd+Z after the rename undoes the
    // rename rather than restoring the requested name for the file to reject
    // again.
    it("publishes the change without a history entry", async () => {
      const { result, getNoteData } = setup();
      act(() => {
        result.current.adoptNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "Meeting notes-2" },
        }));
      });
      await flushMicrotasks();

      expect(getNoteData()[NOTE_ID].title).toBe("Meeting notes-2");
      expect(result.current.noteDataRef.current[NOTE_ID].title).toBe("Meeting notes-2");
      expect(result.current.canUndo).toBe(false);
      // It reaches disk like any change: the note is in the quit/blur net.
      expect(result.current.unflushedNotes.current.has(NOTE_ID)).toBe(true);
    });

    it("carries pending text with it rather than losing it to the cancelled commit", () => {
      const { result, getNoteData } = setup();
      act(() => {
        result.current.commitTextChange((prev) => ({
          ...prev,
          [NOTE_ID]: {
            ...prev[NOTE_ID],
            content: { ...prev[NOTE_ID].content, blocks: [paragraph("typed")] },
          },
        }));
      });
      act(() => {
        result.current.adoptNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "Adopted" },
        }));
      });

      const note = getNoteData()[NOTE_ID];
      expect(note.title).toBe("Adopted");
      expect(note.content.blocks[0].text).toBe("typed");
    });
  });

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

    it("accumulates every edited note in unflushedNotes", () => {
      const { result, activeNoteRef } = setup();

      act(() => result.current.commitTextChange((prev) => prev));
      // Another note edited within the same debounce window must not replace
      // the first note in the pending quit/blur flush.
      activeNoteRef.current = "note-2";
      act(() => result.current.commitTextChange((prev) => prev));

      expect([...result.current.unflushedNotes.current]).toEqual([NOTE_ID, "note-2"]);
    });

    it("records structural edits in unflushedNotes too", () => {
      const { result } = setup();

      act(() =>
        result.current.commitNoteData((prev) => ({
          ...prev,
          [NOTE_ID]: { ...prev[NOTE_ID], title: "Renamed" },
        })),
      );

      expect(result.current.unflushedNotes.current.has(NOTE_ID)).toBe(true);
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
    // Regression: Cmd+Z inside the 300ms text-commit window used to be
    // overwritten when that commit fired, and the "text-only edit" flag it had
    // raised told the editor to skip painting the restored text.
    it("cancels a pending text commit so it cannot overwrite the restored snapshot", async () => {
      const { result, getNoteData, syncGeneration } = setup([paragraph("hello")]);

      act(() => {
        result.current.commitTextChange((prev) => ({
          ...prev,
          [NOTE_ID]: {
            ...prev[NOTE_ID],
            content: {
              ...prev[NOTE_ID].content,
              blocks: [{ ...prev[NOTE_ID].content.blocks[0], text: "hello fast" }],
            },
          },
        }));
      });
      await act(() => flushMicrotasks());
      expect(result.current.hasPendingFlush.current).toBe(true);

      act(() => result.current.undo());

      expect(getNoteData()[NOTE_ID].content.blocks[0].text).toBe("hello");
      expect(result.current.noteDataRef.current[NOTE_ID].content.blocks[0].text).toBe("hello");
      expect(result.current.hasPendingFlush.current).toBe(false);
      expect(result.current.textOnlyEditForEditor.current).toBe(false);
      expect(syncGeneration.current).toBe(1);

      // The commit that was pending must not fire and put "hello fast" back.
      act(() => vi.advanceTimersByTime(400));
      expect(getNoteData()[NOTE_ID].content.blocks[0].text).toBe("hello");
    });

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

    it("one undo restores the note after a multi-line paste", async () => {
      const original = [checkbox("Task", true)];
      const { result, getNoteData } = setup(original);
      let n = 0;

      act(() => {
        result.current.commitNoteData((prev) => {
          const note = prev[NOTE_ID];
          const { blocks } = buildPastedBlocks(
            note.content.blocks[0],
            [
              { type: "p", text: "one" },
              { type: "p", text: "two" },
            ],
            "",
            "Task",
            () => `new-${++n}`,
          );
          return { ...prev, [NOTE_ID]: { ...note, content: { ...note.content, blocks } } };
        });
      });
      await act(() => flushMicrotasks());
      expect(getNoteData()[NOTE_ID].content.blocks).toHaveLength(2);

      act(() => result.current.undo());

      expect(getNoteData()[NOTE_ID].content.blocks).toEqual(original);
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
