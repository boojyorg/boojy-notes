/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../src/utils/domHelpers", () => ({
  getBlockFromNode: vi.fn(),
  runAutoScroll: vi.fn(),
}));

import { useBlockDrag } from "../../src/hooks/useBlockDrag";
import { getBlockFromNode } from "../../src/utils/domHelpers";

function makeBlock(id, text = "") {
  return { id, type: "p", text };
}

function setup(overrides = {}) {
  const blocks = overrides.blocks || [makeBlock("b1", "hello"), makeBlock("b2", "world")];
  const noteData = {
    n1: { id: "n1", title: "Test", content: { blocks } },
    ...(overrides.extraNotes || {}),
  };
  const noteDataRef = { current: noteData };
  const blockRefs = { current: {} };
  const editorRef = { current: document.createElement("div") };
  const editorScrollRef = { current: document.createElement("div") };
  const dragTooltipCount = { current: { editor: 0, sidebar: 0 } };

  const activeNoteRef = { current: "n1" };
  const deps = {
    noteDataRef,
    activeNoteRef,
    setNoteData: overrides.setNoteData || vi.fn(),
    pushHistory: overrides.pushHistory || vi.fn(),
    popHistory: overrides.popHistory || vi.fn(),
    blockRefs,
    editorRef,
    editorScrollRef,
    accentColor: "#A4CACE",
    editorBg: "#1a1a1e",
    setDragTooltip: vi.fn(),
    dragTooltipCount,
    setToolbarState: vi.fn(),
  };

  return { deps, noteDataRef, blockRefs, activeNoteRef };
}

/**
 * Drive a real activation: pointerdown on a block, then let the 400ms hold
 * timer fire. Needs fake timers and a mocked getBlockFromNode.
 */
function activateDrag(result, blockRefs, blocks) {
  for (const b of blocks) {
    const el = document.createElement("p");
    el.dataset.blockId = b.id;
    document.body.appendChild(el);
    blockRefs.current[b.id] = el;
  }
  getBlockFromNode.mockReturnValue({ blockId: blocks[0].id, blockIndex: 0 });
  const event = new PointerEvent("pointerdown", { button: 0, clientX: 10, clientY: 10 });
  Object.defineProperty(event, "target", { value: blockRefs.current[blocks[0].id] });
  act(() => {
    result.current.handleEditorPointerDown(event);
  });
  act(() => {
    vi.advanceTimersByTime(400);
  });
}

