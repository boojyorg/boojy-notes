/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

vi.mock("../../src/utils/domHelpers", () => ({
  runAutoScroll: vi.fn(),
  suppressNextClick: vi.fn(),
}));

import { useBlockDrag } from "../../src/hooks/useBlockDrag";
import { suppressNextClick } from "../../src/utils/domHelpers";

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
    editorBg: "#ffffff",
    dragShadow: "0 1px 2px rgba(0,0,0,0.1)",
    slotBg: "#f4f4f5",
    setToolbarState: vi.fn(),
  };
  return { deps, noteDataRef, blockRefs, activeNoteRef };
}

function mountBlocks(blockRefs, blocks) {
  for (const b of blocks) {
    const el = document.createElement("p");
    el.dataset.blockId = b.id;
    document.body.appendChild(el);
    blockRefs.current[b.id] = el;
  }
}

const move = (x, y) =>
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
const up = () => window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

/** Press the grip for `blockId`, then travel far enough to lift. */
function pressAndLift(result, blockId, from = { x: 10, y: 10 }) {
  act(() => {
    result.current.startHandleDrag(blockId, { button: 0, clientX: from.x, clientY: from.y });
  });
  act(() => {
    move(from.x, from.y + 12);
  });
}

describe("useBlockDrag (gutter handle)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    document.body.className = "";
  });
  afterEach(() => {
    cleanup(); // unmounts the hook → removes any window listeners a drag left behind
    vi.useRealTimers();
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
  });

  it("exposes startHandleDrag and cancelBlockDrag, and nothing that drags from the text", () => {
    const { deps } = setup();
    const { result } = renderHook(() => useBlockDrag(deps));
    expect(typeof result.current.startHandleDrag).toBe("function");
    expect(typeof result.current.cancelBlockDrag).toBe("function");
    expect(result.current.handleEditorPointerDown).toBeUndefined();
  });

  it("ignores non-left presses on the grip", () => {
    const { deps, blockRefs } = setup();
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    act(() => {
      result.current.startHandleDrag("b1", { button: 2, clientX: 0, clientY: 0 });
    });
    act(() => {
      move(0, 50);
    });
    expect(result.current.blockDrag.current.active).toBe(false);
  });

  it("a press released without moving does nothing and leaves no listeners behind", () => {
    const { deps, blockRefs } = setup();
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    act(() => {
      result.current.startHandleDrag("b1", { button: 0, clientX: 10, clientY: 10 });
    });
    act(() => {
      move(11, 11); // under the 3px threshold
      up();
    });
    const bd = result.current.blockDrag.current;
    expect(bd.active).toBe(false);
    expect(deps.pushHistory).not.toHaveBeenCalled();
    expect(bd.moveHandler).toBe(null);
    expect(bd.upHandler).toBe(null);
    expect(document.body.classList.contains("block-dragging")).toBe(false);
  });

  it("refuses to drag when the note has a single block", () => {
    const { deps, blockRefs } = setup({ blocks: [makeBlock("only")] });
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "only");
    expect(result.current.blockDrag.current.active).toBe(false);
  });

  it("lifts on the first real movement: ghost on <body>, faded slot, history pushed", () => {
    const { deps, blockRefs } = setup();
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    const bd = result.current.blockDrag.current;
    expect(bd.active).toBe(true);
    expect(bd.noteId).toBe("n1");
    expect(bd.blockIds).toEqual(["b1"]);
    expect(bd.originalBlocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(deps.pushHistory).toHaveBeenCalledTimes(1);
    expect(deps.setToolbarState).toHaveBeenCalledWith(null);
    expect(document.body.classList.contains("block-dragging")).toBe(true);
    // ghost
    expect(bd.cloneEl.parentNode).toBe(document.body);
    expect(bd.cloneEl.style.position).toBe("fixed");
    expect(bd.cloneEl.querySelector("[contenteditable]")).toBe(null);
    // slot: neutral surface, no dashed accent outline
    const slot = blockRefs.current.b1;
    expect(slot.dataset.dragSlot).toBe("true");
    expect(slot.style.opacity).toBe("0.3");
    expect(slot.style.outline).toBe("");
  });

  it("live reorder during the drag writes to the drag's note only", () => {
    const setNoteData = vi.fn();
    const { deps, blockRefs, noteDataRef } = setup({
      setNoteData,
      extraNotes: { n2: { id: "n2", content: { blocks: [makeBlock("x1")] } } },
    });
    mountBlocks(blockRefs, noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      move(10, 400); // jsdom rects are 0 → pointer is below every other block → move to end
    });
    expect(setNoteData).toHaveBeenCalledTimes(1);
    const next = setNoteData.mock.calls[0][0](noteDataRef.current);
    expect(next.n1.content.blocks.map((b) => b.id)).toEqual(["b2", "b1"]);
    expect(next.n2).toBe(noteDataRef.current.n2);
  });

  it("release finalizes: swallows the trailing click and restores the slot's styles", () => {
    vi.useFakeTimers();
    const { deps, blockRefs } = setup();
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      up();
    });
    expect(suppressNextClick).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(250); // settle animation
    });
    const bd = result.current.blockDrag.current;
    expect(bd.active).toBe(false);
    expect(bd.cloneEl).toBe(null);
    expect(document.body.querySelector('[style*="position: fixed"]')).toBe(null);
    const slot = blockRefs.current.b1;
    expect(slot.dataset.dragSlot).toBeUndefined();
    expect(slot.style.opacity).toBe("");
    expect(slot.style.background).toBe("");
    expect(document.body.classList.contains("block-dragging")).toBe(false);
    expect(deps.popHistory).not.toHaveBeenCalled();
  });

  it("cancel restores the original order into the drag's own note and pops history", () => {
    const setNoteData = vi.fn();
    const popHistory = vi.fn();
    const { deps, blockRefs, noteDataRef, activeNoteRef } = setup({
      setNoteData,
      popHistory,
      extraNotes: { n2: { id: "n2", content: { blocks: [makeBlock("x1")] } } },
    });
    mountBlocks(blockRefs, noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    // A stale listener may fire after the active note changed underneath it.
    activeNoteRef.current = "n2";
    act(() => {
      result.current.cancelBlockDrag();
    });
    expect(popHistory).toHaveBeenCalledTimes(1);
    const updater = setNoteData.mock.calls.at(-1)[0];
    const next = updater(noteDataRef.current);
    expect(next.n1.content.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(next.n2).toBe(noteDataRef.current.n2);
    expect(Object.keys(next)).toEqual(["n1", "n2"]);
    expect(result.current.blockDrag.current.active).toBe(false);
  });

  it("cancel after the drag's note was deleted leaves state untouched", () => {
    const setNoteData = vi.fn();
    const { deps, blockRefs, noteDataRef } = setup({ setNoteData });
    mountBlocks(blockRefs, noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      result.current.cancelBlockDrag();
    });
    const updater = setNoteData.mock.calls.at(-1)[0];
    const prev = { other: { id: "other", content: { blocks: [] } } };
    expect(updater(prev)).toBe(prev);
  });

  it("a grip press captured at mount drags the note that is active NOW", () => {
    // EditorContext freezes startHandleDrag at BoojyNotes' first render; it
    // must still resolve the current note through the ref.
    const { deps, blockRefs, noteDataRef, activeNoteRef } = setup();
    const n2Blocks = [makeBlock("x1"), makeBlock("x2")];
    noteDataRef.current.n2 = { id: "n2", content: { blocks: n2Blocks } };
    mountBlocks(blockRefs, n2Blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    const frozen = result.current.startHandleDrag;
    activeNoteRef.current = "n2";
    act(() => {
      frozen("x1", { button: 0, clientX: 0, clientY: 0 });
    });
    act(() => {
      move(0, 20);
    });
    const bd = result.current.blockDrag.current;
    expect(bd.active).toBe(true);
    expect(bd.noteId).toBe("n2");
    expect(bd.originalBlocks.map((b) => b.id)).toEqual(["x1", "x2"]);
  });
});
