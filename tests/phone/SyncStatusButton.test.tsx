/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SyncStatusButton from "../../src/components/SyncStatusButton";
import { ThemeProvider } from "../../src/context/ThemeContext";
import type { PhoneSync } from "../../src/phone/useSyncStatus";
import type { SyncStatus } from "../../src/sync/syncStatus";

afterEach(cleanup);

const OFF: SyncStatus = {
  state: "off",
  folder: null,
  lastSynced: null,
  problems: [],
  progress: null,
};
const sync = (status: SyncStatus = OFF): PhoneSync => ({
  status,
  choosing: null,
  syncNow: vi.fn(),
  signInAgain: vi.fn(async () => {}),
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
});
const openMenu = (s: PhoneSync, onOpenSettings = vi.fn()) => {
  render(
    <ThemeProvider>
      <SyncStatusButton name="Phone" sync={s} onOpenSettings={onOpenSettings} />
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByTestId("sync-status"));
  return onOpenSettings;
};
const items = () => screen.getAllByRole("menuitem").map((el) => el.textContent);

// A first sync of a full Dropbox takes minutes: a count says it is working.
describe("a long sync", () => {
  const syncing = (progress: SyncStatus["progress"]): SyncStatus => ({
    ...OFF,
    state: "syncing",
    folder: "Personal",
    progress,
  });

  it("counts the files on Home's heading and in words, but not for one file", () => {
    openMenu(sync(syncing({ done: 34, total: 180 })));
    expect(screen.getByTestId("sync-status").textContent).toBe("Phone34 of 180");
    expect(screen.getByText("Syncing with Dropbox… 34 of 180 files")).toBeTruthy();
    cleanup();
    openMenu(sync(syncing({ done: 0, total: 1 })));
    expect(screen.getByTestId("sync-status").textContent).toBe("Phone");
    expect(screen.getByText("Syncing with Dropbox…")).toBeTruthy();
  });
});

// Connecting, disconnecting and moving the notes are Settings': one way to each.
describe("sync's menu on Home", () => {
  it("with no Dropbox, says so and leads to Settings alone", () => {
    const onOpenSettings = openMenu(sync());
    expect(screen.getByText(/Dropbox not connected/)).toBeTruthy();
    expect(items()).toEqual(["Storage and sync…"]);
    fireEvent.click(screen.getByText("Storage and sync…"));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("connected, offers Sync now and Settings", () => {
    const s = sync({ state: "synced", folder: "Personal", lastSynced: null, problems: [] });
    openMenu(s);
    expect(items()).toEqual(["Sync now", "Storage and sync…"]);
    fireEvent.click(screen.getByText("Sync now"));
    expect(s.syncNow).toHaveBeenCalledOnce();
  });
});
