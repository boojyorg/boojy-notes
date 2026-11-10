/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let api: Record<string, unknown> = {};
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import { usePhoneStorage } from "../../src/phone/usePhoneStorage";

afterEach(() => {
  cleanup();
  api = {};
});

describe("where the phone keeps its notes, for Settings", () => {
  const hook = (over: Record<string, unknown>, flushAll = vi.fn()) => {
    api = over;
    const showToast = vi.fn();
    const { result } = renderHook(() => usePhoneStorage({ showToast, flushAll }));
    return { result, showToast, flushAll };
  };

  // It rode on sync's state once: with none, a folder read as "inside the app".
  it("names the folder whether or not anything syncs, and offers no move from one", () => {
    const { result } = hook({ notesFolder: "Documents/Boojy Notes" });
    expect(result.current.notesFolder).toBe("Documents/Boojy Notes");
    expect(result.current.moveToFolder).toBeUndefined();
  });

  it("is inside the app with no folder", () => {
    expect(hook({ moveToFolder: vi.fn() }).result.current.notesFolder).toBeNull();
  });

  it("hands over the editor's flush, to run once a folder is taken", async () => {
    const move = vi.fn(async (saved: () => Promise<unknown>) => {
      await saved();
      return "moving";
    });
    const { result, showToast, flushAll } = hook({ moveToFolder: move });
    await act(async () => result.current.moveToFolder?.());
    expect(flushAll).toHaveBeenCalledOnce();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("says why a folder was not taken, and nothing when the picker was left", async () => {
    for (const [answer, said] of [
      ["not-empty", /Choose an empty folder/],
      ["refused", /on this phone/],
      ["cancelled", null],
    ] as const) {
      const { result, showToast, flushAll } = hook({ moveToFolder: vi.fn(async () => answer) });
      await act(async () => result.current.moveToFolder?.());
      if (said)
        expect(showToast).toHaveBeenCalledWith(
          expect.stringMatching(said),
          "notice",
          expect.anything(),
        );
      else expect(showToast).not.toHaveBeenCalled();
      expect(flushAll).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("says a move that could not start", async () => {
    const { result, showToast } = hook({
      moveToFolder: vi.fn(async () => {
        throw new Error("A note is still being saved. Try again in a moment.");
      }),
    });
    await act(async () => result.current.moveToFolder?.());
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/Couldn't move your notes: A note is still being saved/),
      "warning",
      expect.anything(),
    );
  });
});
