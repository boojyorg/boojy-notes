import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useQuitFlush } from "../../src/hooks/useQuitFlush";

// What the flush writes is useFileSystem's (`flushAll`, tested there); this
// hook decides when it runs and never traps the close.
describe("useQuitFlush", () => {
  let flushAll;
  let flushBeforeCloseDone;
  let willCloseCallback;

  beforeEach(() => {
    flushAll = vi.fn().mockResolvedValue(undefined);
    flushBeforeCloseDone = vi.fn();
    willCloseCallback = null;
    window.electronAPI.onAppWillClose = (cb) => {
      willCloseCallback = cb;
      return () => {
        willCloseCallback = null;
      };
    };
    window.electronAPI.flushBeforeCloseDone = flushBeforeCloseDone;
  });

  const render = () => renderHook(() => useQuitFlush(flushAll));

  it("flushes everything pending and reports done on app-will-close", async () => {
    render();
    expect(willCloseCallback).toBeTypeOf("function");

    await willCloseCallback();

    expect(flushAll).toHaveBeenCalledTimes(1);
    expect(flushBeforeCloseDone).toHaveBeenCalledTimes(1);
  });

  it("still reports done if the flush itself fails (never traps the close)", async () => {
    flushAll.mockRejectedValue(new Error("disk full"));
    render();

    await willCloseCallback();

    expect(flushBeforeCloseDone).toHaveBeenCalledTimes(1);
  });

  it("flushes on window blur", () => {
    render();
    window.dispatchEvent(new Event("blur"));
    expect(flushAll).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render();
    unmount();
    expect(willCloseCallback).toBeNull();
    window.dispatchEvent(new Event("blur"));
    expect(flushAll).not.toHaveBeenCalled();
  });
});
