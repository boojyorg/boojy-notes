/**
 * The history follows what is open, and starts again on a switch of storage
 * location: but the location arriving at startup, after the last session's
 * note has opened, is no switch, and that note stays the list's first.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNoteHistory } from "../../src/hooks/useNoteHistory";

afterEach(cleanup);

const mount = (current: string | null, resetKey: unknown) =>
  renderHook(
    (p) => useNoteHistory({ open: () => {}, restoreHere: () => {}, exists: () => true, ...p }),
    {
      initialProps: { current, resetKey },
    },
  );

describe("useNoteHistory", () => {
  it("keeps the note open at startup when the storage location arrives after it", () => {
    const h = mount("first", null);
    h.rerender({ current: "first", resetKey: "/vault" });
    h.rerender({ current: "second", resetKey: "/vault" });
    expect(h.result.current.canBack).toBe(true);
  });

  it("starts again from the open note on a switch of storage location", () => {
    const h = mount("a", "/one");
    h.rerender({ current: "b", resetKey: "/one" });
    h.rerender({ current: "c", resetKey: "/two" });
    expect(h.result.current.canBack).toBe(false);
    h.rerender({ current: "d", resetKey: "/two" });
    expect(h.result.current.canBack).toBe(true);
  });

  it("steps across a heading jump in the open note by putting the place back, opening nothing", () => {
    const open = vi.fn();
    const restoreHere = vi.fn();
    const h = renderHook((p) => useNoteHistory({ open, restoreHere, exists: () => true, ...p }), {
      initialProps: { current: "a" as string | null, resetKey: "/v" },
    });
    const linkPlace = { top: { id: "b1", top: 0 }, caret: null };
    act(() => h.result.current.recordPlace("a", linkPlace));
    act(() => h.result.current.jump("a"));
    expect(h.result.current.canBack).toBe(true);
    act(() => h.result.current.back());
    expect(restoreHere).toHaveBeenCalledWith(linkPlace);
    expect(open).not.toHaveBeenCalled();
    expect(h.result.current.canForward).toBe(true);
    act(() => h.result.current.forward());
    expect(restoreHere).toHaveBeenLastCalledWith(null);
    // The next real opening is recorded, not swallowed by a step's guard.
    h.rerender({ current: "b", resetKey: "/v" });
    expect(h.result.current.canBack).toBe(true);
    act(() => h.result.current.back());
    expect(open).toHaveBeenCalledWith("a");
  });
});
