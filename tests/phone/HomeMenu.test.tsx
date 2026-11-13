/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../../src/context/ThemeContext";
import HomeMenu, { ASKED_TURNS_MS, DONE_SHOWS_MS } from "../../src/phone/HomeMenu";
import { syncLine } from "../../src/phone/syncWords";
import type { PhoneSync } from "../../src/phone/useSyncStatus";
import type { SyncStatus } from "../../src/sync/syncStatus";
import { SORT_ALPHA, SORT_RECENT } from "../../src/utils/noteSort";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const OFF: SyncStatus = {
  state: "off",
  folder: null,
  lastSynced: null,
  problems: [],
  progress: null,
};
const SYNCED: SyncStatus = { ...OFF, state: "synced", folder: "Personal" };
const sync = (status: SyncStatus = OFF): PhoneSync => ({
  status,
  choosing: null,
  syncNow: vi.fn(),
  signInAgain: vi.fn(async () => {}),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
});
const ANCHOR = { top: 10, bottom: 54, left: 300, right: 344 };

const menu = (s: PhoneSync | null, sortMode = SORT_RECENT) => {
  const calls = {
    setSortMode: vi.fn(),
    onNewFolder: vi.fn(),
    onSettings: vi.fn(),
    onClose: vi.fn(),
  };
  const ui = (next: PhoneSync | null) => (
    <ThemeProvider>
      <HomeMenu anchor={ANCHOR} name="Personal" sync={next} sortMode={sortMode} {...calls} />
    </ThemeProvider>
  );
  const view = render(ui(s));
  return { ...calls, rerender: (next: PhoneSync | null) => view.rerender(ui(next)) };
};
const rows = (role: string) => screen.getAllByRole(role).map((el) => el.textContent);

// Everything on Home that is not done every day, in one place and one order.
describe("Home's menu", () => {
  it("reads top to bottom: where the notes are and how sync is, New folder, the two orders, Settings", () => {
    menu(sync(SYNCED));
    expect(rows("menuitem")).toEqual(["PersonalSynced", "New folder", "Settings"]);
    expect(rows("menuitemradio")).toEqual(["Most recent", "Alphabetical"]);
    expect(
      screen.getAllByRole("menuitemradio").map((el) => el.getAttribute("aria-checked")),
    ).toEqual(["true", "false"]);
  });

  it("makes a folder, and opens Settings, closing first", () => {
    const m = menu(sync(SYNCED));
    fireEvent.click(screen.getByTestId("home-new-folder"));
    expect(m.onNewFolder).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("home-open-settings"));
    expect(m.onSettings).toHaveBeenCalledOnce();
    expect(m.onClose).toHaveBeenCalledTimes(2);
  });

  // The menu covers the list on a phone: closing is what shows the new order.
  it("an order chosen is set and the menu closes, as the desktop's Sort menu does", () => {
    const m = menu(sync(SYNCED));
    fireEvent.click(screen.getByText("Alphabetical"));
    expect(m.setSortMode).toHaveBeenCalledWith(SORT_ALPHA);
    expect(m.onClose).toHaveBeenCalledOnce();
  });
});

