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

  describe("the storage locations", () => {
    const ROWS = [
      { id: "main", name: "Phone", named: false, open: true, dropbox: null, phone: null },
      { id: "work", name: "Work", named: true, open: false, dropbox: "Team", phone: null },
    ];
    const withLocations = (over: Record<string, unknown> = {}) => {
      const locations = {
        list: vi.fn(async () => ROWS),
        open: vi.fn(async (_id: string, saved: () => Promise<unknown>) => {
          await saved();
        }),
        add: vi.fn(async () => "added"),
        ...over,
      };
      return { locations, ...hook({ locations }) };
    };

    it("are listed once, and none where the app has none (a browser)", async () => {
      expect(hook({}).result.current.locations).toEqual([]);
      const { result } = withLocations();
      await act(async () => {});
      expect(result.current.locations).toEqual(ROWS);
    });

    // Read after the first frame, Home's heading said "Phone" and Settings had no list for a moment.
    it("starts with the list the app's start read", () => {
      const { result } = withLocations({ listed: ROWS });
      expect(result.current.locations).toEqual(ROWS);
    });

    it("writes the editor's waiting edits before another is opened", async () => {
      const { result, locations, flushAll } = withLocations();
      await act(async () => {
        expect(await result.current.openLocation("work")).toBe(true);
      });
      expect(locations.open).toHaveBeenCalledWith("work", expect.any(Function));
      expect(flushAll).toHaveBeenCalledOnce();
    });

    // The open location stays open: the list is read again, and nothing starts again.
    it("adds a folder as one, reads the list again, and says why a folder was not taken", async () => {
      for (const [answer, said] of [
        ["added", /^Location added$/],
        ["cancelled", null],
        ["in-use", /Another storage location/],
        ["refused", /on this phone/],
      ] as const) {
        const { result, locations, showToast, flushAll } = withLocations({
          add: vi.fn(async () => answer),
        });
        await act(async () => {});
        await act(async () => {
          await result.current.addLocation();
        });
        expect(locations.list).toHaveBeenCalledTimes(2);
        expect(flushAll).not.toHaveBeenCalled();
        if (said) expect(showToast.mock.calls[0][0]).toMatch(said);
        else expect(showToast).not.toHaveBeenCalled();
        cleanup();
      }
    });

    // Neither starts the app again: the list is read afresh, so Home and Settings follow.
    it("renames or removes one, then reads the list again", async () => {
      const rename = vi.fn(async () => {});
      const remove = vi.fn(async () => {
        throw new Error("The open storage location can't be removed");
      });
      const { result, locations, showToast } = withLocations({ rename, remove });
      await act(async () => {});
      expect(locations.list).toHaveBeenCalledTimes(1);
      await act(async () => {
        expect(await result.current.renameLocation("work", "Journal")).toBe(true);
      });
      expect(rename).toHaveBeenCalledWith("work", "Journal");
      expect(locations.list).toHaveBeenCalledTimes(2);
      await act(async () => {
        expect(await result.current.removeLocation("main")).toBe(false);
      });
      expect(showToast).toHaveBeenCalledWith(
        "Couldn't remove it: The open storage location can't be removed",
        "warning",
        { key: "storage-location" },
      );
      expect(locations.list).toHaveBeenCalledTimes(3);
    });

    it("says why when it can't, and stays where it is", async () => {
      const { result, showToast } = withLocations({
        open: vi.fn(async () => {
          throw new Error("A note is still being saved. Try again in a moment.");
        }),
      });
      await act(async () => {
        expect(await result.current.openLocation("work")).toBe(false);
      });
      expect(showToast).toHaveBeenCalledWith(
        "Couldn't switch: A note is still being saved. Try again in a moment.",
        "warning",
        { key: "storage-location" },
      );
    });
  });

  it("says why a folder was not taken, and nothing when the picker was left", async () => {
    for (const [answer, said] of [
      ["not-empty", /Choose an empty folder/],
      ["refused", /on this phone/],
      ["in-use", /Another storage location/],
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
