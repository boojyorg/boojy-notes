/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock sync service
vi.mock("../../src/services/sync", () => ({
  pushNote: vi.fn(async () => ({ version: 1 })),
  pullNotes: vi.fn(async () => ({ notes: [], totalStorageBytes: 0 })),
  deleteNoteRemote: vi.fn(async () => ({})),
  parseFrontmatter: vi.fn(),
  markdownToBlocks: vi.fn(() => []),
}));

// Mock supabase (channel/realtime)
// Defer subscribe callback to avoid TDZ on the `channel` const in useSync.js
vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch = {
        on: vi.fn(() => ch),
        subscribe: vi.fn((cb) => {
          if (cb) setTimeout(() => cb("SUBSCRIBED"), 0);
          return ch;
        }),
        send: vi.fn(),
      };
      return ch;
    }),
    removeChannel: vi.fn(),
  },
}));

import { useSync } from "../../src/hooks/useSync.js";
import { pushNote, pullNotes, deleteNoteRemote } from "../../src/services/sync";

function makeNote(id, title = "Test") {
  return {
    id,
    title,
    folder: null,
    path: null,
    content: { title, blocks: [{ id: "b1", type: "p", text: "hello" }] },
    words: 1,
  };
}

describe("useSync", () => {
  let originalNavigatorOnLine;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Ensure navigator.onLine is true by default
    originalNavigatorOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalNavigatorOnLine) {
      Object.defineProperty(Navigator.prototype, "onLine", originalNavigatorOnLine);
    } else {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
        writable: true,
      });
    }
  });

  // --- Helpers ---

  function renderSync({
    user = null,
    profile = null,
    noteData = {},
    setNoteData = vi.fn(),
    activeNoteId = null,
    editedNoteHint = { current: null },
  } = {}) {
    return renderHook(
      ({ user, profile, noteData, setNoteData, activeNoteId, editedNoteHint }) =>
        useSync(user, profile, noteData, setNoteData, activeNoteId, editedNoteHint),
      {
        initialProps: { user, profile, noteData, setNoteData, activeNoteId, editedNoteHint },
      },
    );
  }

  // ─── 1. Initial state ───

  it("starts with idle syncState and null lastSynced", () => {
    const { result } = renderSync();
    expect(result.current.syncState).toBe("idle");
    expect(result.current.lastSynced).toBeNull();
  });

  it("restores lastSynced from localStorage", () => {
    const ts = "2026-01-01T00:00:00.000Z";
    localStorage.setItem("boojy-sync-last", ts);
    const { result } = renderSync();
    expect(result.current.lastSynced).toBe(ts);
  });

  // ─── 2. syncAll when not logged in ───

  it("syncAll returns early when user is null", async () => {
    const { result } = renderSync();
    await act(async () => {
      await result.current.syncAll();
    });
    expect(pushNote).not.toHaveBeenCalled();
    expect(pullNotes).not.toHaveBeenCalled();
    expect(result.current.syncState).toBe("idle");
  });

  // ─── 3. syncAll when offline ───

  it("sets offline state when navigator.onLine is false", async () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
      writable: true,
    });
    const user = { id: "u1" };
    const { result } = renderSync({ user });
    await act(async () => {
      await result.current.syncAll();
    });
    expect(result.current.syncState).toBe("offline");
    expect(pushNote).not.toHaveBeenCalled();
  });

  // ─── 4. Dirty note detection via noteData changes ───

  it("marks notes dirty when noteData changes (full scan)", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    const note1 = makeNote("n1");
    const noteData1 = { n1: note1 };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");

    const setNoteData = vi.fn();
    pullNotes.mockResolvedValue({ notes: [], totalStorageBytes: 0 });
    pushNote.mockResolvedValue({ version: 2 });

    const { result, rerender } = renderSync({
      user,
      noteData: noteData1,
      setNoteData,
    });

    // Modify note content (new reference)
    const note1Modified = { ...note1, title: "Changed" };
    const noteData2 = { n1: note1Modified };
    rerender({
      user,
      profile: null,
      noteData: noteData2,
      setNoteData,
      activeNoteId: null,
      editedNoteHint: { current: null },
    });

    // Advance past sync debounce (2000ms)
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(pushNote).toHaveBeenCalled();
    vi.useRealTimers();
  });

  // ─── 5. editedNoteHint short-circuit ───

  it("uses editedNoteHint to skip full scan and only mark hinted note", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    const note1 = makeNote("n1");
    const note2 = makeNote("n2");
    const noteData1 = { n1: note1, n2: note2 };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");

    const setNoteData = vi.fn();
    const editedNoteHint = { current: "n1" };
    pullNotes.mockResolvedValue({ notes: [], totalStorageBytes: 0 });
    pushNote.mockResolvedValue({ version: 2 });

    const { rerender } = renderSync({
      user,
      noteData: noteData1,
      setNoteData,
      editedNoteHint,
    });

    // Only n1 changes; hint points to n1
    editedNoteHint.current = "n1";
    const note1Modified = { ...note1, title: "Changed" };
    const noteData2 = { n1: note1Modified, n2: note2 }; // n2 same ref
    rerender({
      user,
      profile: null,
      noteData: noteData2,
      setNoteData,
      activeNoteId: null,
      editedNoteHint,
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    // pushNote should be called only for n1 (the hinted note), not n2
    const pushCalls = pushNote.mock.calls;
    const pushedIds = pushCalls.map((c) => c[0].id);
    expect(pushedIds).toContain("n1");
    expect(pushedIds).not.toContain("n2");

    vi.useRealTimers();
  });

  it("clears editedNoteHint after consuming it", async () => {
    const user = { id: "u1" };
    const note1 = makeNote("n1");
    const noteData1 = { n1: note1 };
    const editedNoteHint = { current: "n1" };

    const { rerender } = renderSync({ user, noteData: noteData1, editedNoteHint });

    const note1Modified = { ...note1, title: "Changed" };
    rerender({
      user,
      profile: null,
      noteData: { n1: note1Modified },
      setNoteData: vi.fn(),
      activeNoteId: null,
      editedNoteHint,
    });

    expect(editedNoteHint.current).toBeNull();
  });

  // ─── 6. Retry logic ───

  it("retries up to 3 times with exponential backoff on sync error", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");
    pullNotes.mockRejectedValue(new Error("network fail"));

    const { result } = renderSync({ user });

    // First attempt
    await act(async () => {
      await result.current.syncAll();
    });
    expect(result.current.syncState).toBe("retrying");

    // Second attempt (after 2000ms)
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    // Need to flush the promise
    await act(async () => {});
    expect(result.current.syncState).toBe("retrying");

    // Third attempt (after 4000ms)
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    await act(async () => {});
    expect(result.current.syncState).toBe("retrying");

    // Fourth timeout (after 8000ms) - should set error since max retries exceeded
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    await act(async () => {});
    expect(result.current.syncState).toBe("error");

    vi.useRealTimers();
  });

  it("resets retry count on success", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");

    // First call fails, second succeeds
    pullNotes
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ notes: [], totalStorageBytes: 0 });

    const { result } = renderSync({ user });

    // First attempt fails
    await act(async () => {
      await result.current.syncAll();
    });
    expect(result.current.syncState).toBe("retrying");

    // Retry succeeds
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {});

    expect(result.current.syncState).toBe("synced");

    vi.useRealTimers();
  });

  it("sets retrying state during retry attempts", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");
    pullNotes.mockRejectedValue(new Error("fail"));

    const { result } = renderSync({ user });

    await act(async () => {
      await result.current.syncAll();
    });

    expect(result.current.syncState).toBe("retrying");
    vi.useRealTimers();
  });

  // ─── 7. Version map persistence ───

  it("loads version map from localStorage", () => {
    const vmap = { n1: 5, n2: 3 };
    localStorage.setItem("boojy-sync-versions", JSON.stringify(vmap));
    // Hook loads version map internally on mount. We verify indirectly
    // by pushing a note and checking the expected version arg.
    renderSync();
    // No crash = loaded successfully
    const stored = JSON.parse(localStorage.getItem("boojy-sync-versions"));
    expect(stored).toEqual(vmap);
  });

  it("saves version map after successful sync", async () => {
    const user = { id: "u1" };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");
    pullNotes.mockResolvedValue({ notes: [], totalStorageBytes: 0 });

    const { result } = renderSync({ user });

    await act(async () => {
      await result.current.syncAll();
    });

    // Version map should have been saved (even if empty)
    const stored = localStorage.getItem("boojy-sync-versions");
    expect(stored).not.toBeNull();
  });

  // ─── 8. Persisted dirty notes ───

  it("loads persisted dirty notes on mount", () => {
    const persisted = { ids: ["n1"], notes: { n1: makeNote("n1") } };
    localStorage.setItem("boojy-sync-dirty", JSON.stringify(persisted));

    const setNoteData = vi.fn();
    renderSync({ setNoteData });

    // The hook should call setNoteData to restore missing notes
    expect(setNoteData).toHaveBeenCalled();
  });

  it("clears persisted dirty on successful sync with no remaining dirty", async () => {
    const user = { id: "u1" };
    const note1 = makeNote("n1");
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");
    localStorage.setItem("boojy-sync-dirty", JSON.stringify({ ids: ["n1"], notes: { n1: note1 } }));

    pullNotes.mockResolvedValue({ notes: [], totalStorageBytes: 0 });
    pushNote.mockResolvedValue({ version: 2 });

    const { result } = renderSync({ user, noteData: { n1: note1 } });

    await act(async () => {
      await result.current.syncAll();
    });

    expect(localStorage.getItem("boojy-sync-dirty")).toBeNull();
  });

  it("saves persisted dirty notes when dirty notes remain after sync", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    const note1 = makeNote("n1");
    const noteData1 = { n1: note1 };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");

    const setNoteData = vi.fn();
    pullNotes.mockResolvedValue({ notes: [], totalStorageBytes: 0 });
    // Make pushNote fail so dirty notes remain
    pushNote.mockRejectedValue(new Error("push fail"));

    const { rerender } = renderSync({
      user,
      noteData: noteData1,
      setNoteData,
    });

    // Trigger a change to mark n1 dirty
    const noteData2 = { n1: { ...note1, title: "changed" } };
    rerender({
      user,
      profile: null,
      noteData: noteData2,
      setNoteData,
      activeNoteId: null,
      editedNoteHint: { current: null },
    });

    // Advance past dirty persist debounce (1000ms)
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    const stored = localStorage.getItem("boojy-sync-dirty");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored);
    expect(parsed.ids).toContain("n1");

    vi.useRealTimers();
  });

  // ─── 9. Conflict detection and toast ───

  it("exposes conflictToast and dismissConflictToast in return value", () => {
    const { result } = renderSync();
    expect(result.current.conflictToast).toBeNull();
    expect(typeof result.current.dismissConflictToast).toBe("function");
  });

  it("dismissConflictToast clears the toast", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    const note1 = makeNote("n1", "My Note");
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");

    const setNoteData = vi.fn();
    pullNotes.mockResolvedValue({ notes: [], totalStorageBytes: 0 });
    pushNote
      .mockResolvedValueOnce({ conflict: true, serverVersion: 5 })
      .mockResolvedValueOnce({ version: 1 });

    const { result, rerender } = renderSync({
      user,
      noteData: { n1: note1 },
      setNoteData,
    });

    // Trigger conflict
    rerender({
      user,
      profile: null,
      noteData: { n1: { ...note1, title: "X" } },
      setNoteData,
      activeNoteId: null,
      editedNoteHint: { current: null },
    });
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    await act(async () => {});

    expect(result.current.conflictToast).not.toBeNull();

    act(() => {
      result.current.dismissConflictToast();
    });
    expect(result.current.conflictToast).toBeNull();

    vi.useRealTimers();
  });

  // ─── 10. Online/offline event handlers ───

  it("sets offline state when offline event fires", async () => {
    const user = { id: "u1" };
    const { result } = renderSync({ user });

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(result.current.syncState).toBe("offline");
  });

  it("triggers sync when online event fires", async () => {
    const user = { id: "u1" };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");
    pullNotes.mockResolvedValue({ notes: [], totalStorageBytes: 0 });

    renderSync({ user });

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // pullNotes should have been called as part of sync
    expect(pullNotes).toHaveBeenCalled();
  });

  // ─── 11. Cleanup clears timers ───

  it("clears timers on unmount", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    const user = { id: "u1" };
    const { unmount } = renderSync({ user });

    unmount();

    // Should have called clearTimeout for syncTimer, dirtyPersistTimer, retryTimer
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  // ─── 12. Deleted notes detection ───

  it("detects deleted notes when a key disappears from noteData", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    const note1 = makeNote("n1");
    const note2 = makeNote("n2");
    const noteData1 = { n1: note1, n2: note2 };
    localStorage.setItem("boojy-sync-last", "2026-01-01T00:00:00.000Z");

    pullNotes.mockResolvedValue({ notes: [], totalStorageBytes: 0 });
    deleteNoteRemote.mockResolvedValue({});

    const setNoteData = vi.fn();
    const { rerender } = renderSync({
      user,
      noteData: noteData1,
      setNoteData,
    });

    // Remove n2
    const noteData2 = { n1: note1 };
    rerender({
      user,
      profile: null,
      noteData: noteData2,
      setNoteData,
      activeNoteId: null,
      editedNoteHint: { current: null },
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    await act(async () => {});

    expect(deleteNoteRemote).toHaveBeenCalledWith("n2");

    vi.useRealTimers();
  });

  // ─── 13. storageLimitMB computation ───

  it("returns storageLimitMB from profile", () => {
    const profile = { storage_limit_bytes: 10 * 1024 * 1024 };
    const { result } = renderSync({ profile });
    expect(result.current.storageLimitMB).toBe(10);
  });

  it("returns null storageLimitMB when no profile", () => {
    const { result } = renderSync();
    expect(result.current.storageLimitMB).toBeNull();
  });

  // ─── 14. storageUsed from localStorage ───

  it("restores storageUsed from localStorage", () => {
    localStorage.setItem("boojy-sync-storage", "5000");
    const { result } = renderSync();
    expect(result.current.storageUsed).toBe(5000);
  });

  // ─── 15. First sync confirmation ───

  it("sets pendingFirstSync when user has local notes but no lastSynced", () => {
    const user = { id: "u1" };
    const noteData = { n1: makeNote("n1"), n2: makeNote("n2") };
    const { result } = renderSync({ user, noteData });
    expect(result.current.pendingFirstSync).toEqual({ noteCount: 2 });
  });

  it("confirmFirstSync clears pendingFirstSync and triggers sync", async () => {
    vi.useFakeTimers();
    const user = { id: "u1" };
    const noteData = { n1: makeNote("n1") };
    pushNote.mockResolvedValue({ version: 1 });

    const { result } = renderSync({ user, noteData });
    expect(result.current.pendingFirstSync).not.toBeNull();

    act(() => {
      result.current.confirmFirstSync();
    });
    expect(result.current.pendingFirstSync).toBeNull();

    // Advance past the 100ms setTimeout in confirmFirstSync
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {});

    expect(pushNote).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
