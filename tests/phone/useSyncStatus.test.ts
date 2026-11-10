/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncStatus } from "../../src/sync/syncStatus";

let api: Record<string, unknown> = {};
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import { SYNCING_SHOWS_AFTER_MS, useSyncStatus } from "../../src/phone/useSyncStatus";

const status = (state: SyncStatus["state"], problems: SyncStatus["problems"] = []): SyncStatus => ({
  state,
  folder: state === "off" ? null : "Personal",
  lastSynced: 1000,
  problems,
});

/** The phone's sync, whose state the test sets. */
function fakeSync(first: SyncStatus) {
  let current = first;
  const listeners = new Set<(s: SyncStatus) => void>();
  const sync = {
    status: () => current,
    subscribe: (listener: (s: SyncStatus) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncNow: vi.fn(),
    signInAgain: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  };
  const set = (next: SyncStatus) =>
    act(() => {
      current = next;
      for (const listener of listeners) listener(next);
    });
  return { sync, set };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  api = {};
});

describe("sync's state on Home", () => {
  it("is nothing where nothing syncs", () => {
    const { result } = renderHook(() => useSyncStatus({ showToast: vi.fn() }));
    expect(result.current).toBeNull();
  });

  it("shows syncing at once before the first pass settles", () => {
    api = { sync: fakeSync(status("syncing")).sync };
    const { result } = renderHook(() => useSyncStatus({ showToast: vi.fn() }));
    expect(result.current?.status.state).toBe("syncing");
  });

  it("never shows a quick pass as syncing", () => {
    const { sync, set } = fakeSync(status("synced"));
    api = { sync };
    const { result } = renderHook(() => useSyncStatus({ showToast: vi.fn() }));
    set(status("syncing"));
    act(() => vi.advanceTimersByTime(SYNCING_SHOWS_AFTER_MS - 100));
    expect(result.current?.status.state).toBe("synced");
    set(status("synced"));
    act(() => vi.advanceTimersByTime(SYNCING_SHOWS_AFTER_MS));
    expect(result.current?.status.state).toBe("synced");
  });

  it("shows a slow pass as syncing", () => {
    const { sync, set } = fakeSync(status("synced"));
    api = { sync };
    const { result } = renderHook(() => useSyncStatus({ showToast: vi.fn() }));
    set(status("syncing"));
    act(() => vi.advanceTimersByTime(SYNCING_SHOWS_AFTER_MS));
    expect(result.current?.status.state).toBe("syncing");
  });

  it("tells of a new problem once, with what to do, and of its end", () => {
    const { sync, set } = fakeSync(status("synced"));
    api = { sync };
    const showToast = vi.fn();
    renderHook(() => useSyncStatus({ showToast }));
    set(status("offline"));
    expect(showToast).not.toHaveBeenCalled();

    const signedOut = status("problem", [{ kind: "signed-out" }]);
    set(signedOut);
    expect(showToast).toHaveBeenCalledTimes(1);
    const [text, kind, options] = showToast.mock.calls[0];
    expect(text).toMatch(/sign-in has expired/);
    expect(kind).toBe("warning");
    expect(options).toMatchObject({ key: "sync", action: { label: "Sign in again" } });
    options.action.run();
    expect(sync.signInAgain).toHaveBeenCalled();

    set({ ...signedOut, lastSynced: 2000 }); // the same problem, seen by another pass
    expect(showToast).toHaveBeenCalledTimes(1);

    set(status("synced"));
    expect(showToast).toHaveBeenCalledTimes(2);
    expect(showToast.mock.calls[1]).toEqual(["Synced again", "done", { key: "sync" }]);
  });

  it("names a held-back file and offers no button that can't help", () => {
    const { sync, set } = fakeSync(status("synced"));
    api = { sync };
    const showToast = vi.fn();
    renderHook(() => useSyncStatus({ showToast }));
    set(status("problem", [{ kind: "too-large", path: "Trip.mov" }]));
    const [text, , options] = showToast.mock.calls[0];
    expect(text).toContain("“Trip.mov” is over 150 MB");
    expect(options.action).toBeUndefined();
  });

  it("tells nothing of disconnecting from a problem, and a connect starts the telling afresh", () => {
    const { sync, set } = fakeSync(status("problem", [{ kind: "signed-out" }]));
    api = { sync };
    const showToast = vi.fn();
    renderHook(() => useSyncStatus({ showToast }));
    expect(showToast).toHaveBeenCalledTimes(1);
    set(status("off"));
    expect(showToast).toHaveBeenCalledTimes(1);
    set(status("syncing"));
    set(status("synced"));
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe("connecting and disconnecting from Home", () => {
  it("says nothing when the sign-in page is closed, and why when the connect fails", async () => {
    const { sync } = fakeSync(status("off"));
    api = { sync };
    const showToast = vi.fn();
    const { result } = renderHook(() => useSyncStatus({ showToast }));
    sync.connect.mockRejectedValueOnce(
      Object.assign(new Error("the page was closed"), { name: "SignInCancelled" }),
    );
    await act(() => result.current?.connect());
    expect(showToast).not.toHaveBeenCalled();
    sync.connect.mockRejectedValueOnce(new Error("Dropbox is down"));
    await act(() => result.current?.connect());
    expect(showToast).toHaveBeenCalledWith(
      "Couldn't connect to Dropbox: Dropbox is down",
      "warning",
      { key: "sync" },
    );
  });

  it("says the notes stay on the phone after a disconnect", async () => {
    const { sync } = fakeSync(status("synced"));
    api = { sync };
    const showToast = vi.fn();
    const { result } = renderHook(() => useSyncStatus({ showToast }));
    await act(() => result.current?.disconnect());
    expect(sync.disconnect).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "Dropbox disconnected. Your notes stay on this phone.",
      "done",
      { key: "sync" },
    );
  });
});

describe("moving the notes to a folder, from Home", () => {
  const hook = (moveToFolder: unknown, flushAll = vi.fn()) => {
    api = { sync: fakeSync(status("off")).sync, moveToFolder };
    const showToast = vi.fn();
    const { result } = renderHook(() => useSyncStatus({ showToast, flushAll }));
    return { result, showToast, flushAll };
  };

  it("is not offered where the notes are already in a folder", () => {
    expect(hook(undefined).result.current?.moveToFolder).toBeUndefined();
  });

  it("hands over the editor's flush, to run once a folder is taken", async () => {
    const move = vi.fn(async (saved: () => Promise<unknown>) => {
      await saved();
      return "moving";
    });
    const { result, showToast, flushAll } = hook(move);
    await act(async () => result.current?.moveToFolder?.());
    expect(flushAll).toHaveBeenCalledOnce();
    expect(showToast).not.toHaveBeenCalled();
  });

  it("says why a folder was not taken, and nothing when the picker was left", async () => {
    for (const [answer, said] of [
      ["not-empty", /Choose an empty folder/],
      ["refused", /on this phone/],
      ["cancelled", null],
    ] as const) {
      const { result, showToast, flushAll } = hook(vi.fn(async () => answer));
      await act(async () => result.current?.moveToFolder?.());
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
    const { result, showToast } = hook(
      vi.fn(async () => {
        throw new Error("A note is still being saved. Try again in a moment.");
      }),
    );
    await act(async () => result.current?.moveToFolder?.());
    expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/Couldn't move your notes: A note is still being saved/),
      "warning",
      expect.anything(),
    );
  });
});
