/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditorHandlers } from "../../src/hooks/useEditorHandlers.js";
import {
  makeNoteData,
  paragraph,
  bullet,
  checkbox,
  heading,
  numbered,
  blockquote,
  resetBlockCounter,
} from "../mocks/blocks.js";

// ---- Mocks ----

vi.mock("../../src/services/apiProvider", () => ({
  getAPI: () => null,
}));

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({ theme: { ACCENT: { primary: "#000" } } }),
}));

vi.mock("../../src/utils/inlineFormatting", () => ({
  sanitizeInlineHtml: (html) => html,
  htmlToInlineMarkdown: (html) => {
    // Strip tags for simple cases
    return html.replace(/<br\s*\/?>/gi, "").replace(/<[^>]+>/g, "");
  },
  domNodeToMarkdown: (el) => el.textContent || "",
  stripMarkdownFormatting: (md) => md,
  inlineMarkdownToHtml: (md) => md,
}));

vi.mock("../../src/utils/storage", () => ({
  genBlockId: (() => {
    let c = 0;
    return () => `gen-block-${++c}`;
  })(),
}));

// ---- Helpers ----

beforeEach(() => {
  resetBlockCounter();
  document.body.innerHTML = "";
});

/**
 * Build all the refs/mocks needed by useEditorHandlers and render the hook.
 */
