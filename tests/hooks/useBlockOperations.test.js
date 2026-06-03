/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBlockOperations } from "../../src/hooks/useBlockOperations.js";
import {
  makeNoteData,
  paragraph,
  checkbox as makeCheckbox,
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
    focusBlockId,
    focusCursorPos,
  };
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
});
