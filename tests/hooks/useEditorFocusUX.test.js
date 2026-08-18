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
});
