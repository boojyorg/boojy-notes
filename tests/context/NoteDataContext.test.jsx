/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock useHistory to avoid pulling in the full history machinery
vi.mock("../../src/hooks/useHistory", () => ({
  useHistory: () => ({
    canUndo: false,
    canRedo: false,
    undo: vi.fn(),
    redo: vi.fn(),
    commitNoteData: vi.fn(),
    commitTextChange: vi.fn(),
    pushHistory: vi.fn(),
    popHistory: vi.fn(),
    isUndoRedo: { current: false },
    noteDataRef: { current: {} },
    textOnlyEdit: { current: false },
    textOnlyEditForSidebar: { current: false },
    textOnlyEditForEditor: { current: false },
    editedNoteHint: { current: null },
  }),
}));

// Force isNative to false so the provider reads from loadFromStorage
vi.mock("../../src/utils/platform", () => ({
  isNative: false,
  isElectron: false,
  isCapacitor: false,
  isWeb: true,
  platform: "web",
}));

// Shared holder: vi.mock factory closures capture the outer scope at hoist time,
// so mutating this object between tests controls what loadFromStorage returns.
const storageStub = { value: null };

vi.mock("../../src/utils/storage", () => ({
  STORAGE_KEY: "boojy-notes-v1",
  loadFromStorage: () => storageStub.value,
  loadFromIDB: () => Promise.resolve(null),
}));

async function importFresh() {
  vi.resetModules();
  return import("../../src/context/NoteDataContext");
}

describe("NoteDataContext", () => {
  beforeEach(() => {
    storageStub.value = null;
  });

  describe("initialization", () => {
    it("initializes with empty noteData when localStorage is empty", async () => {
      const { NoteDataProvider, useNoteData } = await importFresh();
      const { result } = renderHook(() => useNoteData(), { wrapper: NoteDataProvider });
      expect(result.current.noteData).toEqual({});
    });

    it("loads valid notes from localStorage", async () => {
      const validNote = {
        title: "Test Note",
        content: { blocks: [{ id: "blk-1", type: "p", text: "Hello" }] },
      };
      storageStub.value = { noteData: { "note-1": validNote } };

      const { NoteDataProvider, useNoteData } = await importFresh();
      const { result } = renderHook(() => useNoteData(), { wrapper: NoteDataProvider });
      expect(result.current.noteData).toEqual({ "note-1": validNote });
    });

    it("filters out invalid notes missing content.blocks", async () => {
      const validNote = {
        title: "Valid",
        content: { blocks: [{ id: "blk-1", type: "p", text: "ok" }] },
      };
      const invalidNoBlocks = { title: "No blocks", content: {} };
      const invalidNoContent = { title: "No content" };
      const invalidNull = null;

      storageStub.value = {
        noteData: {
          "note-valid": validNote,
          "note-no-blocks": invalidNoBlocks,
          "note-no-content": invalidNoContent,
          "note-null": invalidNull,
        },
      };

      const { NoteDataProvider, useNoteData } = await importFresh();
      const { result } = renderHook(() => useNoteData(), { wrapper: NoteDataProvider });
      expect(Object.keys(result.current.noteData)).toEqual(["note-valid"]);
      expect(result.current.noteData["note-valid"]).toEqual(validNote);
    });

    it("returns empty object when localStorage noteData is not an object", async () => {
      storageStub.value = { noteData: "string" };

      const { NoteDataProvider, useNoteData } = await importFresh();
      const { result } = renderHook(() => useNoteData(), { wrapper: NoteDataProvider });
      expect(result.current.noteData).toEqual({});
    });
  });

  describe("setNoteData", () => {
    it("updates noteData via actions context", async () => {
      const { NoteDataProvider, useNoteData, useNoteDataActions } = await importFresh();
      const { result } = renderHook(
        () => ({ data: useNoteData(), actions: useNoteDataActions() }),
        { wrapper: NoteDataProvider },
      );
      expect(result.current.data.noteData).toEqual({});

      const newNote = {
        title: "New",
        content: { blocks: [{ id: "blk-1", type: "p", text: "hi" }] },
      };

      act(() => {
        result.current.actions.setNoteData({ "note-new": newNote });
      });

      expect(result.current.data.noteData).toEqual({ "note-new": newNote });
    });
  });

  describe("context separation", () => {
    it("useNoteData returns data with noteData key", async () => {
      const { NoteDataProvider, useNoteData } = await importFresh();
      const { result } = renderHook(() => useNoteData(), { wrapper: NoteDataProvider });
      expect(result.current).toHaveProperty("noteData");
      expect(result.current).not.toHaveProperty("setNoteData");
    });

    it("useNoteDataActions returns actions with setNoteData", async () => {
      const { NoteDataProvider, useNoteDataActions } = await importFresh();
      const { result } = renderHook(() => useNoteDataActions(), {
        wrapper: NoteDataProvider,
      });
      expect(result.current).toHaveProperty("setNoteData");
      expect(result.current).toHaveProperty("commitNoteData");
      expect(result.current).toHaveProperty("undo");
      expect(result.current).toHaveProperty("redo");
      expect(result.current).not.toHaveProperty("noteData");
    });

    it("throws when useNoteData is used outside provider", async () => {
      const { useNoteData } = await importFresh();
      expect(() => {
        renderHook(() => useNoteData());
      }).toThrow("useNoteData must be used within NoteDataProvider");
    });

    it("throws when useNoteDataActions is used outside provider", async () => {
      const { useNoteDataActions } = await importFresh();
      expect(() => {
        renderHook(() => useNoteDataActions());
      }).toThrow("useNoteDataActions must be used within NoteDataProvider");
    });
  });
});
