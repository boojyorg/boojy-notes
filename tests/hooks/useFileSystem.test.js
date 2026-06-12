/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../src/utils/platform", () => ({
  isElectron: true,
  isWeb: false,
  isNative: true,
}));

const readAllNotes = vi.fn();
vi.mock("../../src/services/apiProvider", () => ({
  getAPI: () => ({
    getNotesDir: vi.fn(async () => "/notes"),
    readAllNotes,
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

  function renderFS({ syncGeneration = { current: 0 } } = {}) {
    const setNoteData = vi.fn();
    const setCustomFolders = vi.fn();
    const result = renderHook(() =>
      useFileSystem(
        {},
        setNoteData,
        setCustomFolders,
        { current: new Map() },
        syncGeneration,
        vi.fn(),
        vi.fn(),
      ),
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
});
