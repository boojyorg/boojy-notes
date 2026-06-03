/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSearchNavigation } from "../../src/hooks/useSearchNavigation";

function setup(overrides = {}) {
  const clearSelection = vi.fn();
  const openNote = vi.fn();
  const deps = {
    search: "",
    clearSelectionRef: { current: clearSelection },
    blockRefs: { current: {} },
    accentColor: "#ff0000",
    openNote,
    ...overrides,
  };
  const utils = renderHook((props) => useSearchNavigation(props), { initialProps: deps });
  return { ...deps, clearSelection, openNote, ...utils };
}

describe("useSearchNavigation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("clears multi-select when a search term is present", () => {
    const { clearSelection } = setup({ search: "foo" });
    expect(clearSelection).toHaveBeenCalledTimes(1);
  });

  it("does not clear multi-select when search is empty", () => {
    const { clearSelection } = setup({ search: "" });
    expect(clearSelection).not.toHaveBeenCalled();
  });

  it("handleSearchResultOpen opens the note and scrolls to the matched block", () => {
    const el = document.createElement("div");
    el.scrollIntoView = vi.fn();
    const { result, openNote } = setup({ blockRefs: { current: { b1: el } } });

    result.current.handleSearchResultOpen("n1", "b1");
    expect(openNote).toHaveBeenCalledWith("n1");

    vi.advanceTimersByTime(150);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    // jsdom normalizes the accent + alpha hex to rgba(); just assert the highlight was applied
    expect(el.style.background).toMatch(/rgba\(255, 0, 0/);
    // …and that it fades back to transparent
    vi.advanceTimersByTime(1200);
    expect(el.style.background).toBe("transparent");
  });

  it("handleSearchResultOpen opens the note but skips scrolling without a match block", () => {
    const { result, openNote } = setup();
    result.current.handleSearchResultOpen("n1", null);
    expect(openNote).toHaveBeenCalledWith("n1");
    // No throw even though no block ref exists
    vi.advanceTimersByTime(2000);
  });
});
