/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  const noteData = { n1: { id: "n1", title: "Test", content: { blocks } } };
  const noteDataRef = { current: noteData };
  const blockRefs = { current: {} };
  const editorRef = { current: document.createElement("div") };
  const editorScrollRef = { current: document.createElement("div") };
  const dragTooltipCount = { current: { editor: 0, sidebar: 0 } };

  const deps = {
    noteDataRef,
    activeNote: "n1",
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

  return { deps, noteDataRef, blockRefs };
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
});
