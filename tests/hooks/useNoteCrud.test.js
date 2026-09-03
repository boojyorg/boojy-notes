/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNoteCrud } from "../../src/hooks/useNoteCrud.js";
import { makeNote, resetBlockCounter } from "../mocks/blocks.js";

// Mock platform — default to non-native
vi.mock("../../src/utils/platform", () => ({
  isNative: false,
}));

// Mock ID generators for deterministic output
let noteIdCounter = 0;
let blockIdCounter = 0;
vi.mock("../../src/utils/storage", () => ({
  genNoteId: () => `note-${++noteIdCounter}`,
  genBlockId: () => `blk-${++blockIdCounter}`,
}));

beforeEach(() => {
  resetBlockCounter();
  noteIdCounter = 0;
  blockIdCounter = 0;
  vi.restoreAllMocks();
});

function setup(initialNoteData = {}, opts = {}) {
  let noteData = { ...initialNoteData };
  const noteDataRef = { current: noteData };
  const commitNoteData = vi.fn((updater) => {
    noteData = updater(noteData);
    noteDataRef.current = noteData;
  });
  let currentActive = opts.activeNote || Object.keys(initialNoteData)[0] || null;
  const setActiveNote = vi.fn((id) => {
    currentActive = id;
  });
  const customFolders = opts.customFolders || [];
  let currentFolders = [...customFolders];
  const setCustomFolders = vi.fn((updater) => {
    currentFolders = typeof updater === "function" ? updater(currentFolders) : updater;
  });
  let currentExpanded = opts.expanded || {};
  const setExpanded = vi.fn((updater) => {
    currentExpanded = typeof updater === "function" ? updater(currentExpanded) : updater;
  });
  const titleRef = { current: null };
  const setRenamingFolder = vi.fn();
  const markOpened = vi.fn();
  const { result } = renderHook(() =>
    useNoteCrud({
      commitNoteData,
      noteDataRef,
      setActiveNote,
      activeNote: currentActive,
      setCustomFolders,
      customFolders: currentFolders,
      setExpanded,
      titleRef,
      setRenamingFolder,
      markOpened,
    }),
  );

  return {
    result,
    getNoteData: () => noteData,
    getActive: () => currentActive,
    getFolders: () => currentFolders,
    getExpanded: () => currentExpanded,
    getSidebarOrder: () => currentSidebarOrder,
    commitNoteData,
    setActiveNote,
    setCustomFolders,
    setExpanded,
    setRenamingFolder,
    markOpened,
  };
}

