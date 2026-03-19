/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInputHandler } from "../../../src/hooks/editor/useInputHandler";

vi.mock("../../../src/utils/domHelpers", () => ({
  cleanOrphanNodes: vi.fn(),
  isEditableBlock: () => true,
  placeCaret: vi.fn(() => true),
}));

vi.mock("../../../src/utils/inlineFormatting", () => ({
  domNodeToMarkdown: (el) => el.textContent || "",
}));

vi.mock("../../../src/utils/storage", () => ({
  genBlockId: () => "new-block-id",
}));

describe("useInputHandler", () => {
  let deps;
  let mockEl;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEl = document.createElement("div");
    mockEl.textContent = "Hello world";
    Object.defineProperty(mockEl, "getBoundingClientRect", {
      value: () => ({ top: 100, bottom: 120, left: 50, right: 200 }),
    });

    deps = {
      noteDataRef: {
        current: {
          "note-1": {
            content: {
              blocks: [
                { id: "b1", type: "p", text: "Hello world" },
                { id: "b2", type: "p", text: "" },
              ],
            },
          },
        },
      },
      activeNoteRef: { current: "note-1" },
      blockRefs: { current: { b1: mockEl, b2: document.createElement("div") } },
      editorRef: { current: document.createElement("div") },
      commitNoteData: vi.fn(),
      focusBlockId: { current: null },
      focusCursorPos: { current: null },
      slashMenuRef: { current: null },
      setSlashMenu: vi.fn(),
      wikilinkMenuRef: { current: null },
      setWikilinkMenu: vi.fn(),
      syncGeneration: { current: 0 },
      updateBlockText: vi.fn(),
      insertBlockAfter: vi.fn(),
      getBlock: vi.fn(),
    };
  });

  it("returns handleBlockInput and handleEditorInput functions", () => {
    const { result } = renderHook(() => useInputHandler(deps));
    expect(result.current.handleBlockInput).toBeInstanceOf(Function);
    expect(result.current.handleEditorInput).toBeInstanceOf(Function);
  });

  it("handleBlockInput calls updateBlockText with the text from the DOM element", () => {
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.updateBlockText).toHaveBeenCalledWith("note-1", 0, "Hello world");
  });

  it("detects markdown heading shortcut (# )", () => {
    mockEl.textContent = "# ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.commitNoteData).toHaveBeenCalled();
  });

  it("detects markdown bullet shortcut (- )", () => {
    mockEl.textContent = "- ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.commitNoteData).toHaveBeenCalled();
  });

  it("detects markdown checkbox shortcut ([] )", () => {
    mockEl.textContent = "[] ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.commitNoteData).toHaveBeenCalled();
  });

  it("detects markdown numbered list shortcut (1. )", () => {
    mockEl.textContent = "1. ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.commitNoteData).toHaveBeenCalled();
  });

  it("detects code block trigger (```)", () => {
    mockEl.textContent = "```";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.commitNoteData).toHaveBeenCalled();
  });

  it("detects code block with language (```python)", () => {
    mockEl.textContent = "```python";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.commitNoteData).toHaveBeenCalled();
  });

  it("detects horizontal rule shortcut (---)", () => {
    mockEl.textContent = "---";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    // Spacer type triggers insertBlockAfter
    expect(deps.insertBlockAfter).toHaveBeenCalledWith("note-1", 0, "p", "");
  });

  it("detects blockquote shortcut (> )", () => {
    mockEl.textContent = "> ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.commitNoteData).toHaveBeenCalled();
  });

  it("opens slash menu when text is /", () => {
    mockEl.textContent = "/";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.setSlashMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: "note-1",
        blockIndex: 0,
        filter: "",
        selectedIndex: 0,
      }),
    );
  });

  it("updates slash menu filter when text starts with /", () => {
    mockEl.textContent = "/head";
    deps.slashMenuRef.current = { blockIndex: 0, filter: "", selectedIndex: 0 };
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.setSlashMenu).toHaveBeenCalled();
  });

  it("closes slash menu when text no longer starts with /", () => {
    mockEl.textContent = "hello";
    deps.slashMenuRef.current = { blockIndex: 0, filter: "", selectedIndex: 0 };
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.setSlashMenu).toHaveBeenCalledWith(null);
  });

  it("opens wikilink menu when [[ is detected", () => {
    mockEl.textContent = "Link to [[My";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.setWikilinkMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: "note-1",
        blockIndex: 0,
        filter: "My",
      }),
    );
  });

  it("does not open wikilink menu when no [[ is present", () => {
    mockEl.textContent = "Just normal text";
    deps.wikilinkMenuRef.current = null;
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.setWikilinkMenu).not.toHaveBeenCalled();
  });
});
