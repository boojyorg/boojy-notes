/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncStatus } from "../../src/sync/syncStatus";

let api: Record<string, unknown> = {};
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import { SYNCING_SHOWS_AFTER_MS, useSyncStatus } from "../../src/phone/useSyncStatus";

const status = (state: SyncStatus["state"], problems: SyncStatus["problems"] = []): SyncStatus => ({
  state,
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
});
