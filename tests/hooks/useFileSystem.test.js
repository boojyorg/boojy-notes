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

import { conflictCopyTitle, persistedEquals, useFileSystem } from "../../src/hooks/useFileSystem";

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

// ─── Outside edits are never silently overwritten ────────────────────────────
// Policy (2026-09-06): a change made outside the app to a note that is not
// being edited wins at once; so does one to the open note when nothing is
// pending; one to the open note while edits are pending keeps both versions.
describe("persistedEquals: two versions are the same when they write the same file", () => {
  const note = (blocks, extra = {}) => ({
    id: "n1",
    title: "T",
    folder: null,
    content: { title: "T", blocks },
    ...extra,
  });

  it("ignores block ids and compares the Markdown the writer would produce", () => {
    const a = note([{ id: "a", type: "p", text: "hello" }]);
    const b = note([{ id: "b", type: "p", text: "hello" }]);
    expect(persistedEquals(a, b)).toBe(true);
  });

  it("sees an outside re-indent, marker change or numbering change (the old field list did not)", () => {
    const base = [{ id: "a", type: "bullet", text: "one" }];
    expect(persistedEquals(note(base), note([{ ...base[0], indent: 1 }]))).toBe(false);
    expect(persistedEquals(note(base), note([{ ...base[0], marker: "*" }]))).toBe(false);
    expect(
      persistedEquals(
        note([{ id: "a", type: "numbered", text: "one", num: 1 }]),
        note([{ id: "a", type: "numbered", text: "one", num: 7 }]),
      ),
    ).toBe(false);
  });

  it("sees a change of name, folder or line-ending style", () => {
    const a = note([]);
    expect(persistedEquals(a, { ...a, title: "U", content: { ...a.content, title: "U" } })).toBe(
      false,
    );
    expect(persistedEquals(a, { ...a, folder: "Work" })).toBe(false);
    expect(persistedEquals(a, { ...a, content: { ...a.content, eol: "\r\n" } })).toBe(false);
    expect(persistedEquals(a, { ...a, folder: undefined })).toBe(true);
  });

  it("names the conflict copy after the note and the day", () => {
    expect(conflictCopyTitle("Alpha", new Date("2026-09-06T15:00:00Z"))).toBe(
      "Alpha (conflicted copy 2026-09-06)",
    );
    expect(conflictCopyTitle("", new Date("2026-09-06T15:00:00Z"))).toBe(
      "Untitled (conflicted copy 2026-09-06)",
    );
  });
});

