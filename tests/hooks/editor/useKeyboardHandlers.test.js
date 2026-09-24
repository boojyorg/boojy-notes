/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardHandlers } from "../../../src/hooks/editor/useKeyboardHandlers";
import { focusOwnedField, placeCaret } from "../../../src/utils/domHelpers";

// Mock dependencies
vi.mock("../../../src/utils/domHelpers", () => ({
  findNearestBlock: vi.fn(),
  // As the real ones: a block with a field of its own is not editable text.
  isEditableBlock: (block) =>
    !["image", "spacer", "embed", "file", "code", "table", "callout", "frontmatter"].includes(
      block.type,
    ),
  isSelectableBlock: (block) => block.type === "spacer" || block.type === "image",
  hasOwnField: (block) => ["code", "callout", "table"].includes(block?.type),
  focusOwnedField: vi.fn(() => true),
  caretRect: (range) => range.getBoundingClientRect(),
  placeCaret: vi.fn(() => true),
  // Visible characters, as the real ones count them (no icons or anchors here).
  caretLength: (el) => el.textContent.length,
  caretOffsetAt: (el, node, offset) => {
    const range = document.createRange();
    range.setStart(el, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  },
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
      scopeOf: vi.fn(() => ({
        kind: "block",
        start: { blockIndex: 0, blockId: "b1" },
        end: { blockIndex: 0, blockId: "b1" },
      })),
      executeSlashCommand: vi.fn(),
      handleBlockInput: vi.fn(),
    };
  });

  it("returns the two handler functions", () => {
    const { result } = renderHook(() => useKeyboardHandlers(deps));
    expect(result.current.handleBlockKeyDown).toBeInstanceOf(Function);
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
      range.setStart(el.firstChild ?? el, offset);
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

    // One press: the empty row goes and the divider is selected, so what the
    // next Backspace removes is on screen (2026-09-23; the row used to stay
    // with the caret blinking in it and the selection went unseen).
    it("Backspace in an empty block under a divider removes the row and selects the divider", () => {
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      const event = key("Backspace");
      result.current.handleBlockKeyDown("note-1", 2, event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(deps.deleteBlock).toHaveBeenCalledWith("note-1", 2);
      expect(deps.selectBlock).toHaveBeenCalledWith("hr");
      // The caret rests in the nearest text, above here, while the divider is selected.
      expect(deps.focusBlockId.current).toBe("b1");
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

    it("Backspace at the start of a heading makes it a paragraph and keeps its text", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hello" },
            {
              id: "b2",
              type: "h3",
              text: "World",
              headingSource: { indent: "", gap: " ", suffix: "" },
            },
          ],
        },
      };
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      const event = key("Backspace");
      result.current.handleBlockKeyDown("note-1", 1, event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(deps.updateBlockText).not.toHaveBeenCalled();
      expect(deps.deleteBlock).not.toHaveBeenCalled();
      const next = deps.commitNoteData.mock.calls[0][0](deps.noteDataRef.current);
      expect(next["note-1"].content.blocks[1]).toEqual({ id: "b2", type: "p", text: "World" });
      expect(deps.focusBlockId.current).toBe("b2");
      expect(deps.focusCursorPos.current).toBe(0);
    });

    it("Backspace in an empty heading under a divider makes it a paragraph, selecting nothing", () => {
      deps.noteDataRef.current["note-1"].content.blocks[2] = { id: "b2", type: "h3", text: "" };
      caretIn(deps.blockRefs.current.b2, "", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 2, key("Backspace"));
      expect(deps.selectBlock).not.toHaveBeenCalled();
      const next = deps.commitNoteData.mock.calls[0][0](deps.noteDataRef.current);
      expect(next["note-1"].content.blocks[2].type).toBe("p");
    });

    it("Backspace at the start of a task drops the tick with the kind", () => {
      deps.noteDataRef.current["note-1"].content.blocks[2] = {
        id: "b2",
        type: "checkbox",
        text: "World",
        checked: true,
      };
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 2, key("Backspace"));
      const next = deps.commitNoteData.mock.calls[0][0](deps.noteDataRef.current);
      expect(next["note-1"].content.blocks[2]).toEqual({ id: "b2", type: "p", text: "World" });
    });

    it("Backspace at the start of an indented list item still outdents first", () => {
      deps.noteDataRef.current["note-1"].content.blocks[2] = {
        id: "b2",
        type: "bullet",
        text: "World",
        indent: 1,
      };
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 2, key("Backspace"));
      expect(deps.updateBlockIndent).toHaveBeenCalledWith("note-1", 2, -1);
      expect(deps.commitNoteData).not.toHaveBeenCalled();
    });

    it("a merge puts the caret at the seam in visible characters, not Markdown ones", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hi **there**" },
            { id: "b2", type: "p", text: "World" },
          ],
        },
      };
      deps.blockRefs.current.b1.textContent = "Hi there";
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 1, key("Backspace"));
      expect(deps.updateBlockText).toHaveBeenCalledWith("note-1", 0, "Hi **there**World");
      expect(deps.focusCursorPos.current).toBe(8);
    });

    it("Enter at the start of a heading opens a paragraph above and keeps the heading", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hello" },
            { id: "b2", type: "h2", text: "World" },
          ],
        },
      };
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 1, key("Enter"));
      expect(deps.insertBlockAfter).toHaveBeenCalledWith("note-1", 0, "p", "");
      expect(deps.updateBlockText).not.toHaveBeenCalled();
      expect(deps.focusBlockId.current).toBe("b2");
      expect(deps.focusCursorPos.current).toBe(0);
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

    // The arrows walk into a block that keeps its own field, as they always
    // have for a table (2026-09-19): before this a code block was stepped over
    // in both directions and the pointer was the only way in.
    it("the arrows walk into a code block instead of stepping over it", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hello" },
            { id: "c1", type: "code", text: "x = 1", lang: "python" },
            { id: "b2", type: "p", text: "World" },
          ],
        },
      };
      deps.blockRefs.current.c1 = document.createElement("div");
      const { result } = renderHook(() => useKeyboardHandlers(deps));

      // From above: its first field, at the start.
      caretIn(deps.blockRefs.current.b1, "Hello", 5);
      const down = key("ArrowDown");
      result.current.handleBlockKeyDown("note-1", 0, down);
      expect(down.preventDefault).toHaveBeenCalled();
      expect(focusOwnedField).toHaveBeenCalledWith(expect.anything(), "c1");
      expect(placeCaret).not.toHaveBeenCalled();

      // From below: the same field, at its end.
      focusOwnedField.mockClear();
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const up = key("ArrowUp");
      result.current.handleBlockKeyDown("note-1", 2, up);
      expect(up.preventDefault).toHaveBeenCalled();
      expect(focusOwnedField).toHaveBeenCalledWith(expect.anything(), "c1", "end");
      expect(placeCaret).not.toHaveBeenCalled();
    });

    // Deletion is a different question from navigation: Backspace merges text,
    // so it may only land where text can go and still steps over a code block.
    it("Backspace still steps over a code block rather than merging into it", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hello" },
            { id: "c1", type: "code", text: "x = 1", lang: "python" },
            { id: "b2", type: "p", text: "World" },
          ],
        },
      };
      deps.blockRefs.current.c1 = document.createElement("div");
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 2, key("Backspace"));
      expect(deps.updateBlockText).toHaveBeenCalledWith("note-1", 0, "HelloWorld");
      expect(focusOwnedField).not.toHaveBeenCalled();
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

    // The name lives in the chrome row, not above the editor (2026-09-24):
    // ArrowUp with nothing above finds it by `data-title` and ends there.
    it("ArrowUp from the first block focuses the note's name, caret at its end", () => {
      const title = document.createElement("div");
      title.contentEditable = "true";
      // jsdom focuses a contentEditable element only with a tabIndex.
      title.tabIndex = 0;
      title.setAttribute("data-title", "");
      title.textContent = "Plan";
      document.body.appendChild(title);
      caretIn(deps.blockRefs.current.b1, "Hello", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      const event = key("ArrowUp");
      result.current.handleBlockKeyDown("note-1", 0, event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(document.activeElement).toBe(title);
      const sel = window.getSelection();
      expect(sel.anchorNode === title || title.contains(sel.anchorNode)).toBe(true);
      expect(sel.getRangeAt(0).collapsed).toBe(true);
      expect(deps.selectBlock).not.toHaveBeenCalled();
    });

    it("ArrowUp at the end of a block that draws bold lands at its visible end, not its Markdown's", () => {
      deps.noteDataRef.current["note-1"] = {
        content: {
          blocks: [
            { id: "b1", type: "p", text: "Hi **there**" },
            { id: "b2", type: "p", text: "World" },
          ],
        },
      };
      deps.blockRefs.current.b1.textContent = "Hi there";
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 1, key("ArrowUp"));
      expect(placeCaret).toHaveBeenCalledWith(deps.blockRefs.current.b1, 8);
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
      // The caret lands at the end the block draws (its visible length).
      deps.blockRefs.current.b1.textContent = "Hello";
      caretIn(deps.blockRefs.current.b2, "World", 0);
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 2, key("ArrowUp"));
      expect(deps.selectBlock).not.toHaveBeenCalled();
      expect(placeCaret).toHaveBeenCalledWith(deps.blockRefs.current.b1, 5);
    });
  });

  /**
   * The tag and wikilink menus take Enter, the arrows and Escape in a
   * capture-phase window listener and prevent the default. Enter on a tag
   * suggestion still reached the editor's handler, which split the block on
   * the DOM text instead of completing the tag (review 2026-09-06, H3). One
   * rule for every menu: a key something else has consumed is not the editor's.
   */
  describe("a key a menu has already consumed", () => {
    function caretAtEndOf(el, text) {
      el.textContent = text;
      document.body.appendChild(el);
      const range = document.createRange();
      range.setStart(el.firstChild, text.length);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const enter = (consumed) => {
      const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      if (consumed) e.preventDefault();
      return e;
    };

    afterEach(() => {
      document.body.innerHTML = "";
      window.getSelection().removeAllRanges();
    });

    it("handleEditorKeyDown does nothing on a consumed Enter, and splits the block on the same key unconsumed", () => {
      deps.getBlock.mockImplementation(() => ({ blockIndex: 0, blockId: "b1" }));
      caretAtEndOf(deps.blockRefs.current.b1, "Hello");
      const { result } = renderHook(() => useKeyboardHandlers(deps));

      result.current.handleEditorKeyDown(enter(true));
      expect(deps.commitNoteData).not.toHaveBeenCalled();
      expect(deps.insertBlockAfter).not.toHaveBeenCalled();
      expect(placeCaret).not.toHaveBeenCalled();
      expect(deps.focusBlockId.current).toBeNull();

      result.current.handleEditorKeyDown(enter(false));
      expect(deps.commitNoteData.mock.calls.length + deps.insertBlockAfter.mock.calls.length).toBe(
        1,
      );
    });

    it("with no selection at all, a consumed key does not even park the caret", () => {
      window.getSelection().removeAllRanges();
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleEditorKeyDown(enter(true));
      expect(placeCaret).not.toHaveBeenCalled();
    });
  });
  describe("Cmd+Shift+Arrow under frontmatter", () => {
    const shiftArrow = (key) => {
      const event = new KeyboardEvent("keydown", {
        key,
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });
      Object.defineProperty(event, "preventDefault", { value: vi.fn() });
      return event;
    };

    beforeEach(() => {
      deps.noteDataRef.current["note-1"].content.blocks = [
        { id: "fm", type: "frontmatter", text: "title: x" },
        { id: "b1", type: "p", text: "Hello" },
        { id: "b2", type: "p", text: "World" },
      ];
    });

    it("the first block under the frontmatter is at the top: ArrowUp moves nothing", () => {
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      const event = shiftArrow("ArrowUp");
      result.current.handleBlockKeyDown("note-1", 1, event);
      expect(deps.moveBlock).not.toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("ArrowDown from it, and ArrowUp from the block below, still reorder under the frontmatter", () => {
      const { result } = renderHook(() => useKeyboardHandlers(deps));
      result.current.handleBlockKeyDown("note-1", 1, shiftArrow("ArrowDown"));
      expect(deps.moveBlock).toHaveBeenCalledWith("note-1", 1, 2);
      result.current.handleBlockKeyDown("note-1", 2, shiftArrow("ArrowUp"));
      expect(deps.moveBlock).toHaveBeenCalledWith("note-1", 2, 1);
    });
  });
});
