/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFullScreen } from "../../src/hooks/useFullScreen";

afterEach(() => {
  delete window.electronAPI;
});

/**
 * The traffic-light inset keys off this. It must start from the window's
 * real state (a renderer can load already in full screen), follow every
 * edge after that, and stop listening when its owner unmounts; and on the
 * web, or with an older preload, it is simply false.
 */
describe("useFullScreen", () => {
  it("is false with no Electron API", () => {
    const { result } = renderHook(() => useFullScreen());
    expect(result.current).toBe(false);
  });

  it("is false when the preload predates the API", () => {
    window.electronAPI = { setWindowTitle: vi.fn() };
    const { result } = renderHook(() => useFullScreen());
    expect(result.current).toBe(false);
  });

  it("takes the window's state at mount, follows each edge and unsubscribes", async () => {
    let listener = null;
    const unsubscribe = vi.fn();
    window.electronAPI = {
      isFullScreen: vi.fn(async () => true),
      onFullScreenChanged: vi.fn((cb) => {
        listener = cb;
        return unsubscribe;
      }),
    };
    const { result, unmount } = renderHook(() => useFullScreen());
    expect(result.current).toBe(false);
    await act(async () => {});
    expect(result.current).toBe(true);

    act(() => listener(false));
    expect(result.current).toBe(false);
    act(() => listener(true));
    expect(result.current).toBe(true);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("ignores a mount answer that lands after unmount", async () => {
    let resolve;
    window.electronAPI = {
      isFullScreen: () => new Promise((r) => (resolve = r)),
      onFullScreenChanged: () => () => {},
    };
    const { result, unmount } = renderHook(() => useFullScreen());
    unmount();
    await act(async () => {
      resolve(true);
    });
    expect(result.current).toBe(false);
  });
});
