/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMouseHandlers } from "../../../src/hooks/editor/useMouseHandlers";
import { placeCaret } from "../../../src/utils/domHelpers";

vi.mock("../../../src/utils/domHelpers", () => ({
  findNearestBlock: vi.fn(() => ({ blockId: "b1", blockIndex: 0 })),
  isEditableBlock: () => true,
  placeCaret: vi.fn(() => true),
}));

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

/**
 * The rescue a frame after a click or focus: when the selection landed outside
 * any block, the caret is placed in the nearest one. What it must never do is
 * take focus back from a control the click itself opened (a tag click opens
 * the search palette), which is what left the palette's field unfocused and
 * Escape dead.
 */
describe("useMouseHandlers caret rescue", () => {
  let editor;
  let block;
  let deps;

  beforeEach(() => {
    vi.clearAllMocks();
    editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.tabIndex = 0;
    block = document.createElement("div");
    block.textContent = "Tagged #review here";
    editor.appendChild(block);
    document.body.appendChild(editor);
    deps = {
      noteDataRef: {
        current: { n1: { content: { blocks: [{ id: "b1", type: "p", text: "Tagged" }] } } },
      },
      activeNoteRef: { current: "n1" },
      blockRefs: { current: { b1: block } },
      editorRef: { current: editor },
      mouseIsDown: { current: false },
      // The selection is nowhere the editor recognises, so the rescue would run.
      getBlock: vi.fn(() => null),
    };
    window.getSelection().removeAllRanges();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("after a click that kept focus in the editor, the rescue places the caret", async () => {
    const { result } = renderHook(() => useMouseHandlers(deps));
    editor.focus();
    result.current.handleEditorMouseUp();
    await nextFrame();
    // The nearest block, caret at the end of its text.
    expect(placeCaret).toHaveBeenCalledWith(block, "Tagged".length);
  });

  it("after a click that opened a control which took focus, the rescue leaves it alone", async () => {
    const { result } = renderHook(() => useMouseHandlers(deps));
    const palette = document.createElement("input");
    document.body.appendChild(palette);
    editor.focus();
    result.current.handleEditorMouseUp();
    // Between the click and the next frame the palette mounted and focused its field.
    palette.focus();
    await nextFrame();
    expect(placeCaret).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(palette);
  });

  it("the focus rescue steps aside the same way", async () => {
    const { result } = renderHook(() => useMouseHandlers(deps));
    const palette = document.createElement("input");
    document.body.appendChild(palette);
    result.current.handleEditorFocus();
    palette.focus();
    await nextFrame();
    expect(placeCaret).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(palette);
  });

  it("focus resting on the body (nothing else took it) still gets the rescue", async () => {
    const { result } = renderHook(() => useMouseHandlers(deps));
    result.current.handleEditorFocus();
    await nextFrame();
    expect(placeCaret).toHaveBeenCalledWith(block, 0);
  });
});
