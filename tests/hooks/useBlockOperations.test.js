/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBlockOperations } from "../../src/hooks/useBlockOperations.js";
import {
  makeNoteData,
  paragraph,
  bullet,
  checkbox as makeCheckbox,
  codeBlock,
  resetBlockCounter,
} from "../mocks/blocks.js";

beforeEach(() => {
  resetBlockCounter();
});

function setup(initialBlocks) {
  const noteId = "note-1";
  let noteData = makeNoteData(noteId, initialBlocks);
  const commitNoteData = vi.fn((updater) => {
    noteData = updater(noteData);
  });
  const commitTextChange = vi.fn((updater) => {
    noteData = updater(noteData);
  });
  const blockRefs = { current: {} };
  const focusBlockId = { current: null };
  const focusCursorPos = { current: null };

  const { result } = renderHook(() =>
    useBlockOperations({
      commitNoteData,
      commitTextChange,
      blockRefs,
      focusBlockId,
      focusCursorPos,
    }),
  );

  return {
    result,
    noteId,
    getNoteData: () => noteData,
    commitNoteData,
    commitTextChange,
    blockRefs,
    focusBlockId,
    focusCursorPos,
  };
}

/** Mount `text` as the block's element and put a collapsed caret at `offset` in it. */
function mountWithCaret(blockRefs, blockId, text, offset) {
  const el = document.createElement("div");
  el.textContent = text;
  document.body.appendChild(el);
  blockRefs.current[blockId] = el;
  const range = document.createRange();
  range.setStart(el.firstChild, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return el;
}

describe("useBlockOperations", () => {
  describe("updateBlockText", () => {
    it("updates the correct block text", () => {
      const blocks = [paragraph("hello"), paragraph("world")];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.updateBlockText(noteId, 1, "changed");
      });

      expect(getNoteData()[noteId].content.blocks[1].text).toBe("changed");
      expect(getNoteData()[noteId].content.blocks[0].text).toBe("hello");
    });
  });

  describe("insertBlockAfter", () => {
    it("adds a new block at the correct index", () => {
      const blocks = [paragraph("first"), paragraph("second")];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.insertBlockAfter(noteId, 0, "p", "inserted");
      });

      const blks = getNoteData()[noteId].content.blocks;
      expect(blks).toHaveLength(3);
      expect(blks[1].text).toBe("inserted");
      expect(blks[1].type).toBe("p");
    });

    it("sets checked:false for checkbox type", () => {
      const blocks = [paragraph("first")];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.insertBlockAfter(noteId, 0, "checkbox", "task");
      });

      const blks = getNoteData()[noteId].content.blocks;
      expect(blks[1].type).toBe("checkbox");
      expect(blks[1].checked).toBe(false);
    });
  });

  describe("deleteBlock", () => {
    it("removes the correct block", () => {
      const blocks = [paragraph("a"), paragraph("b"), paragraph("c")];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.deleteBlock(noteId, 1);
      });

      const blks = getNoteData()[noteId].content.blocks;
      expect(blks).toHaveLength(2);
      expect(blks[0].text).toBe("a");
      expect(blks[1].text).toBe("c");
    });
  });

  describe("updateBlockProperty", () => {
    it("merges properties correctly", () => {
      const blocks = [paragraph("hello")];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.updateBlockProperty(noteId, 0, { lang: "js", custom: true });
      });

      const block = getNoteData()[noteId].content.blocks[0];
      expect(block.lang).toBe("js");
      expect(block.custom).toBe(true);
      expect(block.text).toBe("hello");
    });
  });

  describe("moveBlock", () => {
    it("moves a block up", () => {
      const blocks = [paragraph("a"), paragraph("b"), paragraph("c")];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.moveBlock(noteId, 2, 1);
      });

      const blks = getNoteData()[noteId].content.blocks;
      expect(blks.map((b) => b.text)).toEqual(["a", "c", "b"]);
    });

    it("moves a block down", () => {
      const blocks = [paragraph("a"), paragraph("b"), paragraph("c")];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.moveBlock(noteId, 0, 1);
      });

      const blks = getNoteData()[noteId].content.blocks;
      expect(blks.map((b) => b.text)).toEqual(["b", "a", "c"]);
    });

    it("focuses the moved block (caret follows)", () => {
      const blocks = [paragraph("a"), paragraph("b"), paragraph("c")];
      const { result, noteId, getNoteData, focusBlockId } = setup(blocks);
      const movedId = getNoteData()[noteId].content.blocks[2].id;

      act(() => {
        result.current.moveBlock(noteId, 2, 0);
      });

      expect(focusBlockId.current).toBe(movedId);
      expect(getNoteData()[noteId].content.blocks[0].id).toBe(movedId);
    });

    it("is a no-op for out-of-range or equal indices", () => {
      const blocks = [paragraph("a"), paragraph("b")];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.moveBlock(noteId, 0, 0); // same
        result.current.moveBlock(noteId, 0, 5); // out of range
        result.current.moveBlock(noteId, -1, 1); // out of range
      });

      expect(getNoteData()[noteId].content.blocks.map((b) => b.text)).toEqual(["a", "b"]);
    });
  });

  /**
   * Tab and Shift+Tab re-indent a list item. The caret was sent to offset 0
   * afterwards (the focus effect's default), so the next characters landed in
   * front of the text (review 2026-09-06, H2). Re-indenting changes the box,
   * not the text: the caret stays on its character.
   */
  describe("updateBlockIndent", () => {
    afterEach(() => {
      document.body.innerHTML = "";
      window.getSelection().removeAllRanges();
    });

    it("keeps the caret at its offset through an indent and an outdent", () => {
      const blocks = [bullet("item one"), bullet("item two")];
      const { result, noteId, getNoteData, blockRefs, focusBlockId, focusCursorPos } =
        setup(blocks);
      mountWithCaret(blockRefs, blocks[1].id, "item two", 5);

      act(() => {
        result.current.updateBlockIndent(noteId, 1, 1);
      });
      expect(getNoteData()[noteId].content.blocks[1].indent).toBe(1);
      expect(focusBlockId.current).toBe(blocks[1].id);
      expect(focusCursorPos.current).toBe(5);

      // The caret is still where it was; the outdent reads it again.
      focusBlockId.current = null;
      focusCursorPos.current = null;
      act(() => {
        result.current.updateBlockIndent(noteId, 1, -1);
      });
      expect(getNoteData()[noteId].content.blocks[1].indent).toBe(0);
      expect(focusCursorPos.current).toBe(5);
    });

    it("keeps a caret at the very end at the end", () => {
      const blocks = [bullet("item two")];
      const { result, noteId, blockRefs, focusCursorPos } = setup(blocks);
      mountWithCaret(blockRefs, blocks[0].id, "item two", "item two".length);
      act(() => {
        result.current.updateBlockIndent(noteId, 0, 1);
      });
      expect(focusCursorPos.current).toBe("item two".length);
    });

    it("leaves the caret position to its caller when the caret is not in the block", () => {
      const blocks = [bullet("item two")];
      const { result, noteId, focusBlockId, focusCursorPos } = setup(blocks);
      window.getSelection().removeAllRanges();
      act(() => {
        result.current.updateBlockIndent(noteId, 0, 1);
      });
      expect(focusBlockId.current).toBe(blocks[0].id);
      expect(focusCursorPos.current).toBeNull();
    });

    it("clamps the indent to 0..6 and clears a preserved raw indent prefix", () => {
      const blocks = [{ ...bullet("deep"), indent: 6, indentStr: "\t\t\t\t\t\t" }];
      const { result, noteId, getNoteData } = setup(blocks);
      act(() => {
        result.current.updateBlockIndent(noteId, 0, 1);
      });
      const block = getNoteData()[noteId].content.blocks[0];
      expect(block.indent).toBe(6);
      expect(block.indentStr).toBeUndefined();
    });
  });

  describe("flipCheck", () => {
    it("toggles checkbox state", () => {
      const blocks = [makeCheckbox("task", false)];
      const { result, noteId, getNoteData } = setup(blocks);

      act(() => {
        result.current.flipCheck(noteId, 0);
      });

      expect(getNoteData()[noteId].content.blocks[0].checked).toBe(true);

      act(() => {
        result.current.flipCheck(noteId, 0);
      });

      expect(getNoteData()[noteId].content.blocks[0].checked).toBe(false);
    });
  });

  // A special block's field (a table cell, a callout's title or body, a code
  // block's textarea) is typed into at the text grain, like a paragraph:
  // through commitTextChange, so the keystroke ref runs ahead of state and
  // undo coalesces a burst. A structural operation on the block is a
  // function of the block as the ref holds it, so a cell edit pending in
  // the ref is inside the rows the operation reshapes (review 2026-09-07,
  // §1.4 and §3.4).
  describe("special-block fields", () => {
    const table = () => ({
      id: "tbl",
      type: "table",
      rows: [
        ["A", "B"],
        ["1", "2"],
      ],
      alignments: ["left", "left"],
      text: "",
    });

    it("updateTableCell writes one cell at the text grain", () => {
      const { result, noteId, getNoteData, commitTextChange, commitNoteData } = setup([table()]);
      act(() => {
        result.current.updateTableCell(noteId, 0, 1, 0, "typed");
      });
      expect(getNoteData()[noteId].content.blocks[0].rows).toEqual([
        ["A", "B"],
        ["typed", "2"],
      ]);
      expect(commitTextChange).toHaveBeenCalledTimes(1);
      expect(commitNoteData).not.toHaveBeenCalled();
    });

    it("updateTableRows reshapes the rows the ref holds, a pending cell edit included", () => {
      const { result, noteId, getNoteData, commitNoteData } = setup([table()]);
      act(() => {
        result.current.updateTableCell(noteId, 0, 1, 0, "typed");
        // Insert a row above row 1, computed from whatever the rows are now.
        result.current.updateTableRows(noteId, 0, (rows, alignments) => ({
          rows: [rows[0], ["", ""], ...rows.slice(1)],
          alignments,
        }));
      });
      expect(getNoteData()[noteId].content.blocks[0].rows).toEqual([
        ["A", "B"],
        ["", ""],
        ["typed", "2"],
      ]);
      expect(commitNoteData).toHaveBeenCalledTimes(1);
    });

    it("updateTableRows leaves the alignments alone when the updater returns none", () => {
      const { result, noteId, getNoteData } = setup([table()]);
      act(() => {
        result.current.updateTableRows(noteId, 0, (rows) => ({ rows: rows.slice(0, 1) }));
      });
      const block = getNoteData()[noteId].content.blocks[0];
      expect(block.rows).toEqual([["A", "B"]]);
      expect(block.alignments).toEqual(["left", "left"]);
    });

    it("updateCalloutTitle writes the title at the text grain", () => {
      const callout = { id: "c", type: "callout", calloutType: "note", title: "Note", text: "b" };
      const { result, noteId, getNoteData, commitTextChange, commitNoteData } = setup([callout]);
      act(() => {
        result.current.updateCalloutTitle(noteId, 0, "Renamed");
      });
      expect(getNoteData()[noteId].content.blocks[0]).toMatchObject({
        title: "Renamed",
        text: "b",
      });
      expect(commitTextChange).toHaveBeenCalledTimes(1);
      expect(commitNoteData).not.toHaveBeenCalled();
    });

    it("updateBlockText serves a code block's textarea and a callout's body alike", () => {
      const { result, noteId, getNoteData, commitTextChange } = setup([
        codeBlock("a", "js"),
        { id: "c", type: "callout", calloutType: "note", title: "Note", text: "b" },
      ]);
      act(() => {
        result.current.updateBlockText(noteId, 0, "a\n");
        result.current.updateBlockText(noteId, 1, "**b**");
      });
      const blocks = getNoteData()[noteId].content.blocks;
      expect(blocks[0]).toMatchObject({ type: "code", text: "a\n", lang: "js" });
      expect(blocks[1]).toMatchObject({ type: "callout", text: "**b**" });
      expect(commitTextChange).toHaveBeenCalledTimes(2);
    });
  });
});