describe("useFileSystem — outside edits", () => {
  const p = (text) => ({ id: `b-${text.length}-${Math.random()}`, type: "p", text });
  const alpha = {
    id: "n1",
    title: "Alpha",
    folder: null,
    content: { title: "Alpha", blocks: [p("Alpha body.")] },
  };
  const beta = {
    id: "n2",
    title: "Beta",
    folder: null,
    content: { title: "Beta", blocks: [p("Beta body.")] },
  };
  const betaOutside = {
    ...beta,
    content: { title: "Beta", blocks: [p("Beta body.\nAdded outside.")] },
    lastModified: 5,
    _filePath: "/notes/Beta.md",
  };
  const alphaOutside = {
    ...alpha,
    content: { title: "Alpha", blocks: [p("Alpha body.\nTheirs.")] },
    lastModified: 5,
    _filePath: "/notes/Alpha.md",
  };
  const alphaMine = { ...alpha, content: { title: "Alpha", blocks: [p("Alpha body. mine")] } };

  let fileChanged;
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      onFileChanged: vi.fn((handler) => {
        fileChanged = handler;
        return () => {};
      }),
      onFileDeleted: vi.fn(() => () => {}),
    };
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function renderWith({
    active = "n1",
    unflushed = [],
    latest = { n1: alpha, n2: beta },
  } = {}) {
    readAllNotes.mockResolvedValue({ n1: alpha, n2: beta });
    const setNoteData = vi.fn();
    const setCustomFolders = vi.fn();
    const onError = vi.fn();
    const syncGeneration = { current: 0 };
    const links = {
      unflushedNotes: { current: new Set(unflushed) },
      latestNoteDataRef: { current: latest },
      activeNoteRef: { current: active },
      applyExternalNote: vi.fn(),
      adoptNoteData: vi.fn(),
      onExternalConflict: vi.fn(),
      onNotesEdited: vi.fn(),
    };
    const hook = renderHook(
      ({ data }) =>
        useFileSystem(data, setNoteData, setCustomFolders, syncGeneration, onError, links),
      { initialProps: { data: { n1: alpha, n2: beta } } },
    );
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    await act(async () => hook.rerender({ data: { n1: alpha, n2: beta } }));
    // The disk load itself set state and bumped the generation; measure from here.
    setNoteData.mockClear();
    const generationBefore = syncGeneration.current;
    return { ...hook, links, setNoteData, onError, syncGeneration, generationBefore };
  }

  it("takes an outside change to another note through the one external path, without repainting the editor", async () => {
    const { links, setNoteData, syncGeneration, generationBefore } = await renderWith();
    await act(async () => fileChanged(betaOutside));
    const { _filePath, ...expected } = betaOutside;
    expect(links.applyExternalNote).toHaveBeenCalledExactlyOnceWith(expected);
    expect(setNoteData).not.toHaveBeenCalled();
    // Not the open note: a repaint would paint state, which lags the keystrokes
    // still inside the text-commit debounce, over the live DOM.
    expect(syncGeneration.current).toBe(generationBefore);
    expect(links.onExternalConflict).not.toHaveBeenCalled();
  });

  it("takes an outside change to the open note when nothing is pending, and repaints", async () => {
    const { links, syncGeneration, generationBefore } = await renderWith();
    await act(async () => fileChanged(alphaOutside));
    expect(links.applyExternalNote).toHaveBeenCalledTimes(1);
    expect(links.applyExternalNote.mock.calls[0][0].content.blocks[0].text).toBe(
      "Alpha body.\nTheirs.",
    );
    expect(syncGeneration.current).toBe(generationBefore + 1);
    expect(links.onExternalConflict).not.toHaveBeenCalled();
  });

  it("ignores a change that writes the same file, whatever its block ids", async () => {
    const { links } = await renderWith();
    const sameBytes = {
      ...beta,
      content: { title: "Beta", blocks: [p("Beta body.")] },
      _filePath: "x",
    };
    await act(async () => fileChanged(sameBytes));
    expect(links.applyExternalNote).not.toHaveBeenCalled();
  });

  it("a keystroke that shares a render with an outside change to another note is still marked dirty, and the outside note is not", async () => {
    writeNote.mockResolvedValue({});
    const { rerender, links } = await renderWith();
    vi.useFakeTimers();
    await act(async () => fileChanged(betaOutside));
    const { _filePath, ...betaApplied } = betaOutside;
    // The render that carries both: the outside note (from applyExternalNote)
    // and the text commit of the note being typed in.
    await act(async () => rerender({ data: { n1: alphaMine, n2: betaApplied } }));
    expect(links.onNotesEdited).toHaveBeenCalledExactlyOnceWith(["n1"]);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(writeNote).toHaveBeenCalledExactlyOnceWith(alphaMine);
  });

  it("keeps both versions when the open note has pending edits: the copy is written first, then adopted, then the editor moves to it", async () => {
    writeNote.mockResolvedValue({
      filePath: "/notes/Alpha (conflicted copy 2026-09-06)-2.md",
      title: "Alpha (conflicted copy 2026-09-06)-2",
    });
    const { links, syncGeneration, onError, generationBefore } = await renderWith({
      unflushed: ["n1"],
      latest: { n1: alphaMine, n2: beta },
    });
    await act(async () => fileChanged(alphaOutside));
    await waitFor(() => expect(links.onExternalConflict).toHaveBeenCalled());

    // Written through the ordinary write path, with the local version, under a new id.
    expect(writeNote).toHaveBeenCalledTimes(1);
    const written = writeNote.mock.calls[0][0];
    expect(written.id).not.toBe("n1");
    expect(written.title).toMatch(/^Alpha \(conflicted copy \d{4}-\d{2}-\d{2}\)$/);
    expect(written.content.title).toBe(written.title);
    expect(written.content.blocks).toEqual(alphaMine.content.blocks);

    // Only then: the disk version replaces the note, the copy is adopted under
    // the name the file actually got, and the editor is told to continue in it.
    const { _filePath, ...expectedExternal } = alphaOutside;
    expect(links.applyExternalNote).toHaveBeenCalledExactlyOnceWith(expectedExternal);
    const copy = links.adoptNoteData.mock.calls[0][0]({})[written.id];
    expect(copy.title).toBe("Alpha (conflicted copy 2026-09-06)-2");
    expect(copy.content.blocks).toEqual(alphaMine.content.blocks);
    expect(links.onExternalConflict).toHaveBeenCalledExactlyOnceWith({
      noteId: "n1",
      title: "Alpha",
      copyId: written.id,
      copyTitle: "Alpha (conflicted copy 2026-09-06)-2",
    });
    expect(syncGeneration.current).toBe(generationBefore + 1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("replaces nothing when the copy cannot be written: the work stays in memory, the disk keeps the outside bytes, and the failure is shown", async () => {
    // Only the copy's write fails; hooks left mounted by earlier tests may
    // still retry their own notes here, so the rejection must not be a "once".
    writeNote.mockImplementation(async (note) => {
      if (/conflicted copy/.test(note.title)) throw new Error("disk unavailable");
      return {};
    });
    const { rerender, links, onError } = await renderWith({
      unflushed: ["n1"],
      latest: { n1: alphaMine, n2: beta },
    });
    vi.useFakeTimers();
    // The local edit has reached state, so its debounced write is scheduled.
    await act(async () => rerender({ data: { n1: alphaMine, n2: beta } }));
    await act(async () => fileChanged(alphaOutside));
    await act(async () => vi.advanceTimersByTimeAsync(0));

    expect(onError).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("could not be saved as a copy"),
    );
    expect(links.applyExternalNote).not.toHaveBeenCalled();
    expect(links.adoptNoteData).not.toHaveBeenCalled();
    expect(links.onExternalConflict).not.toHaveBeenCalled();

    // The scheduled write of the local version does not go over the outside
    // edit; the retry tries the copy again instead.
    await act(async () => vi.advanceTimersByTimeAsync(5500));
    expect(
      writeNote.mock.calls.filter((c) => /conflicted copy/.test(c[0].title)).length,
    ).toBeGreaterThanOrEqual(2);
    expect(writeNote).not.toHaveBeenCalledWith(alphaMine);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("after a failed copy write, the blur/quit flush retries the copy and never writes the local version under the note's own name", async () => {
    // Regression (2026-09-06): the quit/blur net still held the note, so the
    // next blur or quit wrote the local version over the outside edit.
    let copyWrites = 0;
    let copyFails = true;
    writeNote.mockImplementation(async (note) => {
      if (/conflicted copy/.test(note.title)) {
        copyWrites++;
        if (copyFails) throw new Error("disk unavailable");
        return { filePath: `/notes/${note.title}.md`, title: note.title };
      }
      return {};
    });
    const { result, links, onError } = await renderWith({
      unflushed: ["n1"],
      latest: { n1: alphaMine, n2: beta },
    });
    await act(async () => fileChanged(alphaOutside));
    await waitFor(() => expect(copyWrites).toBe(1));
    expect(onError).toHaveBeenCalledTimes(1);

    // Blur / quit: the net still names n1 and hands over the latest data.
    // (Hooks left mounted by earlier tests may write their own notes here, so
    // only this flush's writes are inspected.)
    let before = writeNote.mock.calls.length;
    await act(async () => result.current.flushToDisk({ n1: alphaMine, n2: beta }, ["n1"]));
    expect(copyWrites).toBe(2);
    const flushed = () => writeNote.mock.calls.slice(before).map((c) => c[0]);
    expect(flushed().every((n) => /conflicted copy/.test(n.title))).toBe(true);
    expect(flushed()).not.toContain(alphaMine);
    expect(links.applyExternalNote).not.toHaveBeenCalled();
    // The failure is reported once, not on every retry.
    expect(onError).toHaveBeenCalledTimes(1);

    // Once the copy can be written, the conflict resolves the ordinary way.
    copyFails = false;
    before = writeNote.mock.calls.length;
    await act(async () => result.current.flushToDisk({ n1: alphaMine, n2: beta }, ["n1"]));
    expect(copyWrites).toBe(3);
    const { _filePath, ...expectedExternal } = alphaOutside;
    expect(links.applyExternalNote).toHaveBeenCalledExactlyOnceWith(expectedExternal);
    expect(links.onExternalConflict).toHaveBeenCalledTimes(1);
    expect(flushed().every((n) => /conflicted copy/.test(n.title))).toBe(true);
  });
});
