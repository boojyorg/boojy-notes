/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSidebarFits, MIN_EDITOR_WIDTH, FIT_HYSTERESIS } from "../../src/hooks/useSidebarFits";

const ORIGINAL_WIDTH = window.innerWidth;

function setWidth(px) {
  window.innerWidth = px;
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  window.innerWidth = ORIGINAL_WIDTH;
});

afterEach(() => {
  window.innerWidth = ORIGINAL_WIDTH;
});

describe("useSidebarFits", () => {
  it("fits when the window clears the sidebar plus the editor floor", () => {
    window.innerWidth = 220 + MIN_EDITOR_WIDTH;
    const { result } = renderHook(() => useSidebarFits(220));
    expect(result.current).toBe(true);
  });

  it("does not fit one pixel under the threshold", () => {
    window.innerWidth = 220 + MIN_EDITOR_WIDTH - 1;
    const { result } = renderHook(() => useSidebarFits(220));
    expect(result.current).toBe(false);
  });

  it("scales the threshold with the user's sidebar width", () => {
    // 780px fits a 220px sidebar but not a 400px one.
    window.innerWidth = 780;
    const narrow = renderHook(() => useSidebarFits(220));
    const wide = renderHook(() => useSidebarFits(400));
    expect(narrow.result.current).toBe(true);
    expect(wide.result.current).toBe(false);
  });

  it("re-measures when the sidebar is dragged wider, with no window resize", () => {
    window.innerWidth = 900;
    const { result, rerender } = renderHook(({ w }) => useSidebarFits(w), {
      initialProps: { w: 220 },
    });
    expect(result.current).toBe(true);
    act(() => rerender({ w: 400 }));
    expect(result.current).toBe(false);
  });

  describe("hysteresis", () => {
    it("needs the extra band to come back in flow after leaving", () => {
      const threshold = 220 + MIN_EDITOR_WIDTH;
      window.innerWidth = 1200;
      const { result } = renderHook(() => useSidebarFits(220));
      expect(result.current).toBe(true);

      // Drop below: the sidebar leaves.
      setWidth(threshold - 1);
      expect(result.current).toBe(false);

      // Back to exactly the leaving width — not enough to return.
      setWidth(threshold);
      expect(result.current).toBe(false);
      setWidth(threshold + FIT_HYSTERESIS - 1);
      expect(result.current).toBe(false);

      // Clear the band and it returns.
      setWidth(threshold + FIT_HYSTERESIS);
      expect(result.current).toBe(true);
    });

    it("does not thrash while the window edge sits on the threshold", () => {
      const threshold = 220 + MIN_EDITOR_WIDTH;
      window.innerWidth = 1200;
      const { result } = renderHook(() => useSidebarFits(220));

      setWidth(threshold - 1);
      const seen = new Set();
      for (const w of [threshold, threshold - 1, threshold + 1, threshold - 2, threshold + 10]) {
        setWidth(w);
        seen.add(result.current);
      }
      expect(seen).toEqual(new Set([false]));
    });
  });

  it("stops measuring once unmounted", () => {
    window.innerWidth = 1200;
    const { result, unmount } = renderHook(() => useSidebarFits(220));
    unmount();
    setWidth(400);
    expect(result.current).toBe(true);
  });
});
