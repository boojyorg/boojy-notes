/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardHandlers } from "../../../src/hooks/editor/useKeyboardHandlers";

// Mock dependencies
vi.mock("../../../src/utils/domHelpers", () => ({
  findNearestBlock: vi.fn(),
  isEditableBlock: (block) => !["image", "spacer", "embed", "file"].includes(block.type),
  placeCaret: vi.fn(() => true),
}));

vi.mock("../../../src/utils/inlineFormatting", () => ({
  sanitizeInlineHtml: (html) => html,
  htmlToInlineMarkdown: (html) => html.replace(/<[^>]*>/g, ""),
}));

vi.mock("../../../src/utils/storage", () => ({
  genBlockId: () => "new-block-id",
}));

vi.mock("../../../src/constants/data", () => ({
  SLASH_COMMANDS: [
    { label: "Heading 1", type: "h1" },
    { label: "Bullet List", type: "bullet" },
  ],
}));

describe("useKeyboardHandlers", () => {
  let deps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = {
      noteDataRef: {
        current: {
          "note-1": {
            content: {
              blocks: [
                { id: "b1", type: "p", text: "Hello" },
                { id: "b2", type: "p", text: "World" },
              ],
            },
          },
        },
      },
      activeNoteRef: { current: "note-1" },
      blockRefs: {
        current: { b1: document.createElement("div"), b2: document.createElement("div") },
      },
      editorRef: { current: document.createElement("div") },
      commitNoteData: vi.fn(),
      focusBlockId: { current: null },
      focusCursorPos: { current: null },
      slashMenuRef: { current: null },
      setSlashMenu: vi.fn(),
      wikilinkMenuRef: { current: null },
      syncGeneration: { current: 0 },
      updateBlockText: vi.fn(),
      insertBlockAfter: vi.fn(),
      deleteBlock: vi.fn(),
      reReadBlockFromDom: vi.fn(),
      toggleInlineCode: vi.fn(),
      applyFormat: vi.fn(),
      onOpenLinkEditor: vi.fn(),
      updateBlockIndent: vi.fn(),
      getBlock: vi.fn(),
      executeSlashCommand: vi.fn(),
      handleBlockInput: vi.fn(),
    };
  });

  it("returns the three handler functions", () => {
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    expect(result.current.handleBlockKeyDown).toBeInstanceOf(Function);
    expect(result.current.handleCrossBlockKeyDown).toBeInstanceOf(Function);
    expect(result.current.handleEditorKeyDown).toBeInstanceOf(Function);
  });

  it("handleBlockKeyDown calls deleteBlock on Backspace with empty text", () => {
    deps.blockRefs.current.b1.innerHTML = "";
    // Mock innerHTML to produce empty text
    Object.defineProperty(deps.blockRefs.current.b1, "innerHTML", {
      get: () => "",
      set: () => {},
    });

    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 1, event);
    // Block "b2" at index 1 is empty after innerHTML returns ""
    expect(deps.deleteBlock).toHaveBeenCalledWith("note-1", 1);
  });

  it("handleBlockKeyDown handles Tab for indentation on paragraph blocks", () => {
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.updateBlockIndent).toHaveBeenCalledWith("note-1", 0, 1);
  });

  it("handleBlockKeyDown handles Shift+Tab for outdent", () => {
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.updateBlockIndent).toHaveBeenCalledWith("note-1", 0, -1);
  });

  it("handleBlockKeyDown skips Tab for code blocks", () => {
    deps.noteDataRef.current["note-1"].content.blocks[0] = { id: "b1", type: "code", text: "" };
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.updateBlockIndent).not.toHaveBeenCalled();
  });

  it("handleBlockKeyDown navigates slash menu with ArrowDown", () => {
    deps.slashMenuRef.current = { blockIndex: 0, filter: "", selectedIndex: 0 };
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.setSlashMenu).toHaveBeenCalled();
  });

  it("handleBlockKeyDown closes slash menu on Escape", () => {
    deps.slashMenuRef.current = { blockIndex: 0, filter: "", selectedIndex: 0 };
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.setSlashMenu).toHaveBeenCalledWith(null);
  });

  it("handleBlockKeyDown executes slash command on Enter", () => {
    deps.slashMenuRef.current = { blockIndex: 0, filter: "", selectedIndex: 0 };
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.executeSlashCommand).toHaveBeenCalled();
    expect(deps.setSlashMenu).toHaveBeenCalledWith(null);
  });
});
