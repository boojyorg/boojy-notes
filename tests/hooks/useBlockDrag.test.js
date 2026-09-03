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
    blockRefs,
    editorRef,
    editorScrollRef,
    setToolbarState: vi.fn(),
  };
  return { deps, noteDataRef, blockRefs, activeNoteRef, editorScrollRef };
}

/**
 * Mount block roots with hand-set rects: 30px rows starting at y=100, 10px
 * apart, so drop boundaries are predictable. jsdom has no layout of its own.
 */
function mountBlocks(blockRefs, blocks, { rowH = 30, gap = 10, top = 100 } = {}) {
  blocks.forEach((b, i) => {
    const el = document.createElement("p");
    el.dataset.blockId = b.id;
    const y = top + i * (rowH + gap);
    el.getBoundingClientRect = () => ({
      top: y,
      bottom: y + rowH,
      height: rowH,
      left: 50,
      right: 550,
      width: 500,
    });
    document.body.appendChild(el);
    blockRefs.current[b.id] = el;
  });
}

const move = (x, y) =>
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true }));
const up = () => window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));

/** Press the grip for `blockId`, then travel far enough to lift. */
function pressAndLift(result, blockId, from = { x: 10, y: 110 }) {
  act(() => {
    result.current.startHandleDrag(blockId, { button: 0, clientX: from.x, clientY: from.y });
  });
  act(() => {
    move(from.x, from.y + 12);
  });
}

const marker = () => document.querySelector(".block-drop-marker");
const markerCentre = () => {
  const m = marker();
  return parseFloat(m.style.top) + m.offsetHeight / 2;
};

