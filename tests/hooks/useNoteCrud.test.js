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
      folderOps: opts.folderOps ?? null,
      onError: opts.onError,
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

    it("creates inside a parent, opens the parent, and de-duplicates the name", () => {
      const { result, getFolders, getExpanded } = setup(
        {},
        { customFolders: ["Uni", "Uni/Untitled Folder"], expanded: { Uni: false } },
      );

      act(() => {
        result.current.createFolder("Uni");
      });

      expect(getFolders()).toContain("Uni/Untitled Folder-2");
      expect(getExpanded()).toEqual({ Uni: true, "Uni/Untitled Folder-2": false });
    });

    it("treats a non-string argument (the header button's click event) as the root", () => {
      const { result, getFolders } = setup({}, { customFolders: [] });

      act(() => {
        result.current.createFolder({ type: "click" });
      });

      expect(getFolders()).toEqual(["Untitled Folder"]);
    });
  });

  describe("moveFolder", () => {
    it("moves a folder and everything under it into another folder", () => {
      const n1 = makeNote("n1", "A", "Work");
      const n2 = makeNote("n2", "B", "Work/Sub");
      const { result, getNoteData, getFolders, getExpanded } = setup(
        { n1, n2 },
        { customFolders: ["Work", "Work/Sub", "Archive"], expanded: { Work: true } },
      );

      act(() => {
        result.current.moveFolder("Work", "Archive");
      });

      expect(getNoteData().n1.folder).toBe("Archive/Work");
      expect(getNoteData().n2.folder).toBe("Archive/Work/Sub");
      expect(getFolders()).toEqual(["Archive/Work", "Archive/Work/Sub", "Archive"]);
      expect(getExpanded()).toEqual({ "Archive/Work": true });
    });

    it("moves a nested folder back to the root", () => {
      const n1 = makeNote("n1", "A", "Archive/Work");
      const { result, getNoteData, getFolders } = setup(
        { n1 },
        { customFolders: ["Archive", "Archive/Work"] },
      );

      act(() => {
        result.current.moveFolder("Archive/Work", null);
      });

      expect(getNoteData().n1.folder).toBe("Work");
      expect(getFolders()).toEqual(["Archive", "Work"]);
    });

    it("does nothing for the same parent, itself, or its own subtree", () => {
      const n1 = makeNote("n1", "A", "Work");
      const { result, commitNoteData } = setup(
        { n1 },
        { customFolders: ["Work", "Work/Sub", "Other"] },
      );

      act(() => {
        result.current.moveFolder("Work", null);
        result.current.moveFolder("Work", "Work");
        result.current.moveFolder("Work", "Work/Sub");
      });

      expect(commitNoteData).not.toHaveBeenCalled();
    });
  });

  // Desktop: folders are directories. The hook hands every change to
  // folderOps and adopts the path the disk answers with; it never rewrites
  // the notes itself (that would mark them dirty and rewrite every file).
  describe("with folderOps (desktop)", () => {
    const makeOps = () => ({
      create: vi.fn(async (rel) => `${rel}-2`),
      rename: vi.fn(async (_old, rel) => rel.replace(/:/g, "_")),
      remove: vi.fn(async () => {}),
      reveal: vi.fn(),
    });

    it("renameFolder asks the disk and remaps expanded with the answered path", async () => {
      const folderOps = makeOps();
      const n1 = makeNote("n1", "A", "Work");
      const { result, commitNoteData, getExpanded } = setup(
        { n1 },
        { customFolders: ["Work"], expanded: { Work: true, "Work/Sub": false }, folderOps },
      );

      await act(async () => {
        result.current.renameFolder("Work", "a:b");
      });

      expect(folderOps.rename).toHaveBeenCalledWith("Work", "a:b");
      expect(getExpanded()).toEqual({ a_b: true, "a_b/Sub": false });
      expect(commitNoteData).not.toHaveBeenCalled();
    });

    it("moveFolder is a rename to the new parent", async () => {
      const folderOps = makeOps();
      const { result } = setup({}, { customFolders: ["Work", "Archive"], folderOps });

      await act(async () => {
        result.current.moveFolder("Work", "Archive");
      });

      expect(folderOps.rename).toHaveBeenCalledWith("Work", "Archive/Work");
    });

    it("createFolder makes the directory and reveals the path the disk chose", async () => {
      const folderOps = makeOps();
      const { result, getExpanded, setRenamingFolder } = setup(
        {},
        { customFolders: ["Uni"], expanded: {}, folderOps },
      );

      await act(async () => {
        result.current.createFolder("Uni");
        await new Promise((r) => setTimeout(r, 60));
      });

      expect(folderOps.create).toHaveBeenCalledWith("Uni/Untitled Folder");
      expect(getExpanded()).toEqual({ Uni: true, "Uni/Untitled Folder-2": false });
      expect(setRenamingFolder).toHaveBeenCalledWith("Uni/Untitled Folder-2");
    });

    it("deleteFolder removes the notes from state, then asks the disk to drop the directory", () => {
      const folderOps = makeOps();
      const n1 = makeNote("n1", "A", "Work");
      const n2 = makeNote("n2", "B", null);
      const { result, getNoteData, setCustomFolders } = setup(
        { n1, n2 },
        { activeNote: "n2", customFolders: ["Work"], folderOps },
      );

      act(() => {
        result.current.deleteFolder("Work");
      });

      expect(getNoteData().n1).toBeUndefined();
      expect(getNoteData().n2).toBeDefined();
      expect(folderOps.remove).toHaveBeenCalledWith("Work", { hasNotes: true });
      // The folder list follows the disk's answer inside folderOps, not here.
      expect(setCustomFolders).not.toHaveBeenCalled();
    });

    it("deleteFolder on an empty folder skips the note commit and drops the directory at once", () => {
      const folderOps = makeOps();
      const { result, commitNoteData } = setup({}, { customFolders: ["Empty"], folderOps });

      act(() => {
        result.current.deleteFolder("Empty");
      });

      expect(commitNoteData).not.toHaveBeenCalled();
      expect(folderOps.remove).toHaveBeenCalledWith("Empty", { hasNotes: false });
    });

    it("reports a failed disk operation instead of swallowing it", async () => {
      const folderOps = makeOps();
      folderOps.rename = vi.fn(async () => {
        throw new Error("EACCES");
      });
      const onError = vi.fn();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = setup({}, { customFolders: ["Work"], folderOps, onError });

      await act(async () => {
        result.current.renameFolder("Work", "Renamed");
      });

      expect(onError).toHaveBeenCalledWith("Failed to rename the folder on disk");
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
