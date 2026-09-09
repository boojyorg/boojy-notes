/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useEditorFocusUX } from "../../src/hooks/useEditorFocusUX";

function baseDeps(overrides = {}) {
  return {
    activeNote: "n1",
    editorRef: { current: document.createElement("div") },
    editorScrollRef: { current: document.createElement("div") },
    blockRefs: { current: {} },
    focusBlockId: { current: null },
    focusCursorPos: { current: null },
    noteDataRef: { current: { n1: { content: { blocks: [] } } } },
    setToolbarState: vi.fn(),
    ...overrides,
  };
}

describe("useEditorFocusUX", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("registers and cleans up the selectionchange listener", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useEditorFocusUX(baseDeps()));

    expect(addSpy).toHaveBeenCalledWith("selectionchange", expect.any(Function));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("selectionchange", expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("consumes a queued focus target and clears the refs", () => {
    const el = document.createElement("div");
    const deps = baseDeps({
      blockRefs: { current: { b1: el } },
      focusBlockId: { current: "b1" },
      focusCursorPos: { current: 3 },
    });
    renderHook(() => useEditorFocusUX(deps));
    // Layout effect runs synchronously; the focus target is consumed (refs reset)
    expect(deps.focusBlockId.current).toBeNull();
    expect(deps.focusCursorPos.current).toBeNull();
  });

  // A code block, callout or table registers no text root in blockRefs; the
  // block the slash menu queued is found by its wrapper and its own first
  // field takes focus (review 2026-09-07, §1.5).
  it("focuses a special block's own field when the block has no text root", () => {
    const editor = document.createElement("div");
    document.body.appendChild(editor);
    editor.innerHTML =
      '<div data-block-id="code1" data-block-type="code" contenteditable="false">' +
      '<textarea class="code-textarea"></textarea></div>' +
      '<div data-block-id="p1" data-block-type="p"><br></div>';
    const textarea = editor.querySelector("textarea");
    const deps = baseDeps({
      editorRef: { current: editor },
      blockRefs: { current: { p1: editor.lastElementChild } },
      focusBlockId: { current: "code1" },
      focusCursorPos: { current: 0 },
      noteDataRef: {
        current: {
          n1: {
            content: {
              blocks: [
                { id: "code1", type: "code" },
                { id: "p1", type: "p" },
              ],
            },
          },
        },
      },
    });
    renderHook(() => useEditorFocusUX(deps));
    expect(document.activeElement).toBe(textarea);
    expect(deps.focusBlockId.current).toBeNull();
    editor.remove();
  });
});
