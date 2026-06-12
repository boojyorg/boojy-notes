import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useQuitFlush } from "../../src/hooks/useQuitFlush";

describe("useQuitFlush", () => {
  let flushToDisk;
  let flushBeforeCloseDone;
  let willCloseCallback;
  const noteDataRef = { current: { "note-1": { id: "note-1" } } };
  const editedNoteHint = { current: null };
  const hasPendingFlush = { current: false };

  beforeEach(() => {
    flushToDisk = vi.fn().mockResolvedValue(undefined);
    flushBeforeCloseDone = vi.fn();
    willCloseCallback = null;
    editedNoteHint.current = null;
    hasPendingFlush.current = false;
    window.electronAPI.onAppWillClose = (cb) => {
      willCloseCallback = cb;
      return () => {
        willCloseCallback = null;
      };
    };
    window.electronAPI.flushBeforeCloseDone = flushBeforeCloseDone;
  });

  const render = () =>
    renderHook(() => useQuitFlush(flushToDisk, noteDataRef, editedNoteHint, hasPendingFlush));

  it("flushes from the authoritative ref and reports done on app-will-close", async () => {
    render();
    expect(willCloseCallback).toBeTypeOf("function");

    await willCloseCallback();

    expect(flushToDisk).toHaveBeenCalledWith(noteDataRef.current, []);
    expect(flushBeforeCloseDone).toHaveBeenCalledTimes(1);
  });

  it("passes the pending-text note as an extra dirty id", async () => {
    hasPendingFlush.current = true;
    editedNoteHint.current = "note-1";
    render();

    await willCloseCallback();

    expect(flushToDisk).toHaveBeenCalledWith(noteDataRef.current, ["note-1"]);
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
