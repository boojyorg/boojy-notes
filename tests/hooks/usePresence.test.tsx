import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePresence } from "../../src/hooks/usePresence";
import { MOTION_EXIT_MS } from "../../src/tokens/motion";

const realMatchMedia = window.matchMedia;
const setReducedMotion = (on: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

describe("usePresence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = realMatchMedia;
  });

  it("holds the last value, marked as leaving, until the exit has played", () => {
    const { result, rerender } = renderHook(({ v }) => usePresence(v), {
      initialProps: { v: { id: 1 } as { id: number } | null },
    });
    expect(result.current).toEqual({ value: { id: 1 }, motion: "enter" });

    rerender({ v: null });
    // The very render after the close still holds it: no unmount, no remount.
    expect(result.current).toEqual({ value: { id: 1 }, motion: "exit" });

    act(() => {
      vi.advanceTimersByTime(MOTION_EXIT_MS - 1);
    });
    expect(result.current.value).toEqual({ id: 1 });

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.value).toBeNull();
  });

  it("is never present when it was never open", () => {
    const { result } = renderHook(() => usePresence<string>(null));
    expect(result.current.value).toBeNull();
  });

  it("comes back to enter if it reopens mid-exit, and the old timer does not close it", () => {
    const { result, rerender } = renderHook(({ v }) => usePresence(v), {
      initialProps: { v: "a" as string | null },
    });
    rerender({ v: null });
    act(() => {
      vi.advanceTimersByTime(MOTION_EXIT_MS / 2);
    });
    rerender({ v: "b" });
    expect(result.current).toEqual({ value: "b", motion: "enter" });
    act(() => {
      vi.advanceTimersByTime(MOTION_EXIT_MS * 2);
    });
    expect(result.current).toEqual({ value: "b", motion: "enter" });
  });

  it("skips the exit under reduced motion", () => {
    setReducedMotion(true);
    const { result, rerender } = renderHook(({ v }) => usePresence(v), {
      initialProps: { v: "a" as string | null },
    });
    rerender({ v: null });
    expect(result.current.value).toBeNull();
  });
});
