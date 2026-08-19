/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/platform", () => ({
  isElectron: true,
  isWeb: false,
  isNative: true,
}));

const readAllNotes = vi.fn();
const trashNote = vi.fn();
const writeNote = vi.fn();
vi.mock("../../src/services/apiProvider", () => ({
  getAPI: () => ({
    getNotesDir: vi.fn(async () => "/notes"),
    readAllNotes,
    trashNote,
    writeNote,
  }),
}));

import { useFileSystem } from "../../src/hooks/useFileSystem";

describe("useFileSystem — initial load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      onFileChanged: vi.fn(() => () => {}),
      onFileDeleted: vi.fn(() => () => {}),
    };
  });

  function renderFS({ noteData = {}, syncGeneration = { current: 0 } } = {}) {
    const setNoteData = vi.fn();
    const setCustomFolders = vi.fn();
    const onError = vi.fn();
    const result = renderHook(
      ({ data }) =>
        useFileSystem(data, setNoteData, setCustomFolders, syncGeneration, vi.fn(), onError),
      { initialProps: { data: noteData } },
    );
    return { ...result, setNoteData, setCustomFolders, syncGeneration, onError };
  }

  it("bumps syncGeneration when disk notes arrive, so restored notes re-sync their DOM", async () => {
    // The restored session shows its last-open note before this async load
    // lands; without the bump, the title-sync layout effects (keyed on
    // [activeNote, syncGeneration.current]) never re-run and the title
    // renders blank until the user switches notes.
    readAllNotes.mockResolvedValue({
      n1: { id: "n1", title: "Hello", content: { title: "Hello", blocks: [] } },
    });
    const { setNoteData, syncGeneration } = renderFS();

    await waitFor(() => expect(setNoteData).toHaveBeenCalled());

    expect(setNoteData).toHaveBeenCalledWith({
      n1: { id: "n1", title: "Hello", content: { title: "Hello", blocks: [] } },
    });
    expect(syncGeneration.current).toBe(1);
  });

  it("does not bump syncGeneration when the disk is empty", async () => {
    readAllNotes.mockResolvedValue({});
    const { result, syncGeneration } = renderFS();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(syncGeneration.current).toBe(0);
  });

  it("routes a removed persisted note through the system Trash API", async () => {
    const note = {
      id: "n1",
      title: "A note",
      content: { title: "A note", blocks: [] },
    };
    readAllNotes.mockResolvedValue({});
    trashNote.mockResolvedValue({ trashed: true });
    const { result, rerender } = renderFS({ noteData: { n1: note } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => rerender({ data: {} }));
    await act(async () => result.current.flushToDisk());

    expect(trashNote).toHaveBeenCalledExactlyOnceWith("n1");
  });

  it("treats deleting a never-persisted note as a silent no-op, not a Trash failure", async () => {
    const note = { id: "n1", title: "Ephemeral", content: { title: "Ephemeral", blocks: [] } };
    readAllNotes.mockResolvedValue({});
    trashNote.mockResolvedValue({ trashed: false, missing: true });
    const { result, rerender, onError } = renderFS({ noteData: { n1: note } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => rerender({ data: {} }));
    await act(async () => result.current.flushToDisk());

    expect(trashNote).toHaveBeenCalledExactlyOnceWith("n1");
    expect(onError).not.toHaveBeenCalled();
  });

  it("still surfaces a real Trash failure", async () => {
    const note = { id: "n1", title: "A note", content: { title: "A note", blocks: [] } };
    readAllNotes.mockResolvedValue({});
    trashNote.mockResolvedValue({ trashed: false });
    const { result, rerender, onError } = renderFS({ noteData: { n1: note } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => rerender({ data: {} }));
    await act(async () => result.current.flushToDisk());

    expect(onError).toHaveBeenCalledWith(
      "Failed to move note to the system Trash — the file was left on disk",
    );
  });

  it("keeps an unflushed dirty note when a file-deleted event rebuilds state from disk", async () => {
    // The delete-triggered rebuild replaces state with disk content; a note
    // edited within the write-debounce window exists only in memory and must
    // survive, or a slow OS-trash move could silently discard it.
    const saved = { id: "n1", title: "Saved", content: { title: "Saved", blocks: [] } };
    const edited = { id: "n2", title: "Edited", content: { title: "Edited", blocks: [] } };
    readAllNotes.mockResolvedValue({ n1: saved });
    let fileDeletedHandler;
    window.electronAPI.onFileDeleted = vi.fn((handler) => {
      fileDeletedHandler = handler;
      return () => {};
    });
    // The delete handler reads disk via window.electronAPI, not the api provider.
    window.electronAPI.readAllNotes = vi.fn(async () => ({ n1: saved }));
    const { result, rerender, setNoteData } = renderFS({ noteData: { n1: saved } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // First rerender consumes the initial load's external-update flag (the
    // mocked setNoteData never re-renders with disk data on its own)…
    await act(async () => rerender({ data: { n1: saved } }));
    // …then editing n2 marks it dirty; its debounced write has not fired yet.
    await act(async () => rerender({ data: { n1: saved, n2: edited } }));

    setNoteData.mockClear();
    await act(async () => {
      fileDeletedHandler({ filePath: "/notes/Other.md" });
    });
    await waitFor(() => expect(setNoteData).toHaveBeenCalled());

    const updater = setNoteData.mock.calls[0][0];
    const rebuilt = updater({ n1: saved, n2: edited });
    expect(rebuilt.n2).toBe(edited);
    expect(rebuilt.n1).toBe(saved);
  });

  it("does not send an unsaved draft to the system Trash", async () => {
    const draft = {
      id: "draft-1",
      title: "",
      content: { title: "", blocks: [] },
      _draft: true,
    };
    readAllNotes.mockResolvedValue({});
    const { result, rerender } = renderFS({ noteData: { "draft-1": draft } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => rerender({ data: {} }));
    await act(async () => result.current.flushToDisk());

    expect(trashNote).not.toHaveBeenCalled();
  });
});
