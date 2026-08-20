/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useIsMobile } from "../../src/hooks/useIsMobile";

const realMatchMedia = window.matchMedia;

/**
 * Stand-in for the media engine: jsdom evaluates neither `max-width` nor
 * `pointer`, so the test supplies the answer and asserts on the query the hook
 * asked about.
 */
function mockMedia({ width, pointer }) {
  const listeners = new Set();
  const evaluate = (query) => {
    const widthMatch = query.match(/max-width:\s*(\d+)px/);
    const pointerMatch = query.match(/\(pointer:\s*(\w+)\)/);
    const widthOk = widthMatch ? width <= Number(widthMatch[1]) : true;
    const pointerOk = pointerMatch ? pointer === pointerMatch[1] : true;
    return widthOk && pointerOk;
  };
  window.matchMedia = vi.fn((query) => ({
    get matches() {
      return evaluate(query);
    },
    media: query,
    addEventListener: (_evt, cb) => listeners.add(cb),
    removeEventListener: (_evt, cb) => listeners.delete(cb),
  }));
  return {
    change(next) {
      if (next.width !== undefined) width = next.width;
      if (next.pointer !== undefined) pointer = next.pointer;
      act(() => {
        for (const cb of listeners)
          cb({ matches: evaluate("(max-width: 768px) and (pointer: coarse)") });
      });
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

beforeEach(() => {
  window.matchMedia = realMatchMedia;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe("useIsMobile", () => {
  it("is false for a narrow desktop window — width alone is not mobile", () => {
    mockMedia({ width: 700, pointer: "fine" });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("is false for a wide touch device", () => {
    mockMedia({ width: 1024, pointer: "coarse" });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("is true only when narrow and coarse-pointered", () => {
    mockMedia({ width: 390, pointer: "coarse" });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("tracks a device rotating out of the mobile range", () => {
    const media = mockMedia({ width: 390, pointer: "coarse" });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    media.change({ width: 844 });
    expect(result.current).toBe(false);
  });

  it("detaches its listener on unmount", () => {
    const media = mockMedia({ width: 390, pointer: "coarse" });
    const { unmount } = renderHook(() => useIsMobile());
    expect(media.listenerCount).toBe(1);
    unmount();
    expect(media.listenerCount).toBe(0);
  });
});
