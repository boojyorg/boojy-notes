/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

// On the phone there is no close to hold: Android closes a hidden app without
// a word, so the flush happens as the app leaves the screen.
vi.mock("../../src/utils/platform", async (actual) => ({
  ...(await actual()),
  isElectron: false,
  isPhone: true,
}));

const { useQuitFlush } = await import("../../src/hooks/useQuitFlush");

afterEach(cleanup);

const setVisibility = (state) => {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("useQuitFlush on the phone", () => {
  it("flushes when the app leaves the screen, not when it comes back", () => {
    const flushAll = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useQuitFlush(flushAll));
    setVisibility("hidden");
    expect(flushAll).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(flushAll).toHaveBeenCalledTimes(1);
  });

  it("stops listening on unmount", () => {
    const flushAll = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useQuitFlush(flushAll));
    unmount();
    setVisibility("hidden");
    expect(flushAll).not.toHaveBeenCalled();
  });
});
