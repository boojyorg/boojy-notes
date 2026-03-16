/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBlockOperations } from "../../src/hooks/useBlockOperations.js";
import { makeNoteData, paragraph, checkbox as makeCheckbox, resetBlockCounter } from "../mocks/blocks.js";

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
    useBlockOperations({ commitNoteData, commitTextChange, blockRefs, focusBlockId, focusCursorPos }),
  );

  return { result, noteId, getNoteData: () => noteData, commitNoteData, commitTextChange, focusBlockId, focusCursorPos };
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