describe("the location's row", () => {
  it("syncs now on a tap, and the menu stays for its answer", () => {
    const s = sync(SYNCED);
    const m = menu(s);
    fireEvent.click(screen.getByTestId("home-sync"));
    expect(s.syncNow).toHaveBeenCalledOnce();
    expect(m.onClose).not.toHaveBeenCalled();
  });

  // Sync shows as working only once a pass has run a while: a quick one would
  // leave the tap looking dead.
  it("answers a tap even when the pass is too quick to show: the arrows turn, then the tick", () => {
    vi.useFakeTimers();
    menu(sync(SYNCED));
    fireEvent.click(screen.getByTestId("home-sync"));
    expect(screen.getByTestId("home-sync-arrows").className).toBe("sync-turning");
    act(() => {
      vi.advanceTimersByTime(ASKED_TURNS_MS);
    });
    expect(screen.getByTestId("home-sync-done")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(DONE_SHOWS_MS);
    });
    expect(screen.getByTestId("home-sync-arrows").className).toBe("");
  });

  it("leads to Settings for a problem only the person can fix, where the file is named", () => {
    const s = sync({
      ...SYNCED,
      state: "problem",
      problems: [{ kind: "refused", path: "a?.md" }],
    });
    const m = menu(s);
    expect(screen.getByTestId("home-sync").textContent).toBe("PersonalSee Settings to fix");
    fireEvent.click(screen.getByTestId("home-sync"));
    expect(m.onSettings).toHaveBeenCalledOnce();
    expect(m.onClose).toHaveBeenCalledOnce();
    expect(s.syncNow).not.toHaveBeenCalled();
  });

  it("signs in again when that is what is wrong, under the warning glyph", () => {
    const s = sync({ ...SYNCED, state: "problem", problems: [{ kind: "signed-out" }] });
    menu(s);
    expect(screen.getByTestId("home-sync").textContent).toBe("PersonalSign in again");
    expect(screen.getByTestId("home-sync-problem")).toBeTruthy();
    fireEvent.click(screen.getByTestId("home-sync"));
    expect(s.signInAgain).toHaveBeenCalledOnce();
    expect(s.syncNow).not.toHaveBeenCalled();
  });

  // Nothing to do about sync with no Dropbox: words, not a row that does nothing.
  it("with no Dropbox is words alone: the name and that the notes are on this phone", () => {
    menu(sync());
    expect(screen.queryByTestId("home-sync")).toBeNull();
    expect(screen.getByTestId("home-location").textContent).toBe("PersonalOn this phone only");
    expect(rows("menuitem")).toEqual(["New folder", "Settings"]);
  });

  it("is words alone where nothing syncs at all", () => {
    menu(null);
    expect(screen.getByTestId("home-location").textContent).toBe("PersonalOn this phone only");
  });

  // A first sync of a full Dropbox takes minutes: turning arrows and a count say it is working.
  it("turns its arrows while a pass runs, counting more than one file", () => {
    const syncing = (progress: SyncStatus["progress"]): SyncStatus => ({
      ...SYNCED,
      state: "syncing",
      progress,
    });
    menu(sync(syncing({ done: 34, total: 180 })));
    expect(screen.getByTestId("home-sync").textContent).toBe("PersonalSyncing… 34 of 180");
    expect(screen.getByTestId("home-sync-arrows").className).toBe("sync-turning");
    cleanup();
    menu(sync(syncing({ done: 0, total: 1 })));
    expect(screen.getByTestId("home-sync").textContent).toBe("PersonalSyncing…");
    cleanup();
    menu(sync(SYNCED));
    expect(screen.getByTestId("home-sync-arrows").className).toBe("");
  });

  it("ends a pass seen running with a tick, for a moment, then the arrows again", () => {
    vi.useFakeTimers();
    const m = menu(sync({ ...SYNCED, state: "syncing" }));
    expect(screen.queryByTestId("home-sync-done")).toBeNull();
    m.rerender(sync(SYNCED));
    expect(screen.getByTestId("home-sync-done")).toBeTruthy();
    expect(screen.queryByTestId("home-sync-arrows")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(DONE_SHOWS_MS);
    });
    expect(screen.queryByTestId("home-sync-done")).toBeNull();
    expect(screen.getByTestId("home-sync-arrows")).toBeTruthy();
  });

  // Opened on a location already synced: no pass was seen, so nothing to tick.
  it("shows no tick for a sync it did not see end", () => {
    menu(sync(SYNCED));
    expect(screen.queryByTestId("home-sync-done")).toBeNull();
  });
});

describe("sync in a few words", () => {
  it("says the state, or what the tap will do about it", () => {
    expect(syncLine(OFF)).toBe("On this phone only");
    expect(syncLine(SYNCED)).toBe("Synced");
    expect(syncLine({ ...SYNCED, state: "offline" })).toBe("Can't reach Dropbox");
    expect(syncLine({ ...SYNCED, state: "problem", problems: [{ kind: "signed-out" }] })).toBe(
      "Sign in again",
    );
    expect(
      syncLine({ ...SYNCED, state: "problem", problems: [{ kind: "failing", message: "x" }] }),
    ).toBe("Couldn't sync");
    // No retry mends a file Dropbox won't take: Settings says which, and what to do.
    expect(
      syncLine({ ...SYNCED, state: "problem", problems: [{ kind: "refused", path: "a?.md" }] }),
    ).toBe("See Settings to fix");
    const at = new Date();
    at.setHours(9, 42, 0, 0);
    expect(syncLine({ ...SYNCED, lastSynced: at.getTime() })).toMatch(/^Synced .*9.42/);
  });
});
