/**
 * The history follows what is open, and starts again on a switch of storage
 * location: but the location arriving at startup, after the last session's
 * note has opened, is no switch, and that note stays the list's first.
 */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useNoteHistory } from "../../src/hooks/useNoteHistory";

afterEach(cleanup);

const mount = (current: string | null, resetKey: unknown) =>
  renderHook((p) => useNoteHistory({ open: () => {}, exists: () => true, ...p }), {
    initialProps: { current, resetKey },
  });

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
});
