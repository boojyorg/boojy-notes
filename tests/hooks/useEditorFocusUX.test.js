/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { TOOLBAR_REST_MS, useEditorFocusUX } from "../../src/hooks/useEditorFocusUX";

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
    mouseIsDown: { current: false },
    ...overrides,
  };
}

/** An editor holding one block, with a selection over `from..to` of its text. */
function editorWithSelection(from, to) {
  const editor = document.createElement("div");
  editor.innerHTML = '<div data-block-id="b1">hello world</div>';
  document.body.appendChild(editor);
  const text = editor.firstChild.firstChild;
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return editor;
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

  // The toolbar shows over a finished selection: on mouse-up for a pointer
  // selection, after a rest for a keyboard one, and never while the button is
  // down. Hiding is immediate (2026-09-10).
  describe("toolbar timing", () => {
    // jsdom's Range has no layout; the position maths is not under test here.
    const rect = { top: 100, left: 40, width: 20, height: 16, bottom: 116, right: 60 };
    beforeEach(() => {
      Range.prototype.getBoundingClientRect = () => rect;
      Element.prototype.getBoundingClientRect = () => ({ ...rect, top: 0, left: 0 });
    });

    it("shows a keyboard selection after the rest, not on the change itself", () => {
      const editor = editorWithSelection(0, 5);
      const deps = baseDeps({ editorRef: { current: editor } });
      renderHook(() => useEditorFocusUX(deps));
      document.dispatchEvent(new Event("selectionchange"));
      expect(deps.setToolbarState).not.toHaveBeenCalled();
      vi.advanceTimersByTime(TOOLBAR_REST_MS - 1);
      expect(deps.setToolbarState).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(deps.setToolbarState).toHaveBeenCalledTimes(1);
      expect(deps.setToolbarState).toHaveBeenCalledWith(
        expect.objectContaining({ top: expect.any(Number), left: expect.any(Number) }),
      );
      editor.remove();
    });

    it("restarts the rest on every change, so Shift+Arrow shows once at the end", () => {
      const editor = editorWithSelection(0, 5);
      const deps = baseDeps({ editorRef: { current: editor } });
      renderHook(() => useEditorFocusUX(deps));
      for (let i = 0; i < 3; i++) {
        document.dispatchEvent(new Event("selectionchange"));
        vi.advanceTimersByTime(TOOLBAR_REST_MS / 2);
      }
      expect(deps.setToolbarState).not.toHaveBeenCalled();
      vi.advanceTimersByTime(TOOLBAR_REST_MS);
      expect(deps.setToolbarState).toHaveBeenCalledTimes(1);
      editor.remove();
    });

    it("sets nothing while the button is down and shows on mouse-up", () => {
      const editor = editorWithSelection(0, 5);
      const mouseIsDown = { current: true };
      const deps = baseDeps({ editorRef: { current: editor }, mouseIsDown });
      renderHook(() => useEditorFocusUX(deps));
      document.dispatchEvent(new Event("selectionchange"));
      vi.advanceTimersByTime(TOOLBAR_REST_MS * 2);
      expect(deps.setToolbarState).not.toHaveBeenCalled();
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      expect(mouseIsDown.current).toBe(false);
      expect(deps.setToolbarState).toHaveBeenCalledTimes(1);
      expect(deps.setToolbarState).toHaveBeenCalledWith(
        expect.objectContaining({ top: expect.any(Number) }),
      );
      editor.remove();
    });

    it("hides at once when the selection collapses", () => {
      const editor = editorWithSelection(0, 5);
      const deps = baseDeps({ editorRef: { current: editor } });
      renderHook(() => useEditorFocusUX(deps));
      document.dispatchEvent(new Event("selectionchange"));
      window.getSelection().collapseToStart();
      document.dispatchEvent(new Event("selectionchange"));
      expect(deps.setToolbarState).toHaveBeenCalledWith(null);
      vi.advanceTimersByTime(TOOLBAR_REST_MS);
      // The pending show was cancelled by the collapse: every call hid it, none showed it.
      // (jsdom fires selectionchange of its own on collapse, hence "every".)
      expect(deps.setToolbarState.mock.calls.every(([v]) => v === null)).toBe(true);
      editor.remove();
    });

    it("holds its position once shown, until the selection collapses", () => {
      const editor = editorWithSelection(0, 5);
      const deps = baseDeps({ editorRef: { current: editor } });
      renderHook(() => useEditorFocusUX(deps));
      document.dispatchEvent(new Event("selectionchange"));
      vi.advanceTimersByTime(TOOLBAR_REST_MS);
      expect(deps.setToolbarState).toHaveBeenCalledTimes(1);
      // The selection changes (a format rewrote its nodes, or it was extended): no re-measure.
      Range.prototype.getBoundingClientRect = () => ({ ...rect, left: 90, width: 40 });
      document.dispatchEvent(new Event("selectionchange"));
      vi.advanceTimersByTime(TOOLBAR_REST_MS * 2);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      expect(deps.setToolbarState).toHaveBeenCalledTimes(1);
      // A collapse hides it, and the next selection measures afresh.
      window.getSelection().collapseToStart();
      document.dispatchEvent(new Event("selectionchange"));
      expect(deps.setToolbarState).toHaveBeenLastCalledWith(null);
      const range = document.createRange();
      range.setStart(editor.firstChild.firstChild, 0);
      range.setEnd(editor.firstChild.firstChild, 5);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      vi.advanceTimersByTime(TOOLBAR_REST_MS);
      expect(deps.setToolbarState).toHaveBeenLastCalledWith(
        expect.objectContaining({ left: 90 + 40 / 2 }),
      );
      editor.remove();
    });

    it("leaves a mouse-up on the toolbar to applyFormat", () => {
      const editor = editorWithSelection(0, 5);
      const toolbar = document.createElement("div");
      toolbar.setAttribute("role", "toolbar");
      const btn = document.createElement("button");
      toolbar.appendChild(btn);
      document.body.appendChild(toolbar);
      const deps = baseDeps({ editorRef: { current: editor } });
      renderHook(() => useEditorFocusUX(deps));
      btn.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      expect(deps.setToolbarState).not.toHaveBeenCalled();
      toolbar.remove();
      editor.remove();
    });

    it("removes the mouseup listener on unmount", () => {
      const removeSpy = vi.spyOn(document, "removeEventListener");
      const { unmount } = renderHook(() => useEditorFocusUX(baseDeps()));
      unmount();
      expect(removeSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});
