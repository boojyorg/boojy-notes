/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
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

const typedFormatHit = vi.fn(() => null);
const paintTypedFormat = vi.fn(() => true);
vi.mock("../../../src/utils/typedFormatting", () => ({
  typedFormatHit: (...args) => typedFormatHit(...args),
  paintTypedFormat: (...args) => paintTypedFormat(...args),
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
      tagMenuRef: { current: null },
      setTagMenu: vi.fn(),
      syncGeneration: { current: 0 },
      updateBlockText: vi.fn(),
      insertBlockAfter: vi.fn(),
      openCodeBlock: vi.fn(),
      openDivider: vi.fn(),
      getBlock: vi.fn(),
      executeSlashCommand: vi.fn(),
      noteTitleSetRef: { current: new Set(["Welcome"]) },
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

  // A fence waits for its space, as every marker carrying an argument does;
  // the conversion itself is openCodeBlock's, shared with the Enter form.
  it("opens a plain code block on ``` and a space", () => {
    mockEl.textContent = "``` ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.openCodeBlock).toHaveBeenCalledWith("note-1", 0, "");
  });

  it("takes the language from ```python and a space", () => {
    mockEl.textContent = "```python ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.openCodeBlock).toHaveBeenCalledWith("note-1", 0, "python");
  });

  it("leaves a fence with no space as text", () => {
    mockEl.textContent = "```python";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.openCodeBlock).not.toHaveBeenCalled();
    expect(deps.commitNoteData).not.toHaveBeenCalled();
  });

  it("opens a divider on --- and a space, however long the run", () => {
    mockEl.textContent = "--- ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.openDivider).toHaveBeenCalledWith("note-1", 0);

    deps.openDivider.mockClear();
    mockEl.textContent = "---------- ";
    result.current.handleBlockInput("note-1", 0);
    expect(deps.openDivider).toHaveBeenCalledWith("note-1", 0);
  });

  it("leaves a run of dashes with no space as text", () => {
    mockEl.textContent = "----------";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.openDivider).not.toHaveBeenCalled();
    expect(deps.commitNoteData).not.toHaveBeenCalled();
  });

  it("detects blockquote shortcut (> )", () => {
    mockEl.textContent = "> ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.commitNoteData).toHaveBeenCalled();
  });

  // The pipes are the row being drawn: a row of N cells is written with N+1
  // pipes, so ||| is two columns and |||| is three.
  it("||| and a space runs the menu's Table command, the pipes its columns", () => {
    mockEl.textContent = "||| ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.executeSlashCommand).toHaveBeenCalledWith(
      "note-1",
      0,
      expect.objectContaining({ id: "table", type: "table" }),
      { columns: 2 },
    );
    expect(deps.commitNoteData).not.toHaveBeenCalled();

    deps.executeSlashCommand.mockClear();
    mockEl.textContent = "|||| ";
    result.current.handleBlockInput("note-1", 0);
    expect(deps.executeSlashCommand).toHaveBeenCalledWith("note-1", 0, expect.anything(), {
      columns: 3,
    });
  });

  it("leaves a run of pipes with no space as text", () => {
    mockEl.textContent = "|||||";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.executeSlashCommand).not.toHaveBeenCalled();
  });

  it("a hand-typed table row is not a trigger", () => {
    for (const text of ["| ", "| a |", "||"]) {
      mockEl.textContent = text;
      const { result } = renderHook(() => useInputHandler(deps));
      result.current.handleBlockInput("note-1", 0);
    }
    expect(deps.executeSlashCommand).not.toHaveBeenCalled();
  });

  it("![] followed by a space runs the menu's Image command", () => {
    mockEl.textContent = "![] ";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.executeSlashCommand).toHaveBeenCalledWith(
      "note-1",
      0,
      expect.objectContaining({ id: "image", type: "image" }),
      // Only the table trigger carries an argument; the image's is undefined.
      { columns: undefined },
    );
  });

  it("![] without the space waits, so ![alt](url) can still be typed through it", () => {
    mockEl.textContent = "![]";
    const { result } = renderHook(() => useInputHandler(deps));
    result.current.handleBlockInput("note-1", 0);
    expect(deps.executeSlashCommand).not.toHaveBeenCalled();
    expect(deps.commitNoteData).not.toHaveBeenCalled();
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

  // Typed inline formatting: the closing marker of `**bold**` repaints the
  // block and parks the caret after it. The trigger reads the native
  // InputEvent, is asked before the text commit so an underscore rewrite is
  // one commit, and stays out of the way of a suggestion menu.
  describe("typed inline formatting", () => {
    const native = { inputType: "insertText", data: "*", isComposing: false };
    const hit = (extra = {}) => ({
      kind: "bold",
      head: "say ",
      canonicalRun: "**bold**",
      newText: "say **bold**",
      rewritten: false,
      visibleCaret: 12,
      ...extra,
    });

    it("asks the trigger with the native event and paints before the commit", () => {
      mockEl.textContent = "say **bold**";
      typedFormatHit.mockReturnValueOnce(hit());
      const order = [];
      paintTypedFormat.mockImplementationOnce(() => (order.push("paint"), true));
      deps.updateBlockText.mockImplementationOnce(() => order.push("commit"));
      const { result } = renderHook(() => useInputHandler(deps));
      result.current.handleBlockInput("note-1", 0, native);
      expect(typedFormatHit).toHaveBeenCalledWith(mockEl, native);
      expect(paintTypedFormat).toHaveBeenCalledWith(
        mockEl,
        expect.objectContaining({ kind: "bold" }),
        "say **bold**",
        deps.noteTitleSetRef.current,
      );
      expect(order).toEqual(["paint", "commit"]);
      expect(deps.updateBlockText).toHaveBeenCalledWith("note-1", 0, "say **bold**");
      expect(deps.commitNoteData).not.toHaveBeenCalled();
      expect(deps.syncGeneration.current).toBe(0);
    });

    it("never asks without a native event", () => {
      mockEl.textContent = "say **bold**";
      const { result } = renderHook(() => useInputHandler(deps));
      result.current.handleBlockInput("note-1", 0);
      expect(typedFormatHit).not.toHaveBeenCalled();
      expect(paintTypedFormat).not.toHaveBeenCalled();
    });

    it("commits an underscore run in the star form, once, only when painted", () => {
      mockEl.textContent = "see _it_ now";
      typedFormatHit.mockReturnValueOnce(
        hit({ kind: "italic", rewritten: true, newText: "see *it* now" }),
      );
      const { result } = renderHook(() => useInputHandler(deps));
      result.current.handleBlockInput("note-1", 0, { ...native, data: "_" });
      expect(paintTypedFormat).toHaveBeenCalledWith(
        mockEl,
        expect.anything(),
        "see *it* now",
        expect.anything(),
      );
      expect(deps.updateBlockText).toHaveBeenCalledTimes(1);
      expect(deps.updateBlockText).toHaveBeenCalledWith("note-1", 0, "see *it* now");

      // A paint that found no element leaves the literal text as the commit.
      vi.clearAllMocks();
      typedFormatHit.mockReturnValueOnce(
        hit({ kind: "italic", rewritten: true, newText: "see *it* now" }),
      );
      paintTypedFormat.mockReturnValueOnce(false);
      result.current.handleBlockInput("note-1", 0, { ...native, data: "_" });
      expect(deps.updateBlockText).toHaveBeenCalledTimes(1);
      expect(deps.updateBlockText).toHaveBeenCalledWith("note-1", 0, "see _it_ now");
    });

    it("stands aside for a suggestion menu", () => {
      // (A tag ends in word characters, so a closing marker never coincides with one.)
      for (const text of ["**[[x**", "/**x**"]) {
        vi.clearAllMocks();
        mockEl.textContent = text;
        typedFormatHit.mockReturnValueOnce(hit());
        const { result } = renderHook(() => useInputHandler(deps));
        result.current.handleBlockInput("note-1", 0, native);
        expect(paintTypedFormat, text).not.toHaveBeenCalled();
      }
    });

    it("handleEditorInput hands the native event through", () => {
      mockEl.textContent = "say **bold**";
      document.body.appendChild(mockEl);
      deps.getBlock.mockReturnValue({ blockIndex: 0 });
      const range = document.createRange();
      range.setStart(mockEl, 0);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      const { result } = renderHook(() => useInputHandler(deps));
      result.current.handleEditorInput({ nativeEvent: native });
      expect(typedFormatHit).toHaveBeenCalledWith(mockEl, native);
      mockEl.remove();
    });
  });
});
