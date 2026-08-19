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
    const result = renderHook(
      ({ data }) =>
        useFileSystem(data, setNoteData, setCustomFolders, syncGeneration, vi.fn(), vi.fn()),
      { initialProps: { data: noteData } },
    );
    return { ...result, setNoteData, setCustomFolders, syncGeneration };
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