describe("useNoteCrud", () => {
  describe("createNote", () => {
    it("creates a note with ID, title, first block, and sets it active", () => {
      const { result, getNoteData, setActiveNote } = setup();

      act(() => {
        result.current.createNote();
      });

      const data = getNoteData();
      const noteId = "note-1";
      expect(data[noteId]).toBeDefined();
      expect(data[noteId].title).toBe("Untitled");
      expect(data[noteId].content.blocks).toHaveLength(1);
      expect(data[noteId].content.blocks[0].id).toBe("blk-1");
      expect(data[noteId].content.blocks[0].type).toBe("p");
      expect(setActiveNote).toHaveBeenCalledWith(noteId);
    });

    // Found live: without this, a note you just made carries no timestamp and
    // sorts into the never-opened alphabetical tail — a new "Zebra" appears at
    // the bottom of "Most recent" instead of the top.
    it("stamps recency, so a new note leads the Most recent list", () => {
      const { result, markOpened } = setup();
      act(() => {
        result.current.createNote();
      });
      expect(markOpened).toHaveBeenCalledWith("note-1");
    });

    it("creates a note inside the given folder", () => {
      const { result, getNoteData } = setup();

      act(() => {
        result.current.createNote("Projects/Work", "My Note");
      });

      const data = getNoteData();
      const noteId = "note-1";
      expect(data[noteId].folder).toBe("Projects/Work");
      expect(data[noteId].title).toBe("My Note");
    });
  });

  describe("deleteNote", () => {
    it("removes the note and clears activeNote when it was open", () => {
      const note = makeNote("n1", "Test", null);
      const { result, getNoteData, setActiveNote } = setup({ n1: note }, { activeNote: "n1" });

      act(() => {
        result.current.deleteNote("n1");
      });

      expect(getNoteData()["n1"]).toBeUndefined();
      expect(setActiveNote).toHaveBeenCalledWith(null);
    });

    it("leaves activeNote alone when deleting a different note", () => {
      const n1 = makeNote("n1", "Open", null);
      const n2 = makeNote("n2", "Other", null);
      const { result, getNoteData, setActiveNote } = setup({ n1, n2 }, { activeNote: "n1" });

      act(() => {
        result.current.deleteNote("n2");
      });

      expect(getNoteData()["n2"]).toBeUndefined();
      expect(setActiveNote).not.toHaveBeenCalled();
    });
  });

  describe("duplicateNote", () => {
    it("creates copy with '(copy)' title and new block IDs", () => {
      const note = makeNote("n1", "Original");
      const { result, getNoteData, setActiveNote } = setup({ n1: note });

      act(() => {
        result.current.duplicateNote("n1");
      });

      const data = getNoteData();
      const dupId = "note-1";
      expect(data[dupId]).toBeDefined();
      expect(data[dupId].title).toBe("Original (copy)");
      expect(data[dupId].content.title).toBe("Original (copy)");
      // Block IDs should differ from original
      const origBlockIds = note.content.blocks.map((b) => b.id);
      const dupBlockIds = data[dupId].content.blocks.map((b) => b.id);
      expect(dupBlockIds).not.toEqual(origBlockIds);
      expect(setActiveNote).toHaveBeenCalledWith(dupId);
    });
  });

  describe("renameFolder", () => {
    it("updates all notes in folder and updates expanded state", () => {
      const n1 = makeNote("n1", "Note A", "MyFolder");
      const n2 = makeNote("n2", "Note B", "MyFolder");
      const n3 = makeNote("n3", "Note C", "Other");
      const { result, getNoteData, getExpanded } = setup(
        { n1, n2, n3 },
        {
          customFolders: ["MyFolder", "Other"],
          expanded: { MyFolder: true, Other: false },
        },
      );

      act(() => {
        result.current.renameFolder("MyFolder", "Renamed");
      });

      const data = getNoteData();
      expect(data.n1.folder).toBe("Renamed");
      expect(data.n2.folder).toBe("Renamed");
      expect(data.n3.folder).toBe("Other");
      expect(getExpanded()).toEqual({ Renamed: true, Other: false });
    });
  });

  describe("deleteFolder", () => {
    it("deletes all notes in folder and clears activeNote when it was inside", () => {
      const n1 = makeNote("n1", "Note A", "Archive");
      const n2 = makeNote("n2", "Note B", "Archive");
      const n3 = makeNote("n3", "Note C", null);
      const { result, getNoteData, getFolders, setActiveNote } = setup(
        { n1, n2, n3 },
        { activeNote: "n1", customFolders: ["Archive"] },
      );

      act(() => {
        result.current.deleteFolder("Archive");
      });

      const data = getNoteData();
      expect(data.n1).toBeUndefined();
      expect(data.n2).toBeUndefined();
      expect(data.n3).toBeDefined();
      expect(setActiveNote).toHaveBeenCalledWith(null);
      expect(getFolders()).not.toContain("Archive");
    });
  });

  describe("createFolder", () => {
    it("adds to customFolders and triggers renaming", () => {
      const { result, getFolders, setRenamingFolder, setExpanded } = setup(
        {},
        { customFolders: [] },
      );

      act(() => {
        result.current.createFolder();
      });

      expect(getFolders()).toContain("Untitled Folder");
      expect(setExpanded).toHaveBeenCalled();
    });
  });

  describe("createDraftNote", () => {
    it("creates a _draft note and sets it active", () => {
      const { result, getNoteData, setActiveNote } = setup();

      let draftId;
      act(() => {
        draftId = result.current.createDraftNote();
      });

      const data = getNoteData();
      expect(data[draftId]).toBeDefined();
      expect(data[draftId]._draft).toBe(true);
      expect(data[draftId].title).toBe("");
      expect(setActiveNote).toHaveBeenCalledWith(draftId);
    });
  });

  describe("promoteDraft", () => {
    it("removes the _draft flag", () => {
      const draftNote = { ...makeNote("d1", ""), _draft: true };
      const { result, getNoteData } = setup({ d1: draftNote });

      act(() => {
        result.current.promoteDraft("d1");
      });

      const data = getNoteData();
      expect(data.d1._draft).toBeUndefined();
    });
  });

  describe("discardDraft", () => {
    it("removes draft note from noteData", () => {
      const draftNote = { ...makeNote("d1", "Draft"), _draft: true };
      const { result, getNoteData } = setup({ d1: draftNote });

      act(() => {
        result.current.discardDraft("d1");
      });

      expect(getNoteData()["d1"]).toBeUndefined();
    });

    it("does nothing for non-draft notes", () => {
      const note = makeNote("n1", "Regular");
      const { result, getNoteData } = setup({ n1: note });

      act(() => {
        result.current.discardDraft("n1");
      });

      expect(getNoteData()["n1"]).toBeDefined();
    });
  });
});
