/** @vitest-environment jsdom */
/**
 * What a notification is decides how long it stays. A receipt of something that
 * went well fades; anything the user may still have to act on waits to be
 * dismissed, because a timer on a save failure is a save failure nobody saw.
 * Notices about one condition share a key, so two failing saves are one problem
 * on screen and the receipt that saving works again is what ends it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { DONE_MS, toastPersists, useToast } from "../../src/hooks/useToast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useToast", () => {
  it("a receipt fades on its own; every other kind waits", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast("Moved to the Trash", "done");
      result.current.showToast("Kept in a copy", "notice");
      result.current.showToast("Storage may be full", "warning");
      result.current.showToast("Could not write");
    });
    expect(result.current.toasts.map((t) => t.kind)).toEqual([
      "done",
      "notice",
      "warning",
      "error",
    ]);

    act(() => {
      vi.advanceTimersByTime(DONE_MS + 10);
    });
    expect(result.current.toasts.map((t) => t.kind)).toEqual(["notice", "warning", "error"]);

    // And they are still there much later.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.toasts).toHaveLength(3);
    expect(toastPersists("done")).toBe(false);
    expect(["notice", "warning", "error"].every((k) => toastPersists(k as "notice"))).toBe(true);
  });

  it("a keyed notice replaces the one before it, whatever its kind", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast("Failed to save Note A", "error", { key: "save" });
      result.current.showToast("Failed to save Note B", "error", { key: "save" });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe("Failed to save Note B");

    // The receipt under the same key is what ends the failure notice, and it
    // fades like any receipt.
    act(() => {
      result.current.showToast("Saved", "done", { key: "save" });
    });
    expect(result.current.toasts.map((t) => t.kind)).toEqual(["done"]);
    act(() => {
      vi.advanceTimersByTime(DONE_MS + 10);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("an unkeyed notice stacks, and carries the glyph it was given", () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("One", "notice");
      result.current.showToast("Two", "notice");
      result.current.showToast("Trashed", "done", { icon: "trash" });
    });
    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts[2].icon).toBe("trash");
  });

  it("dismissing one takes that one, by the id it was given", () => {
    const { result } = renderHook(() => useToast());
    let id: number | undefined;
    act(() => {
      id = result.current.showToast("First", "notice");
      result.current.showToast("Second", "notice");
    });
    act(() => {
      result.current.dismissToast(id as number);
    });
    expect(result.current.toasts.map((t) => t.message)).toEqual(["Second"]);
  });

  it("a receipt dismissed early leaves no timer behind to fire into a later test", () => {
    const { result } = renderHook(() => useToast());
    let id: number | undefined;
    act(() => {
      id = result.current.showToast("Moved to the Trash", "done");
    });
    act(() => {
      result.current.dismissToast(id as number);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unmounting clears every pending timer", () => {
    const { result, unmount } = renderHook(() => useToast());
    act(() => {
      result.current.showToast("A", "done");
      result.current.showToast("B", "done");
    });
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
