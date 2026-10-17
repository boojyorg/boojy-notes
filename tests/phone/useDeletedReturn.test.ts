/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/platform", () => ({ isPhone: true }));

import { useDeletedReturn } from "../../src/phone/useDeletedReturn";

afterEach(cleanup);

/** Home with the list open; `look` stands for a row's note being read and shown. */
function setup() {
  const calls = {
    showHome: vi.fn(),
    showNote: vi.fn(),
    setListOpen: vi.fn(),
    closePreview: vi.fn(),
  };
  const props = { previewing: false, homeShowing: true, activeNote: "n1" as string | null };
  const hook = renderHook((p: typeof props) => useDeletedReturn({ ...p, ...calls }), {
    initialProps: props,
  });
  const set = (next: Partial<typeof props>) => {
    Object.assign(props, next);
    hook.rerender({ ...props });
  };
  const look = () => {
    hook.result.current.chose();
    set({ previewing: true });
    set({ homeShowing: false });
  };
  return { calls, set, look, hook };
}

describe("a deleted note looked at on the phone", () => {
  it("shows on the note's screen, and leaving it goes back to Home with the list open", () => {
    const { calls, set, look } = setup();
    look();
    expect(calls.setListOpen).toHaveBeenLastCalledWith(false);
    expect(calls.showNote).toHaveBeenCalled();
    // Back (Escape) or its menu's Close ends the look.
    set({ previewing: false });
    expect(calls.showHome).toHaveBeenCalled();
    expect(calls.setListOpen).toHaveBeenLastCalledWith(true);
  });

  it("deleted for good while on screen: back to Home with the list open", () => {
    const { calls, set, look } = setup();
    look();
    calls.setListOpen.mockClear();
    // The note leaves the list, and useRecentlyDeleted drops the look.
    set({ previewing: false });
    expect(calls.setListOpen).toHaveBeenCalledWith(true);
  });

  it("Home (the ‹) ends the look, which then opens the list", () => {
    const { calls, set, look } = setup();
    look();
    set({ homeShowing: true });
    expect(calls.closePreview).toHaveBeenCalled();
    set({ previewing: false });
    expect(calls.setListOpen).toHaveBeenLastCalledWith(true);
  });

  it("restored: the note opens, and the list does not come back", () => {
    const { calls, set, look, hook } = setup();
    look();
    hook.result.current.restoring();
    set({ previewing: false, activeNote: "restored" });
    expect(calls.showHome).not.toHaveBeenCalled();
    expect(calls.setListOpen).not.toHaveBeenCalledWith(true);
  });

  it("a restore that failed keeps the way back", () => {
    const { calls, set, look, hook } = setup();
    look();
    const undo = hook.result.current.restoring();
    undo();
    set({ previewing: false });
    expect(calls.setListOpen).toHaveBeenLastCalledWith(true);
  });

  it("another note opened ends the look on that note, not on Home", () => {
    const { calls, set, look } = setup();
    look();
    set({ activeNote: "other" });
    set({ previewing: false });
    expect(calls.showHome).not.toHaveBeenCalled();
  });
});
