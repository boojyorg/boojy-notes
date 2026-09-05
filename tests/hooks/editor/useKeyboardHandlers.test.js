/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardHandlers } from "../../../src/hooks/editor/useKeyboardHandlers";
import { placeCaret } from "../../../src/utils/domHelpers";

// Mock dependencies
vi.mock("../../../src/utils/domHelpers", () => ({
  findNearestBlock: vi.fn(),
  isEditableBlock: (block) => !["image", "spacer", "embed", "file"].includes(block.type),
  isSelectableBlock: (block) => block.type === "spacer" || block.type === "image",
  placeCaret: vi.fn(() => true),
}));

vi.mock("../../../src/utils/inlineFormatting", () => ({
  sanitizeInlineHtml: (html) => html,
  htmlToInlineMarkdown: (html) => html.replace(/<[^>]*>/g, ""),
}));

vi.mock("../../../src/utils/storage", () => ({
  genBlockId: () => "new-block-id",
}));

vi.mock("../../../src/constants/data", () => {
  const SLASH_COMMANDS = [
    { label: "Heading 1", type: "h1" },
    { label: "Bullet list", type: "bullet" },
  ];
  return {
    SLASH_COMMANDS,
    filterSlashCommands: (query) =>
      SLASH_COMMANDS.filter((c) => c.label.toLowerCase().includes((query || "").toLowerCase())),
  };
});

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
      moveBlock: vi.fn(),
      selectBlock: vi.fn(),
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

  it("Shift+Enter inserts a line break inside a paragraph instead of splitting it", () => {
    document.execCommand = vi.fn();
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.execCommand).toHaveBeenCalledWith("insertLineBreak");
    expect(deps.commitNoteData).not.toHaveBeenCalled();
    expect(deps.insertBlockAfter).not.toHaveBeenCalled();
  });

  it("Shift+Enter in a heading behaves like Enter: headings have no second line", () => {
    document.execCommand = vi.fn();
    deps.noteDataRef.current["note-1"].content.blocks[0] = { id: "b1", type: "h2", text: "Title" };
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);

    // The app owns the key (no browser line break inside the heading); the
    // split itself needs a live selection, which jsdom does not provide.
    expect(event.preventDefault).toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();
  });

  it("handleBlockKeyDown handles Tab for indentation on list blocks", () => {
    deps.noteDataRef.current["note-1"].content.blocks[0] = { id: "b1", type: "bullet", text: "x" };
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.updateBlockIndent).toHaveBeenCalledWith("note-1", 0, 1);
  });

  it("handleBlockKeyDown handles Shift+Tab for outdent on list blocks", () => {
    deps.noteDataRef.current["note-1"].content.blocks[0] = { id: "b1", type: "bullet", text: "x" };
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.updateBlockIndent).toHaveBeenCalledWith("note-1", 0, -1);
  });

  it("handleBlockKeyDown does NOT indent paragraphs (markdown can't express it)", () => {
    // block[0] is a "p" by default — Tab is swallowed but must not indent.
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.updateBlockIndent).not.toHaveBeenCalled();
  });

  it("Cmd+Shift+ArrowUp moves a block up", () => {
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 1, event);
    expect(deps.moveBlock).toHaveBeenCalledWith("note-1", 1, 0);
  });

  it("Ctrl+Shift+ArrowDown moves a block down", () => {
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event);
    expect(deps.moveBlock).toHaveBeenCalledWith("note-1", 0, 1);
  });

  it("does not move past the top boundary", () => {
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    const event = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "preventDefault", { value: vi.fn() });

    result.current.handleBlockKeyDown("note-1", 0, event); // already first
    expect(deps.moveBlock).not.toHaveBeenCalled();
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

  describe("selectable blocks: a divider or image stops the keys instead of being skipped", () => {
    const withDivider = () => ({
      content: {
        blocks: [
          { id: "b1", type: "p", text: "Hello" },
          { id: "hr", type: "spacer" },
          { id: "b2", type: "p", text: "World" },
        ],
      },
    });
    /** A real collapsed selection in jsdom, `offset` characters into the block's text. */
    function caretIn(el, text, offset) {
      el.textContent = text;
      document.body.appendChild(el);
      const range = document.createRange();
      range.setStart(el.firstChild, offset);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const key = (k) => {
      const e = new KeyboardEvent("keydown", { key: k, bubbles: true });
      Object.defineProperty(e, "preventDefault", { value: vi.fn() });
      return e;
    };

    beforeEach(() => {
      deps.noteDataRef.current["note-1"] = withDivider();
      deps.blockRefs.current = {
        b1: document.createElement("div"),
        hr: document.createElement("div"),
        b2: document.createElement("div"),
      };
      // jsdom has no layout: a Range has no rect at all and an element's is all
      // zeros, which the arrow handlers read as "caret on the first and last
      // line", exactly the edge they act on.
      Range.prototype.getBoundingClientRect = () => ({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
      });
    });
    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("Backspace in an empty block under a divider selects the divider and deletes nothing", () => {
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      const event = key("Backspace");
      result.current.handleBlockKeyDown("note-1", 2, event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(deps.selectBlock).toHaveBeenCalledWith("hr");
      expect(deps.deleteBlock).not.toHaveBeenCalled();
    });

    it("Backspace at the start of a block under a divider selects it and merges nothing across it", () => {
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      const event = key("Backspace");
      result.current.handleBlockKeyDown("note-1", 2, event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(deps.selectBlock).toHaveBeenCalledWith("hr");
      expect(deps.updateBlockText).not.toHaveBeenCalled();
      expect(deps.deleteBlock).not.toHaveBeenCalled();
    });

    it("Backspace at the start of a block under a paragraph still merges into it", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hello" },
            { id: "b2", type: "p", text: "World" },
          ],
        },
      };
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 1, key("Backspace"));
      expect(deps.selectBlock).not.toHaveBeenCalled();
      expect(deps.updateBlockText).toHaveBeenCalledWith("note-1", 0, "HelloWorld");
      expect(deps.deleteBlock).toHaveBeenCalledWith("note-1", 1);
    });

    it("ArrowUp from the first line of the block under a divider selects it", () => {
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      const event = key("ArrowUp");
      result.current.handleBlockKeyDown("note-1", 2, event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(deps.selectBlock).toHaveBeenCalledWith("hr");
      expect(placeCaret).not.toHaveBeenCalled();
    });

    it("ArrowDown from the last line of the block above a divider selects it", () => {
      caretIn(deps.blockRefs.current.b1, "Hello", 5);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      const event = key("ArrowDown");
      result.current.handleBlockKeyDown("note-1", 0, event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(deps.selectBlock).toHaveBeenCalledWith("hr");
      expect(placeCaret).not.toHaveBeenCalled();
    });

    it("an image is stopped on too; a file block between is still stepped over", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hello" },
            { id: "img", type: "image", src: "a.png" },
            { id: "f", type: "file", src: "a.pdf" },
            { id: "b2", type: "p", text: "World" },
          ],
        },
      };
      deps.blockRefs.current.img = document.createElement("div");
      deps.blockRefs.current.f = document.createElement("div");
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 3, key("ArrowUp"));
      expect(deps.selectBlock).toHaveBeenCalledWith("img");
    });

    it("with nothing selectable between, ArrowUp still walks to the previous text block", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hello" },
            { id: "f", type: "file", src: "a.pdf" },
            { id: "b2", type: "p", text: "World" },
          ],
        },
      };
      deps.blockRefs.current.f = document.createElement("div");
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 2, key("ArrowUp"));
      expect(deps.selectBlock).not.toHaveBeenCalled();
      expect(placeCaret).toHaveBeenCalledWith(deps.blockRefs.current.b1, 5);
    });
  });
});