describe("useBlockDrag (gutter handle, commit on drop)", () => {
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
    expect(bd.cloneEl).toBe(null);
    expect(bd.markerEl).toBe(null);
    expect(bd.startIndex).toBe(-1);
    expect(bd.targetIndex).toBe(-1);
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

  it("lifts on the first real movement: translucent ghost + marker on <body>, page untouched", () => {
    const { deps, blockRefs } = setup();
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    const bd = result.current.blockDrag.current;
    expect(bd.active).toBe(true);
    expect(bd.noteId).toBe("n1");
    expect(bd.blockIds).toEqual(["b1"]);
    expect(deps.setToolbarState).toHaveBeenCalledWith(null);
    expect(document.body.classList.contains("block-dragging")).toBe(true);
    // ghost: a translucent print, no card
    expect(bd.cloneEl.parentNode).toBe(document.body);
    expect(bd.cloneEl.style.position).toBe("fixed");
    expect(bd.cloneEl.style.opacity).toBe("0.35");
    expect(bd.cloneEl.style.boxShadow).toBe("");
    expect(bd.cloneEl.style.background).toBe("");
    expect(bd.cloneEl.querySelector("[contenteditable]")).toBe(null);
    // marker exists
    expect(marker()).not.toBe(null);
    // the source block is left exactly as it was
    const src = blockRefs.current.b1;
    expect(src.dataset.dragSlot).toBeUndefined();
    expect(src.style.opacity).toBe("");
    // nothing written, no history yet
    expect(deps.setNoteData).not.toHaveBeenCalled();
    expect(deps.pushHistory).not.toHaveBeenCalled();
  });

  it("moving the pointer does NOT reorder; it only moves the marker", () => {
    const setNoteData = vi.fn();
    const { deps, blockRefs } = setup({
      setNoteData,
      blocks: [makeBlock("b1"), makeBlock("b2"), makeBlock("b3")],
    });
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      move(10, 400); // below every block → boundary after b3
    });
    expect(setNoteData).not.toHaveBeenCalled();
    expect(result.current.blockDrag.current.targetIndex).toBe(3);
    // b3 spans 180–210; with no block after, the marker sits EDGE_GAP below it
    expect(markerCentre()).toBe(214);
  });

  it("marks a boundary between two blocks at the centre of their gap", () => {
    const { deps, blockRefs } = setup({
      blocks: [makeBlock("b1"), makeBlock("b2"), makeBlock("b3")],
    });
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      move(10, 200); // lower half of b3 (180–210) → before-index 3? no: mid is 195, 200 > mid → after b3
    });
    act(() => {
      move(10, 185); // upper half of b3 → boundary between b2 and b3
    });
    // b2 bottom 170, b3 top 180 → 175
    expect(markerCentre()).toBe(175);
  });

  it("the no-op position is always drawn ABOVE the grabbed block, never through or just below it", () => {
    const { deps, blockRefs } = setup({
      blocks: [makeBlock("b1"), makeBlock("b2"), makeBlock("b3"), makeBlock("b4")],
    });
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    // grab b2 (140–170); the gap above is 130–140 → centre 135
    pressAndLift(result, "b2", { x: 10, y: 150 });
    act(() => {
      move(10, 145); // top half of b2
    });
    expect(markerCentre()).toBe(135);
    act(() => {
      move(10, 165); // bottom half of b2 — still a no-op, still above
    });
    expect(markerCentre()).toBe(135);
    act(() => {
      move(10, 185); // top half of b3 — dropping before b3 is still a no-op
    });
    expect(markerCentre()).toBe(135);
    act(() => {
      move(10, 200); // bottom half of b3 → real move to after b3; gap 210–220 → 215
    });
    expect(markerCentre()).toBe(215);
  });

  it("release commits once: one history entry, one write to the drag's note only", () => {
    vi.useFakeTimers();
    const setNoteData = vi.fn();
    const { deps, blockRefs, noteDataRef } = setup({
      setNoteData,
      extraNotes: { n2: { id: "n2", content: { blocks: [makeBlock("x1")] } } },
    });
    mountBlocks(blockRefs, noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      move(10, 400);
      up();
    });
    expect(suppressNextClick).toHaveBeenCalledTimes(1);
    expect(deps.pushHistory).toHaveBeenCalledTimes(1);
    expect(setNoteData).toHaveBeenCalledTimes(1);
    const next = setNoteData.mock.calls[0][0](noteDataRef.current);
    expect(next.n1.content.blocks.map((b) => b.id)).toEqual(["b2", "b1"]);
    expect(next.n2).toBe(noteDataRef.current.n2);
    act(() => {
      vi.advanceTimersByTime(200); // ghost fade
    });
    const bd = result.current.blockDrag.current;
    expect(bd.active).toBe(false);
    expect(bd.cloneEl).toBe(null);
    expect(marker()).toBe(null);
    expect(document.body.querySelector('[style*="position: fixed"]')).toBe(null);
    expect(document.body.classList.contains("block-dragging")).toBe(false);
  });

  it("dropping back in the same place writes nothing and pushes no history", () => {
    vi.useFakeTimers();
    const setNoteData = vi.fn();
    const { deps, blockRefs } = setup({ setNoteData });
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1", { x: 10, y: 105 });
    act(() => {
      move(10, 112); // still over b1
      up();
    });
    expect(setNoteData).not.toHaveBeenCalled();
    expect(deps.pushHistory).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.blockDrag.current.active).toBe(false);
  });

  it("releasing outside the editor's scroll area cancels: marker hidden, nothing written", () => {
    vi.useFakeTimers();
    const setNoteData = vi.fn();
    const { deps, blockRefs, editorScrollRef } = setup({ setNoteData });
    editorScrollRef.current.getBoundingClientRect = () => ({
      left: 40,
      right: 600,
      top: 0,
      bottom: 800,
      width: 560,
      height: 800,
    });
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      move(10, 400); // x=10 is left of the scroll area → over the sidebar
    });
    expect(result.current.blockDrag.current.outside).toBe(true);
    expect(marker().style.display).toBe("none");
    act(() => {
      up();
    });
    expect(setNoteData).not.toHaveBeenCalled();
    expect(deps.pushHistory).not.toHaveBeenCalled();
  });

  it("cancel (Escape / blur) tears down without writing — there is nothing to restore", () => {
    vi.useFakeTimers();
    const setNoteData = vi.fn();
    const { deps, blockRefs, activeNoteRef } = setup({
      setNoteData,
      extraNotes: { n2: { id: "n2", content: { blocks: [makeBlock("x1")] } } },
    });
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      move(10, 400);
    });
    // A stale listener may fire after the active note changed underneath it.
    activeNoteRef.current = "n2";
    act(() => {
      result.current.cancelBlockDrag();
    });
    expect(setNoteData).not.toHaveBeenCalled();
    expect(deps.pushHistory).not.toHaveBeenCalled();
    expect(result.current.blockDrag.current.active).toBe(false);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(marker()).toBe(null);
    expect(document.body.classList.contains("block-dragging")).toBe(false);
  });

  it("a drop after the drag's note was deleted leaves state untouched", () => {
    const setNoteData = vi.fn();
    const { deps, blockRefs } = setup({ setNoteData });
    mountBlocks(blockRefs, deps.noteDataRef.current.n1.content.blocks);
    const { result } = renderHook(() => useBlockDrag(deps));
    pressAndLift(result, "b1");
    act(() => {
      move(10, 400);
      up();
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
    expect(bd.blockIds).toEqual(["x1"]);
  });
});
