/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWindowResizing } from "../../src/hooks/useWindowResizing";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useWindowResizing", () => {
  it("marks <html> while the window resizes and clears the mark once it is still", () => {
    vi.useFakeTimers();
    const root = document.documentElement;
    const { unmount } = renderHook(() => useWindowResizing());
    window.dispatchEvent(new Event("resize"));
    expect(root.classList.contains("window-resizing")).toBe(true);
    vi.advanceTimersByTime(100);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(100);
    expect(root.classList.contains("window-resizing")).toBe(true);
    vi.advanceTimersByTime(100);
    expect(root.classList.contains("window-resizing")).toBe(false);
    window.dispatchEvent(new Event("resize"));
    unmount();
    expect(root.classList.contains("window-resizing")).toBe(false);
  });
});
