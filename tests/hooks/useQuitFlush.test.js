import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useQuitFlush } from "../../src/hooks/useQuitFlush";

describe("useQuitFlush", () => {
  let flushToDisk;
  let flushBeforeCloseDone;
  let willCloseCallback;
  const noteDataRef = { current: { "note-1": { id: "note-1" } } };
  const unflushedNotes = { current: new Set() };

  beforeEach(() => {
    flushToDisk = vi.fn().mockResolvedValue(undefined);
    flushBeforeCloseDone = vi.fn();
    willCloseCallback = null;
    unflushedNotes.current = new Set();
    window.electronAPI.onAppWillClose = (cb) => {
      willCloseCallback = cb;
      return () => {
        willCloseCallback = null;
      };
    };
    window.electronAPI.flushBeforeCloseDone = flushBeforeCloseDone;
  });

  const render = () => renderHook(() => useQuitFlush(flushToDisk, noteDataRef, unflushedNotes));

  it("flushes from the authoritative ref and reports done on app-will-close", async () => {
    render();
    expect(willCloseCallback).toBeTypeOf("function");

    await willCloseCallback();

    expect(flushToDisk).toHaveBeenCalledWith(noteDataRef.current, []);
    expect(flushBeforeCloseDone).toHaveBeenCalledTimes(1);
  });

  it("passes every unflushed note as an extra dirty id (split-pane edits survive)", async () => {
    // Two notes edited within one debounce window — a single-slot hint would
    // remember only the second and silently drop the first's keystrokes
    unflushedNotes.current.add("note-1");
    unflushedNotes.current.add("note-2");
    render();

    await willCloseCallback();

    expect(flushToDisk).toHaveBeenCalledWith(noteDataRef.current, ["note-1", "note-2"]);
  });

  it("clears the unflushed set after a successful flush", async () => {
    unflushedNotes.current.add("note-1");
    render();

    await willCloseCallback();

    expect(unflushedNotes.current.size).toBe(0);
  });

  it("restores the unflushed set when the flush fails", async () => {
    flushToDisk.mockRejectedValue(new Error("disk full"));
    unflushedNotes.current.add("note-1");
    render();

    await willCloseCallback();

    expect(unflushedNotes.current.has("note-1")).toBe(true);
  });

  it("still reports done if the flush itself fails (never traps the close)", async () => {
    flushToDisk.mockRejectedValue(new Error("disk full"));
    render();

    await willCloseCallback();

    expect(flushBeforeCloseDone).toHaveBeenCalledTimes(1);
  });

  it("flushes on window blur", () => {
    render();
    window.dispatchEvent(new Event("blur"));
    expect(flushToDisk).toHaveBeenCalledWith(noteDataRef.current, []);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render();
    unmount();
    expect(willCloseCallback).toBeNull();
    window.dispatchEvent(new Event("blur"));
    expect(flushToDisk).not.toHaveBeenCalled();
  });
});
