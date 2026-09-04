/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderFS({ noteData = {}, syncGeneration = { current: 0 } } = {}) {
    const setNoteData = vi.fn();
    const setCustomFolders = vi.fn();
    const onError = vi.fn();
    const result = renderHook(
      ({ data }) => useFileSystem(data, setNoteData, setCustomFolders, syncGeneration, onError),
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

  it("keeps a failed write dirty and retries it automatically", async () => {
    const saved = { id: "n1", title: "Saved", content: { title: "Saved", blocks: [] } };
    const edited = { id: "n1", title: "Edited", content: { title: "Edited", blocks: [] } };
    readAllNotes.mockResolvedValue({ n1: saved });
    writeNote.mockRejectedValueOnce(new Error("disk unavailable")).mockResolvedValueOnce({});
    const { result, rerender, onError } = renderFS({ noteData: { n1: saved } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => rerender({ data: { n1: saved } }));

    vi.useFakeTimers();
    await act(async () => rerender({ data: { n1: edited } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(writeNote).toHaveBeenCalledExactlyOnceWith(edited);
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      "Failed to save note to disk — Boojy will keep retrying",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(writeNote).toHaveBeenCalledTimes(2);
    expect(writeNote).toHaveBeenLastCalledWith(edited);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(writeNote).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
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

describe("useFileSystem — quit-flush safety set", () => {
  const saved = { id: "n1", title: "Saved", content: { title: "Saved", blocks: [] } };
  const edited = { id: "n1", title: "Edited", content: { title: "Edited", blocks: [] } };

  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      onFileChanged: vi.fn(() => () => {}),
      onFileDeleted: vi.fn(() => () => {}),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderEdited() {
    readAllNotes.mockResolvedValue({ n1: saved });
    const unflushedNotes = { current: new Set(["n1"]) };
    const latestNoteDataRef = { current: { n1: edited } };
    const onError = vi.fn();
    // Stable setters: the initial-load effect keys on them, and a fresh mock
    // per render would re-run it and swallow the edit as an external update.
    const setNoteData = vi.fn();
    const setCustomFolders = vi.fn();
    const syncGeneration = { current: 0 };
    const quitSafety = { unflushedNotes, latestNoteDataRef };
    const hook = renderHook(
      ({ data }) =>
        useFileSystem(data, setNoteData, setCustomFolders, syncGeneration, onError, quitSafety),
      { initialProps: { data: { n1: saved } } },
    );
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => hook.rerender({ data: { n1: saved } }));
    vi.useFakeTimers();
    await act(async () => hook.rerender({ data: { n1: edited } }));
    return { ...hook, unflushedNotes, latestNoteDataRef, onError };
  }

  const runDebounce = () => act(async () => vi.advanceTimersByTimeAsync(500));

  it("removes a note from the set once the object written is still the newest", async () => {
    writeNote.mockResolvedValue({});
    const { unflushedNotes } = await renderEdited();

    await runDebounce();

    expect(writeNote).toHaveBeenCalledExactlyOnceWith(edited);
    expect(unflushedNotes.current.has("n1")).toBe(false);
  });

  it("keeps a note in the set when the editor moved on during the write", async () => {
    const { unflushedNotes, latestNoteDataRef } = await renderEdited();
    writeNote.mockImplementation(async () => {
      // A keystroke lands while the write is in flight: the authoritative ref
      // holds a newer object than the one being persisted.
      latestNoteDataRef.current = { n1: { ...edited, title: "Edited more" } };
      return {};
    });

    await runDebounce();

    expect(writeNote).toHaveBeenCalledTimes(1);
    expect(unflushedNotes.current.has("n1")).toBe(true);
  });

  it("keeps a failed write in the set and still retries it", async () => {
    writeNote.mockRejectedValueOnce(new Error("disk unavailable")).mockResolvedValueOnce({});
    const { unflushedNotes } = await renderEdited();

    await runDebounce();
    expect(writeNote).toHaveBeenCalledTimes(1);
    expect(unflushedNotes.current.has("n1")).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(writeNote).toHaveBeenCalledTimes(2);
    expect(unflushedNotes.current.has("n1")).toBe(false);
  });

  it("a quit/blur flush cancels the pending debounced write instead of duplicating it", async () => {
    writeNote.mockResolvedValue({});
    const { result, latestNoteDataRef } = await renderEdited();

    // Quit arrives before the 500ms debounce: flush now, from the ref.
    await act(async () => result.current.flushToDisk(latestNoteDataRef.current, ["n1"]));
    expect(writeNote).toHaveBeenCalledExactlyOnceWith(edited);

    await runDebounce();
    expect(writeNote).toHaveBeenCalledTimes(1);
  });
});

describe("useFileSystem — edited-note reporting for recency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      onFileChanged: vi.fn(() => () => {}),
      onFileDeleted: vi.fn(() => () => {}),
    };
  });

  it("reports notes that became dirty here, but not drafts or the disk load", async () => {
    const saved = { id: "n1", title: "Saved", content: { title: "Saved", blocks: [] } };
    readAllNotes.mockResolvedValue({ n1: saved });
    writeNote.mockResolvedValue({});
    const onNotesEdited = vi.fn();
    const setNoteData = vi.fn();
    const setCustomFolders = vi.fn();
    const syncGeneration = { current: 0 };
    const links = { onNotesEdited };
    const { result, rerender } = renderHook(
      ({ data }) =>
        useFileSystem(data, setNoteData, setCustomFolders, syncGeneration, vi.fn(), links),
      { initialProps: { data: {} } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The disk load and its first render are not edits.
    await act(async () => rerender({ data: { n1: saved } }));
    expect(onNotesEdited).not.toHaveBeenCalled();

    // A brand-new note and an edited one are; a draft is not.
    const fresh = { id: "n2", title: "New", content: { title: "New", blocks: [] } };
    const draft = { id: "d1", title: "", content: { title: "", blocks: [] }, _draft: true };
    const edited = { ...saved, title: "Saved, edited" };
    await act(async () => rerender({ data: { n1: edited, n2: fresh, d1: draft } }));
    expect(onNotesEdited).toHaveBeenCalledExactlyOnceWith(["n1", "n2"]);
  });
});

describe("useFileSystem — the title follows the filename the write produced", () => {
  const saved = {
    id: "n1",
    title: "Meeting notes",
    content: { title: "Meeting notes", blocks: [] },
  };
  const moved = { ...saved, folder: "Work" };

  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      onFileChanged: vi.fn(() => () => {}),
      onFileDeleted: vi.fn(() => () => {}),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderMoved(links) {
    readAllNotes.mockResolvedValue({ n1: saved });
    // Stable setters, as in the quit-flush tests: the initial-load effect keys on them.
    const setNoteData = vi.fn();
    const setCustomFolders = vi.fn();
    const syncGeneration = { current: 0 };
    const hook = renderHook(
      ({ data }) =>
        useFileSystem(data, setNoteData, setCustomFolders, syncGeneration, vi.fn(), links),
      { initialProps: { data: { n1: saved } } },
    );
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => hook.rerender({ data: { n1: saved } }));
    vi.useFakeTimers();
    await act(async () => hook.rerender({ data: { n1: moved } }));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    return hook;
  }

  it("reports a basename that differs from the title written, with the note written", async () => {
    writeNote.mockResolvedValue({
      filePath: "/notes/Work/Meeting notes-2.md",
      title: "Meeting notes-2",
    });
    const onTitleResolved = vi.fn();

    await renderMoved({ onTitleResolved });

    // `toHaveBeenCalledWith`, not exactly-once: a retry timer from an earlier
    // test in this file can still fire a write for its own note here.
    expect(writeNote).toHaveBeenCalledWith(moved);
    expect(onTitleResolved).toHaveBeenCalledExactlyOnceWith("n1", moved, "Meeting notes-2");
  });

  it("stays quiet when the file got the title asked for, or the API predates the answer", async () => {
    const onTitleResolved = vi.fn();
    writeNote.mockResolvedValue({
      filePath: "/notes/Work/Meeting notes.md",
      title: "Meeting notes",
    });
    await renderMoved({ onTitleResolved });
    expect(onTitleResolved).not.toHaveBeenCalled();

    vi.useRealTimers();
    writeNote.mockResolvedValue(undefined);
    await renderMoved({ onTitleResolved });
    expect(onTitleResolved).not.toHaveBeenCalled();
  });
});
