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

// Mock getAPI
const mockAPI = {
  trashNote: vi.fn(),
  restoreNote: vi.fn(),
  purgeTrash: vi.fn(),
  emptyTrash: vi.fn(),
  writeMeta: vi.fn(),
};
vi.mock("../../src/services/apiProvider", () => ({
  getAPI: () => mockAPI,
}));

// Mock ID generators for deterministic output
let noteIdCounter = 0;
let blockIdCounter = 0;
vi.mock("../../src/utils/storage", () => ({
  genNoteId: () => `note-${++noteIdCounter}`,
  genBlockId: () => `blk-${++blockIdCounter}`,
}));

// Mock FOLDER_TREE as empty
vi.mock("../../src/constants/data", () => ({
  FOLDER_TREE: [],
}));

beforeEach(() => {
  resetBlockCounter();
  noteIdCounter = 0;
  blockIdCounter = 0;
  vi.restoreAllMocks();
  // Re-stub window.confirm for permanentDelete/emptyTrash tests
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

function setup(initialNoteData = {}, opts = {}) {
  let noteData = { ...initialNoteData };
  const noteDataRef = { current: noteData };
  const commitNoteData = vi.fn((updater) => {
    noteData = updater(noteData);
    noteDataRef.current = noteData;
  });
  const tabs = opts.tabs || Object.keys(initialNoteData);
  let currentTabs = [...tabs];
  const setTabs = vi.fn((updater) => {
    currentTabs = typeof updater === "function" ? updater(currentTabs) : updater;
  });
  let currentActive = opts.activeNote || tabs[0] || null;
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
  const trashedNotesRef = { current: new Map() };
  let currentTrashedNotes = {};
  const setTrashedNotes = vi.fn((updater) => {
    currentTrashedNotes = typeof updater === "function" ? updater(currentTrashedNotes) : updater;
  });
  const setRenamingFolder = vi.fn();
  let currentSidebarOrder = opts.sidebarOrder || {};
  const setSidebarOrder = vi.fn((updater) => {
    currentSidebarOrder = typeof updater === "function" ? updater(currentSidebarOrder) : updater;
  });
  const onError = vi.fn();

  const { result } = renderHook(() =>
    useNoteCrud({
      commitNoteData,
      noteDataRef,
      setTabs,
      setActiveNote,
      activeNote: currentActive,
      setCustomFolders,
      customFolders: currentFolders,
      setExpanded,
      titleRef,
      trashedNotesRef,
      setTrashedNotes,
      setRenamingFolder,
      setSidebarOrder,
      onError,
    }),
  );

  return {
    result,
    getNoteData: () => noteData,
    getTabs: () => currentTabs,
    getActive: () => currentActive,
    getFolders: () => currentFolders,
    getExpanded: () => currentExpanded,
    getTrashedNotes: () => currentTrashedNotes,
    getSidebarOrder: () => currentSidebarOrder,
    commitNoteData,
    setTabs,
    setActiveNote,
    setCustomFolders,
    setExpanded,
    setTrashedNotes,
    setRenamingFolder,
    setSidebarOrder,
    trashedNotesRef,
    onError,
  };
}

describe("useNoteCrud", () => {
  describe("createNote", () => {
    it("creates a note with ID, title, first block, adds to tabs, and sets active", () => {
      const { result, getNoteData, getTabs, setActiveNote } = setup();

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
      expect(getTabs()).toContain(noteId);
      expect(setActiveNote).toHaveBeenCalledWith(noteId);
    });

    it("creates a note with folder and sets folder and path correctly", () => {
      const { result, getNoteData } = setup();

      act(() => {
        result.current.createNote("Projects/Work", "My Note");
      });

      const data = getNoteData();
      const noteId = "note-1";
      expect(data[noteId].folder).toBe("Projects/Work");
      expect(data[noteId].path).toEqual(["Projects", "Work", "My Note"]);
      expect(data[noteId].title).toBe("My Note");
    });
  });

  describe("deleteNote", () => {
    it("removes note from noteData and tabs", () => {
      const note = makeNote("n1", "Test", null);
      const { result, getNoteData, getTabs } = setup(
        { n1: note },
        { tabs: ["n1"], activeNote: "n1" },
      );

      act(() => {
        result.current.deleteNote("n1");
      });

      expect(getNoteData()["n1"]).toBeUndefined();
      expect(getTabs()).not.toContain("n1");
    });

    it("calls trashedNotesRef.set when native and trashNote API exists", async () => {
      // Temporarily enable isNative
      const platform = await import("../../src/utils/platform");
      const original = platform.isNative;
      platform.isNative = true;

      const note = makeNote("n1", "Trashed Note", "Docs");
      const { result, trashedNotesRef } = setup({ n1: note }, { tabs: ["n1"], activeNote: "n1" });

      act(() => {
        result.current.deleteNote("n1");
      });

      expect(trashedNotesRef.current.get("n1")).toEqual({ title: "Trashed Note", folder: "Docs" });

      platform.isNative = original;
    });
  });

  describe("duplicateNote", () => {
    it("creates copy with '(copy)' title and new block IDs", () => {
      const note = makeNote("n1", "Original");
      const { result, getNoteData, getTabs, setActiveNote } = setup({ n1: note }, { tabs: ["n1"] });

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
      expect(getTabs()).toContain(dupId);
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
    it("deletes all notes in folder and updates tabs", () => {
      const n1 = makeNote("n1", "Note A", "Archive");
      const n2 = makeNote("n2", "Note B", "Archive");
      const n3 = makeNote("n3", "Note C", null);
      const { result, getNoteData, getTabs, getFolders } = setup(
        { n1, n2, n3 },
        { tabs: ["n1", "n2", "n3"], activeNote: "n1", customFolders: ["Archive"] },
      );

      act(() => {
        result.current.deleteFolder("Archive");
      });

      const data = getNoteData();
      expect(data.n1).toBeUndefined();
      expect(data.n2).toBeUndefined();
      expect(data.n3).toBeDefined();
      expect(getTabs()).not.toContain("n1");
      expect(getTabs()).not.toContain("n2");
      expect(getTabs()).toContain("n3");
      expect(getFolders()).not.toContain("Archive");
    });
  });

  describe("restoreNote", () => {
    it("restores a note from trash via API", async () => {
      const platform = await import("../../src/utils/platform");
      const original = platform.isNative;
      platform.isNative = true;

      const restoredNote = {
        id: "n1",
        title: "Restored",
        folder: "Docs",
        content: { title: "Restored", blocks: [] },
        _filePath: "/tmp/n1",
        _migrated: true,
      };
      mockAPI.restoreNote.mockResolvedValue(restoredNote);

      const { result, getNoteData, getTrashedNotes } = setup({}, { customFolders: [] });

      await act(async () => {
        await result.current.restoreNote("n1");
      });

      const data = getNoteData();
      expect(data.n1).toBeDefined();
      expect(data.n1.title).toBe("Restored");
      // _filePath and _migrated should be stripped
      expect(data.n1._filePath).toBeUndefined();
      expect(data.n1._migrated).toBeUndefined();

      platform.isNative = original;
    });
  });

  describe("permanentDeleteNote", () => {
    it("calls purgeTrash and removes from trashed notes", async () => {
      const platform = await import("../../src/utils/platform");
      const original = platform.isNative;
      platform.isNative = true;

      mockAPI.purgeTrash.mockResolvedValue(undefined);

      const { result, getTrashedNotes, setTrashedNotes } = setup();

      await act(async () => {
        await result.current.permanentDeleteNote("n1");
      });

      expect(window.confirm).toHaveBeenCalled();
      expect(mockAPI.purgeTrash).toHaveBeenCalledWith(["n1"]);
      expect(setTrashedNotes).toHaveBeenCalled();

      platform.isNative = original;
    });
  });

  describe("emptyAllTrash", () => {
    it("clears all trashed notes via API", async () => {
      const platform = await import("../../src/utils/platform");
      const original = platform.isNative;
      platform.isNative = true;

      mockAPI.emptyTrash.mockResolvedValue(undefined);

      const { result, setTrashedNotes } = setup();

      await act(async () => {
        await result.current.emptyAllTrash();
      });

      expect(window.confirm).toHaveBeenCalled();
      expect(mockAPI.emptyTrash).toHaveBeenCalled();
      expect(setTrashedNotes).toHaveBeenCalledWith({});

      platform.isNative = original;
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
    it("creates a _draft note without adding a tab", () => {
      const { result, getNoteData, getTabs, setTabs, setActiveNote } = setup();

      let draftId;
      act(() => {
        draftId = result.current.createDraftNote();
      });

      const data = getNoteData();
      expect(data[draftId]).toBeDefined();
      expect(data[draftId]._draft).toBe(true);
      expect(data[draftId].title).toBe("");
      expect(setTabs).not.toHaveBeenCalled();
      expect(setActiveNote).toHaveBeenCalledWith(draftId);
    });
  });

  describe("promoteDraft", () => {
    it("removes _draft flag and adds tab", () => {
      const draftNote = { ...makeNote("d1", ""), _draft: true };
      const { result, getNoteData, getTabs } = setup({ d1: draftNote }, { tabs: [] });

      act(() => {
        result.current.promoteDraft("d1");
      });

      const data = getNoteData();
      expect(data.d1._draft).toBeUndefined();
      expect(getTabs()).toContain("d1");
    });
  });

  describe("discardDraft", () => {
    it("removes draft note from noteData", () => {
      const draftNote = { ...makeNote("d1", "Draft"), _draft: true };
      const { result, getNoteData } = setup({ d1: draftNote }, { tabs: [] });

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