function setup(blocks, noteId = "note-1") {
  let noteData = makeNoteData(noteId, blocks);

  // Create real DOM elements for editor and blocks
  const editorEl = document.createElement("div");
  editorEl.setAttribute("data-editor", "true");
  document.body.appendChild(editorEl);

  const blockRefsMap = {};
  blocks.forEach((b) => {
    const el = document.createElement("div");
    el.setAttribute("data-block-id", b.id);
    el.textContent = b.text || "";
    el.innerHTML = b.text || "<br>";
    el.getBoundingClientRect = () => ({
      top: 0,
      bottom: 20,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
    });
    editorEl.appendChild(el);
    blockRefsMap[b.id] = el;
  });

  const noteDataRef = { current: noteData };
  const noteTitleSetRef = { current: new Set() };
  const blockRefs = { current: blockRefsMap };
  const editorRef = { current: editorEl };
  const focusBlockId = { current: null };
  const focusCursorPos = { current: null };
  const slashMenuRef = { current: null };
  const wikilinkMenuRef = { current: null };
  const tagMenuRef = { current: null };
  const syncGeneration = { current: 0 };
  const mouseIsDown = { current: false };

  const commitNoteData = vi.fn((updater) => {
    noteData = updater(noteData);
    noteDataRef.current = noteData;
  });
  const commitTextChange = vi.fn((updater) => {
    noteData = updater(noteData);
    noteDataRef.current = noteData;
  });
  const updateBlockText = vi.fn((nId, idx, text) => {
    noteData = { ...noteData };
    const n = { ...noteData[nId] };
    const blks = [...n.content.blocks];
    blks[idx] = { ...blks[idx], text };
    n.content = { ...n.content, blocks: blks };
    noteData[nId] = n;
    noteDataRef.current = noteData;
  });
  const insertBlockAfter = vi.fn();
  const deleteBlock = vi.fn();
  const saveAndInsertImage = vi.fn();
  const insertFileBlock = vi.fn();
  const reReadBlockFromDom = vi.fn();
  const toggleInlineCode = vi.fn();
  const applyFormat = vi.fn();
  const setSlashMenu = vi.fn((v) => {
    if (typeof v === "function") {
      slashMenuRef.current = v(slashMenuRef.current);
    } else {
      slashMenuRef.current = v;
    }
  });
  const setWikilinkMenu = vi.fn((v) => {
    if (typeof v === "function") {
      wikilinkMenuRef.current = v(wikilinkMenuRef.current);
    } else {
      wikilinkMenuRef.current = v;
    }
  });
  const setTagMenu = vi.fn((v) => {
    if (typeof v === "function") {
      tagMenuRef.current = v(tagMenuRef.current);
    } else {
      tagMenuRef.current = v;
    }
  });
  const setToolbarState = vi.fn();
  const onOpenLinkEditor = vi.fn();
  const updateBlockIndent = vi.fn();

  const deps = {
    noteDataRef,
    noteTitleSetRef,
    activeNote: noteId,
    commitNoteData,
    commitTextChange,
    blockRefs,
    editorRef,
    focusBlockId,
    focusCursorPos,
    slashMenuRef,
    setSlashMenu,
    wikilinkMenuRef,
    setWikilinkMenu,
    tagMenuRef,
    setTagMenu,
    syncGeneration,
    updateBlockText,
    insertBlockAfter,
    deleteBlock,
    saveAndInsertImage,
    insertFileBlock,
    reReadBlockFromDom,
    toggleInlineCode,
    applyFormat,
    mouseIsDown,
    setToolbarState,
    onOpenLinkEditor,
    updateBlockIndent,
  };

  const { result } = renderHook(() => useEditorHandlers(deps));

  /** Place cursor at a position inside a block's DOM element */
  function placeCursorInBlock(blockIndex, offset) {
    const b = noteDataRef.current[noteId].content.blocks[blockIndex];
    const el = blockRefs.current[b.id];
    const textNode = el.firstChild || el.appendChild(document.createTextNode(""));
    const range = document.createRange();
    const clampedOffset = Math.min(offset, textNode.textContent.length);
    range.setStart(textNode, clampedOffset);
    range.setEnd(textNode, clampedOffset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Update the DOM text of a block element (simulating user typing) */
  function setBlockDomText(blockIndex, text) {
    const b = noteDataRef.current[noteId].content.blocks[blockIndex];
    const el = blockRefs.current[b.id];
    el.textContent = text;
    el.innerHTML = text || "<br>";
  }

  return {
    result,
    noteId,
    getNoteData: () => noteDataRef.current,
    noteDataRef,
    blockRefs,
    editorRef,
    focusBlockId,
    focusCursorPos,
    slashMenuRef,
    wikilinkMenuRef,
    commitNoteData,
    updateBlockText,
    insertBlockAfter,
    deleteBlock,
    setSlashMenu,
    setWikilinkMenu,
    updateBlockIndent,
    reReadBlockFromDom,
    applyFormat,
    toggleInlineCode,
    onOpenLinkEditor,
    saveAndInsertImage,
    placeCursorInBlock,
    setBlockDomText,
  };
}

// ---- Tests ----

describe("useEditorHandlers", () => {
  describe("handleEditorKeyDown — Enter key", () => {
    it("splits block at cursor position (calls insertBlockAfter)", () => {
      const blocks = [paragraph("hello world")];
      const s = setup(blocks);

      s.placeCursorInBlock(0, 5);

      act(() => {
        s.result.current.handleEditorKeyDown(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });

      expect(s.updateBlockText).toHaveBeenCalled();
      expect(s.insertBlockAfter).toHaveBeenCalled();
    });

    it("converts empty list block to paragraph on Enter", () => {
      const blocks = [bullet("")];
      const s = setup(blocks);

      s.placeCursorInBlock(0, 0);

      act(() => {
        const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
        s.result.current.handleEditorKeyDown(e);
      });

      expect(s.commitNoteData).toHaveBeenCalled();
      const blks = s.getNoteData()[s.noteId].content.blocks;
      expect(blks[0].type).toBe("p");
    });
  });

  describe("handleEditorKeyDown — Backspace", () => {
    it("deletes empty block and focuses previous block", () => {
      const blocks = [paragraph("first"), paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(1, "");
      s.placeCursorInBlock(1, 0);

      act(() => {
        const e = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true });
        s.result.current.handleEditorKeyDown(e);
      });

      expect(s.deleteBlock).toHaveBeenCalledWith(s.noteId, 1);
      expect(s.focusBlockId.current).toBe(blocks[0].id);
    });

    it("merges with previous block when cursor is at start", () => {
      const blocks = [paragraph("hello"), paragraph("world")];
      const s = setup(blocks);

      s.placeCursorInBlock(1, 0);

      act(() => {
        const e = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true });
        s.result.current.handleEditorKeyDown(e);
      });

      expect(s.updateBlockText).toHaveBeenCalledWith(s.noteId, 0, "helloworld");
      expect(s.deleteBlock).toHaveBeenCalledWith(s.noteId, 1);
      expect(s.focusCursorPos.current).toBe(5);
    });
  });

  describe("handleEditorKeyDown — Tab indent/dedent", () => {
    it("indents block on Tab", () => {
      const blocks = [bullet("item")];
      const s = setup(blocks);

      s.placeCursorInBlock(0, 0);

      act(() => {
        const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
        s.result.current.handleEditorKeyDown(e);
      });

      expect(s.updateBlockIndent).toHaveBeenCalledWith(s.noteId, 0, 1);
    });

    it("dedents block on Shift+Tab", () => {
      const blocks = [bullet("item")];
      const s = setup(blocks);

      s.placeCursorInBlock(0, 0);

      act(() => {
        const e = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true });
        s.result.current.handleEditorKeyDown(e);
      });

      expect(s.updateBlockIndent).toHaveBeenCalledWith(s.noteId, 0, -1);
    });
  });

  describe("handleEditorKeyDown — Escape closes slash menu", () => {
    it("closes slash menu on Escape", () => {
      const blocks = [paragraph("/")];
      const s = setup(blocks);

      // Simulate slash menu being open
      s.slashMenuRef.current = { noteId: s.noteId, blockIndex: 0, filter: "", selectedIndex: 0 };

      s.placeCursorInBlock(0, 1);

      act(() => {
        const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
        s.result.current.handleEditorKeyDown(e);
      });

      expect(s.setSlashMenu).toHaveBeenCalledWith(null);
    });
  });

  describe("handleEditorInput — text updates and menu triggers", () => {
    it("updates block text via handleBlockInput", () => {
      const blocks = [paragraph("hello")];
      const s = setup(blocks);

      s.setBlockDomText(0, "hello!");
      s.placeCursorInBlock(0, 6);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.updateBlockText).toHaveBeenCalledWith(s.noteId, 0, "hello!");
    });

    it("detects slash command trigger (/)", () => {
      const blocks = [paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(0, "/");
      s.placeCursorInBlock(0, 1);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.setSlashMenu).toHaveBeenCalled();
      const call = s.setSlashMenu.mock.calls[0][0];
      expect(call).toMatchObject({ noteId: s.noteId, blockIndex: 0, filter: "" });
    });

    it("detects wikilink trigger ([[)", () => {
      const blocks = [paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(0, "see [[");
      s.placeCursorInBlock(0, 6);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.setWikilinkMenu).toHaveBeenCalled();
      const call = s.setWikilinkMenu.mock.calls[0][0];
      expect(call).toMatchObject({ noteId: s.noteId, blockIndex: 0, filter: "" });
    });
  });

  describe("handleEditorPaste", () => {
    function makePasteEvent(text, html) {
      const e = new Event("paste", { bubbles: true, cancelable: true });
      e.clipboardData = {
        getData: (type) => {
          if (type === "text/plain") return text;
          if (type === "text/html") return html || "";
          if (type === "text/boojy-blocks") return "";
          return "";
        },
        setData: vi.fn(),
        files: [],
      };
      e.preventDefault = vi.fn();
      return e;
    }

    it("handles plain text paste", () => {
      const blocks = [paragraph("hello")];
      const s = setup(blocks);

      s.placeCursorInBlock(0, 5);

      // Mock document.execCommand for insertText
      const originalExecCommand = document.execCommand;
      document.execCommand = vi.fn();

      act(() => {
        s.result.current.handleEditorPaste(makePasteEvent(" world"));
      });

      expect(document.execCommand).toHaveBeenCalledWith("insertText", false, " world");
      document.execCommand = originalExecCommand;
    });

    function makeBlockPasteEvent(text, boojyBlocks) {
      const e = new Event("paste", { bubbles: true, cancelable: true });
      e.clipboardData = {
        getData: (type) => {
          if (type === "text/plain") return text;
          if (type === "text/boojy-blocks") return boojyBlocks ? JSON.stringify(boojyBlocks) : "";
          return "";
        },
        setData: vi.fn(),
        files: [],
      };
      e.preventDefault = vi.fn();
      return e;
    }

    it("treats a single terminal line ending as incidental and pastes inline", () => {
      const s = setup([checkbox("")]);
      s.placeCursorInBlock(0, 0);
      const originalExecCommand = document.execCommand;
      document.execCommand = vi.fn();

      act(() => {
        s.result.current.handleEditorPaste(makePasteEvent("Buy milk\n"));
      });

      expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "Buy milk");
      expect(s.commitNoteData).not.toHaveBeenCalled();
      document.execCommand = originalExecCommand;
    });

    it("multi-line plain text into an empty checkbox keeps the checkbox", () => {
      const s = setup([checkbox("")]);
      s.placeCursorInBlock(0, 0);

      act(() => {
        s.result.current.handleEditorPaste(makePasteEvent("line one\nline two\n"));
      });

      const blocks = s.getNoteData()[s.noteId].content.blocks;
      expect(blocks.map((b) => [b.type, b.text, b.checked])).toEqual([
        ["checkbox", "line one", false],
        ["p", "line two", undefined],
      ]);
      expect(s.focusBlockId.current).toBe(blocks[1].id);
    });

    it("multi-line CRLF text at the start of a filled checkbox keeps it a checkbox", () => {
      const s = setup([checkbox("Task", true)]);
      s.placeCursorInBlock(0, 0);

      act(() => {
        s.result.current.handleEditorPaste(makePasteEvent("one\r\ntwo\r\n"));
      });

      const blocks = s.getNoteData()[s.noteId].content.blocks;
      expect(blocks.map((b) => [b.type, b.text, b.checked])).toEqual([
        ["checkbox", "one", true],
        ["p", "twoTask", undefined],
      ]);
    });

    it("a whole paragraph copied inside the app keeps the destination checkbox", () => {
      const s = setup([checkbox("")]);
      s.placeCursorInBlock(0, 0);

      act(() => {
        s.result.current.handleEditorPaste(
          makeBlockPasteEvent("copied line", [{ type: "p", text: "copied line", fullBlock: true }]),
        );
      });

      const blocks = s.getNoteData()[s.noteId].content.blocks;
      expect(blocks).toEqual([
        { id: blocks[0].id, type: "checkbox", text: "copied line", checked: false },
      ]);
    });

    it("structure copied inside the app goes in front of a populated checkbox", () => {
      const s = setup([checkbox("Task")]);
      s.placeCursorInBlock(0, 0);

      act(() => {
        s.result.current.handleEditorPaste(
          makeBlockPasteEvent("Head", [{ type: "h1", text: "Head", fullBlock: true }]),
        );
      });

      const blocks = s.getNoteData()[s.noteId].content.blocks;
      expect(blocks.map((b) => [b.type, b.text])).toEqual([
        ["h1", "Head"],
        ["checkbox", "Task"],
      ]);
    });

    it("a single structured Markdown line takes over an empty block", () => {
      const s = setup([checkbox("")]);
      s.placeCursorInBlock(0, 0);

      act(() => {
        s.result.current.handleEditorPaste(makePasteEvent("## Title\n"));
      });

      const blocks = s.getNoteData()[s.noteId].content.blocks;
      expect(blocks).toEqual([{ id: blocks[0].id, type: "h2", text: "Title" }]);
    });

    it("a single structured Markdown line pastes inline into a populated block", () => {
      const s = setup([checkbox("Task")]);
      s.placeCursorInBlock(0, 4);
      const originalExecCommand = document.execCommand;
      document.execCommand = vi.fn();

      act(() => {
        s.result.current.handleEditorPaste(makePasteEvent("## Title"));
      });

      expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "## Title");
      expect(s.commitNoteData).not.toHaveBeenCalled();
      document.execCommand = originalExecCommand;
    });

    it("repaints the page when a paste keeps the block's id and type", () => {
      // State alone is not enough: the editor skips text-only renders.
      const s = setup([numbered("")]);
      s.placeCursorInBlock(0, 0);

      act(() => {
        s.result.current.handleEditorPaste(
          makeBlockPasteEvent("item", [
            { type: "numbered", text: "item", fullBlock: true },
            { type: "numbered", text: "next", fullBlock: true },
          ]),
        );
      });

      const blocks = s.getNoteData()[s.noteId].content.blocks;
      expect(blocks.map((b) => [b.type, b.text])).toEqual([
        ["numbered", "item"],
        ["numbered", "next"],
      ]);
      expect(s.blockRefs.current[blocks[0].id].innerHTML).toBe("item");
    });

    it("structure at the start of a populated block goes in front and leaves it painted", () => {
      const s = setup([paragraph("keep")]);
      s.placeCursorInBlock(0, 0);

      act(() => {
        s.result.current.handleEditorPaste(makePasteEvent("## Head\nmore"));
      });

      const blocks = s.getNoteData()[s.noteId].content.blocks;
      expect(blocks.map((b) => [b.type, b.text])).toEqual([
        ["h2", "Head"],
        ["p", "more"],
        ["p", "keep"],
      ]);
      expect(s.blockRefs.current[blocks[2].id].innerHTML).toBe("keep");
      expect(s.focusBlockId.current).toBe(blocks[2].id);
      expect(s.focusCursorPos.current).toBe(0);
    });

    it("handles image file paste by calling saveAndInsertImage", () => {
      const blocks = [paragraph("hello")];
      const s = setup(blocks);

      s.placeCursorInBlock(0, 0);

      const imageFile = new File(["data"], "photo.png", { type: "image/png" });
      const e = new Event("paste", { bubbles: true, cancelable: true });
      e.clipboardData = {
        getData: () => "",
        files: [imageFile],
      };
      e.preventDefault = vi.fn();

      act(() => {
        s.result.current.handleEditorPaste(e);
      });

      expect(e.preventDefault).toHaveBeenCalled();
      expect(s.saveAndInsertImage).toHaveBeenCalledWith(s.noteId, 0, imageFile);
    });
  });

  describe("handleEditorCopy", () => {
    function selectAcross(s, startBlock, startOffset, endBlock, endOffset) {
      const blocks = s.getNoteData()[s.noteId].content.blocks;
      const startEl = s.blockRefs.current[blocks[startBlock].id];
      const endEl = s.blockRefs.current[blocks[endBlock].id];
      const range = document.createRange();
      range.setStart(startEl.firstChild, startOffset);
      range.setEnd(endEl.firstChild, endOffset);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    function makeCopyEvent() {
      const e = new Event("copy", { bubbles: true, cancelable: true });
      e.clipboardData = { setData: vi.fn() };
      e.preventDefault = vi.fn();
      return e;
    }
    const formats = (e) => e.clipboardData.setData.mock.calls.map((c) => c[0]);

    it("a selection inside one block copies as text, not as a block", () => {
      const s = setup([numbered("im testing"), paragraph("after")]);
      selectAcross(s, 0, 0, 0, "im testing".length);
      const e = makeCopyEvent();

      act(() => s.result.current.handleEditorCopy(e));

      expect(e.clipboardData.setData).toHaveBeenCalledWith("text/plain", "im testing");
      expect(formats(e)).not.toContain("text/boojy-blocks");
    });

    it("a triple-click that ends at the start of the next block is still one block", () => {
      const s = setup([numbered("im testing"), paragraph("after")]);
      selectAcross(s, 0, 0, 1, 0);
      const e = makeCopyEvent();

      act(() => s.result.current.handleEditorCopy(e));

      expect(formats(e)).not.toContain("text/boojy-blocks");
    });

    it("a selection spanning two blocks carries their structure", () => {
      const s = setup([numbered("one"), numbered("two")]);
      selectAcross(s, 0, 0, 1, 3);
      const e = makeCopyEvent();

      act(() => s.result.current.handleEditorCopy(e));

      const call = e.clipboardData.setData.mock.calls.find((c) => c[0] === "text/boojy-blocks");
      expect(call).toBeDefined();
      expect(JSON.parse(call[1])).toEqual([
        { type: "numbered", text: "one", fullBlock: true },
        { type: "numbered", text: "two", fullBlock: true },
      ]);
    });
  });

  describe("Markdown shortcuts (via handleEditorInput)", () => {
    it('"# " converts block to h1', () => {
      const blocks = [paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(0, "# ");
      s.placeCursorInBlock(0, 2);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.commitNoteData).toHaveBeenCalled();
      const blks = s.getNoteData()[s.noteId].content.blocks;
      expect(blks[0].type).toBe("h1");
      expect(blks[0].text).toBe("");
    });

    it('"## " converts block to h2', () => {
      const blocks = [paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(0, "## ");
      s.placeCursorInBlock(0, 3);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.commitNoteData).toHaveBeenCalled();
      const blks = s.getNoteData()[s.noteId].content.blocks;
      expect(blks[0].type).toBe("h2");
      expect(blks[0].text).toBe("");
    });

    it('"- " converts block to bullet', () => {
      const blocks = [paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(0, "- ");
      s.placeCursorInBlock(0, 2);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.commitNoteData).toHaveBeenCalled();
      const blks = s.getNoteData()[s.noteId].content.blocks;
      expect(blks[0].type).toBe("bullet");
      expect(blks[0].text).toBe("");
    });

    it('"1. " converts block to numbered', () => {
      const blocks = [paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(0, "1. ");
      s.placeCursorInBlock(0, 3);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.commitNoteData).toHaveBeenCalled();
      const blks = s.getNoteData()[s.noteId].content.blocks;
      expect(blks[0].type).toBe("numbered");
      expect(blks[0].text).toBe("");
    });

    it('"[] " converts block to checkbox', () => {
      const blocks = [paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(0, "[] ");
      s.placeCursorInBlock(0, 3);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.commitNoteData).toHaveBeenCalled();
      const blks = s.getNoteData()[s.noteId].content.blocks;
      expect(blks[0].type).toBe("checkbox");
      expect(blks[0].checked).toBe(false);
    });

    it('"[ ] " converts block to checkbox', () => {
      const blocks = [paragraph("")];
      const s = setup(blocks);

      s.setBlockDomText(0, "[ ] ");
      s.placeCursorInBlock(0, 4);

      act(() => {
        s.result.current.handleEditorInput();
      });

      expect(s.commitNoteData).toHaveBeenCalled();
      const blks = s.getNoteData()[s.noteId].content.blocks;
      expect(blks[0].type).toBe("checkbox");
      expect(blks[0].checked).toBe(false);
    });
  });
});