describe("useBlockDrag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("initializes blockDrag ref with expected structure", () => {
    const { deps } = setup();
    const { result } = renderHook(() => useBlockDrag(deps));

    const bd = result.current.blockDrag.current;
    expect(bd.active).toBe(false);
    expect(bd.blockId).toBe(null);
    expect(bd.blockIds).toEqual([]);
    expect(bd.originalBlocks).toBe(null);
    expect(bd.cloneEl).toBe(null);
    expect(bd.startIndex).toBe(-1);
    expect(bd.currentIndex).toBe(-1);
    expect(bd.holdTimer).toBe(null);
    expect(bd.scrollRAF).toBe(null);
  });

  it("returns handleEditorPointerDown and cancelBlockDrag functions", () => {
    const { deps } = setup();
    const { result } = renderHook(() => useBlockDrag(deps));

    expect(typeof result.current.handleEditorPointerDown).toBe("function");
    expect(typeof result.current.cancelBlockDrag).toBe("function");
  });

  it("handleEditorPointerDown ignores non-left button clicks", () => {
    const { deps } = setup();
    const { result } = renderHook(() => useBlockDrag(deps));

    const event = new PointerEvent("pointerdown", { button: 2 });
    act(() => {
      result.current.handleEditorPointerDown(event);
    });

    // blockDrag should remain inactive
    expect(result.current.blockDrag.current.active).toBe(false);
    expect(result.current.blockDrag.current.holdTimer).toBe(null);
  });

  it("handleEditorPointerDown ignores clicks on excluded elements", () => {
    const { deps } = setup();
    const { result } = renderHook(() => useBlockDrag(deps));

    const btn = document.createElement("button");
    document.body.appendChild(btn);
    const event = new PointerEvent("pointerdown", { button: 0, bubbles: true });
    Object.defineProperty(event, "target", { value: btn });

    act(() => {
      result.current.handleEditorPointerDown(event);
    });

    expect(result.current.blockDrag.current.holdTimer).toBe(null);
    document.body.removeChild(btn);
  });

  it("cancelBlockDrag clears holdTimer and resets state", () => {
    const { deps } = setup();
    const { result } = renderHook(() => useBlockDrag(deps));

    // Manually set a holdTimer to simulate a pending drag
    result.current.blockDrag.current.holdTimer = setTimeout(() => {}, 10000);

    act(() => {
      result.current.cancelBlockDrag();
    });

    expect(result.current.blockDrag.current.holdTimer).toBe(null);
    expect(result.current.blockDrag.current.active).toBe(false);
  });

  it("cancelBlockDrag restores original blocks and calls popHistory when active", () => {
    const popHistory = vi.fn();
    const setNoteData = vi.fn();
    const { deps } = setup({ popHistory, setNoteData });
    const { result } = renderHook(() => useBlockDrag(deps));

    const bd = result.current.blockDrag.current;
    bd.active = true;
    bd.noteId = "n1";
    bd.originalBlocks = [makeBlock("b1"), makeBlock("b2")];
    bd.blockIds = ["b1"];
    bd.blockId = "b1";

    act(() => {
      result.current.cancelBlockDrag();
    });

    expect(setNoteData).toHaveBeenCalled();
    expect(popHistory).toHaveBeenCalled();
    expect(bd.active).toBe(false);
    expect(bd.originalBlocks).toBe(null);
  });

  describe("writes are keyed by the note the drag started in", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
      document.body.innerHTML = "";
    });

    const otherNote = {
      n2: { id: "n2", title: "Other", content: { blocks: [makeBlock("x1", "untouched")] } },
    };

    it("records the active note on activation", () => {
      const { deps, blockRefs, noteDataRef } = setup({ extraNotes: otherNote });
      const { result } = renderHook(() => useBlockDrag(deps));
      activateDrag(result, blockRefs, noteDataRef.current.n1.content.blocks);

      const bd = result.current.blockDrag.current;
      expect(bd.active).toBe(true);
      expect(bd.noteId).toBe("n1");
      expect(bd.originalBlocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    });

    it("cancel from a stale closure restores the drag's own note, never the now-active one", () => {
      const setNoteData = vi.fn();
      const { deps, blockRefs, noteDataRef, activeNoteRef } = setup({
        setNoteData,
        extraNotes: otherNote,
      });
      const { result } = renderHook(() => useBlockDrag(deps));
      // Capture the function the way a once-registered window listener does.
      const staleCancel = result.current.cancelBlockDrag;

      activateDrag(result, blockRefs, noteDataRef.current.n1.content.blocks);
      // Simulate the live reorder having moved b2 above b1 in state.
      const reordered = [makeBlock("b2", "world"), makeBlock("b1", "hello")];
      noteDataRef.current = {
        ...noteDataRef.current,
        n1: { ...noteDataRef.current.n1, content: { blocks: reordered } },
      };

      // The user switches notes mid-drag (the app rewrites the ref on render).
      activeNoteRef.current = "n2";

      act(() => {
        staleCancel();
      });

      expect(setNoteData).toHaveBeenCalledTimes(1);
      const updater = setNoteData.mock.calls[0][0];
      const next = updater(noteDataRef.current);
      expect(next.n1.content.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
      expect(next.n2).toBe(noteDataRef.current.n2);
      expect(Object.keys(next)).toEqual(["n1", "n2"]);
    });

    it("cancel after the drag's note was deleted leaves state untouched", () => {
      const setNoteData = vi.fn();
      const { deps, blockRefs, noteDataRef } = setup({ setNoteData, extraNotes: otherNote });
      const { result } = renderHook(() => useBlockDrag(deps));
      activateDrag(result, blockRefs, noteDataRef.current.n1.content.blocks);

      act(() => {
        result.current.cancelBlockDrag();
      });
      const updater = setNoteData.mock.calls[0][0];
      const prev = { n2: noteDataRef.current.n2 };
      expect(updater(prev)).toBe(prev);
    });

    it("a pointer-down captured at mount starts a drag on the note that is active NOW", () => {
      // EditorContext freezes handleEditorPointerDown at BoojyNotes' first
      // render, so this is the reference the editor really calls.
      const { deps, blockRefs, noteDataRef, activeNoteRef } = setup({
        extraNotes: {
          n2: {
            id: "n2",
            title: "Other",
            content: { blocks: [makeBlock("x1", "one"), makeBlock("x2", "two")] },
          },
        },
      });
      const { result } = renderHook(() => useBlockDrag(deps));
      const frozenPointerDown = result.current.handleEditorPointerDown;

      // The user opens note n2.
      activeNoteRef.current = "n2";
      const n2Blocks = noteDataRef.current.n2.content.blocks;
      for (const b of n2Blocks) {
        const el = document.createElement("p");
        el.dataset.blockId = b.id;
        document.body.appendChild(el);
        blockRefs.current[b.id] = el;
      }
      getBlockFromNode.mockReturnValue({ blockId: "x1", blockIndex: 0 });
      const event = new PointerEvent("pointerdown", { button: 0, clientX: 10, clientY: 10 });
      Object.defineProperty(event, "target", { value: blockRefs.current.x1 });
      act(() => {
        frozenPointerDown(event);
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });

      const bd = result.current.blockDrag.current;
      expect(bd.active).toBe(true);
      expect(bd.noteId).toBe("n2");
      expect(bd.originalBlocks.map((b) => b.id)).toEqual(["x1", "x2"]);
      // getBlockFromNode was handed n2's block list, not n1's.
      expect(getBlockFromNode.mock.calls.at(-1)[2]).toBe(n2Blocks);
    });

    it("live reorder during the drag writes to the drag's note", () => {
      const setNoteData = vi.fn();
      const { deps, blockRefs, noteDataRef, activeNoteRef } = setup({
        setNoteData,
        extraNotes: otherNote,
      });
      const { result } = renderHook(() => useBlockDrag(deps));
      activateDrag(result, blockRefs, noteDataRef.current.n1.content.blocks);
      activeNoteRef.current = "n2";

      // jsdom rects are all zero, so a pointer far below every block lands the
      // dragged block at the end of the list.
      act(() => {
        window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 500 }));
      });

      expect(setNoteData).toHaveBeenCalledTimes(1);
      const next = setNoteData.mock.calls[0][0](noteDataRef.current);
      expect(next.n1.content.blocks.map((b) => b.id)).toEqual(["b2", "b1"]);
      expect(next.n2).toBe(noteDataRef.current.n2);
    });
  });
});
